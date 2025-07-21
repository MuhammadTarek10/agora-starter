// File: src/app/api/agora/recording/route.ts
// This is the UPDATED API route with the fix for the "task conflict" error.

import { RtcRole, RtcTokenBuilder } from "agora-token";
import { NextRequest, NextResponse } from "next/server";

// --- Environment Variables ---
const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;
const AGORA_CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID;
const AGORA_CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET;

const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
const AWS_S3_BUCKET_REGION = process.env.AWS_S3_BUCKET_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const CHANNEL_NAME = "the-main-event-stream";
const RECORDER_UID = "999999";

// In-memory state for the recording session. This now acts as our single source of truth.
let recordingState = {
  resourceId: null as string | null,
  sid: null as string | null,
};

// --- Main POST Handler ---
export async function POST(request: NextRequest) {
  // --- 1. Validate Credentials ---
  const requiredCreds = [
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    AGORA_CUSTOMER_ID,
    AGORA_CUSTOMER_SECRET,
    AWS_S3_BUCKET_NAME,
    AWS_S3_BUCKET_REGION,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
  ];

  if (requiredCreds.some((cred) => !cred)) {
    console.error(
      "One or more required environment variables for Agora/AWS are not set."
    );
    return NextResponse.json(
      { error: "Recording service is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { action } = body;
    const authHeader = `Basic ${Buffer.from(
      `${AGORA_CUSTOMER_ID}:${AGORA_CUSTOMER_SECRET}`
    ).toString("base64")}`;
    const agoraApiBaseUrl = `https://api.agora.io/v1/apps/${AGORA_APP_ID}/cloud_recording`;

    if (action === "start") {
      // --- **LOGICAL FIX**: Check if a recording is already in progress ---
      if (recordingState.resourceId && recordingState.sid) {
        console.log("Start command received, but recording is already active.");
        return NextResponse.json({
          success: true,
          message: "Recording is already in progress.",
        });
      }

      // --- If not recording, proceed to start a new session ---
      const acquireResponse = await fetch(`${agoraApiBaseUrl}/acquire`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          cname: CHANNEL_NAME,
          uid: RECORDER_UID,
          clientRequest: {},
        }),
      });
      const acquireData = await acquireResponse.json();
      if (!acquireResponse.ok)
        throw new Error(`Agora Acquire Error: ${JSON.stringify(acquireData)}`);

      const tokenExpiry = Math.floor(Date.now() / 1000) + 3600;
      const privilegeExpiry = Math.floor(Date.now() / 1000) + 3600;

      const resourceId = acquireData.resourceId;

      const token = RtcTokenBuilder.buildTokenWithUid(
        AGORA_APP_ID!,
        AGORA_APP_CERTIFICATE!,
        CHANNEL_NAME,
        0,
        RtcRole.SUBSCRIBER,
        tokenExpiry,
        privilegeExpiry
      );

      const startResponse = await fetch(
        `${agoraApiBaseUrl}/resourceid/${resourceId}/mode/mix/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({
            cname: CHANNEL_NAME,
            uid: RECORDER_UID,
            clientRequest: {
              token: token,
              storageConfig: {
                vendor: 1,
                region: parseInt(AWS_S3_BUCKET_REGION!),
                bucket: AWS_S3_BUCKET_NAME,
                accessKey: AWS_ACCESS_KEY_ID,
                secretKey: AWS_SECRET_ACCESS_KEY,
              },
              recordingConfig: {
                channelType: 1,
                streamTypes: 2,
                audioProfile: 1,
                videoStreamType: 0,
                transcodingConfig: {
                  width: 1920,
                  height: 1080,
                  fps: 30,
                  bitrate: 6000,
                },
                subscribeVideoUids: [],
                subscribeAudioUids: [],
              },
            },
          }),
        }
      );

      const startData = await startResponse.json();
      if (!startResponse.ok)
        throw new Error(`Agora Start Error: ${JSON.stringify(startData)}`);

      // **CRITICAL**: Save the state of the new recording session
      recordingState = { resourceId: resourceId, sid: startData.sid };

      console.log(`Successfully started recording. SID: ${startData.sid}`);
      return NextResponse.json({
        success: true,
        message: "Recording started.",
        data: startData,
      });
    } else if (action === "stop") {
      if (!recordingState.resourceId || !recordingState.sid) {
        return NextResponse.json(
          { error: "No active recording found to stop." },
          { status: 400 }
        );
      }

      const stopResponse = await fetch(
        `${agoraApiBaseUrl}/resourceid/${recordingState.resourceId}/sid/${recordingState.sid}/mode/mix/stop`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({
            cname: CHANNEL_NAME,
            uid: RECORDER_UID,
            clientRequest: {},
          }),
        }
      );

      const stopData = await stopResponse.json();
      if (!stopResponse.ok)
        throw new Error(`Agora Stop Error: ${JSON.stringify(stopData)}`);

      console.log("Successfully stopped recording.", stopData);
      // **CRITICAL**: Clear the state after stopping
      recordingState = { resourceId: null, sid: null };
      return NextResponse.json({
        success: true,
        message: "Recording stopped.",
        data: stopData,
      });
    } else {
      return NextResponse.json(
        { error: "Invalid action specified." },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error with Agora Cloud Recording:", error);
    // If an error occurs, reset the state to be safe
    recordingState = { resourceId: null, sid: null };
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
