import { RtcRole, RtcTokenBuilder } from "agora-token";
import { NextRequest, NextResponse } from "next/server";

// --- Environment Variables ---
// You MUST set these in your .env.local file
const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

// This is the name of the channel all your speakers will join.
// In a real app, this might be dynamic, but for now, we'll use a fixed name.
const CHANNEL_NAME = "the-main-event-stream";

export async function POST(request: NextRequest) {
  // Validate that environment variables are set
  if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
    console.error("Agora App ID or Certificate is not set in .env.local");
    return NextResponse.json(
      { error: "Agora credentials are not configured on the server." },
      { status: 500 }
    );
  }

  try {
    // A unique identifier for the user. In a real app, this would come from your
    // authentication system (e.g., a user ID from your database).
    // Using a random number for this example. It must be a number or a string that parses to a number.
    const uid = Math.floor(Math.random() * 100000);

    // Tokens are valid for a specific period. 1 hour is a common value.
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // The role determines what the user can do. 'publisher' can send video/audio.
    const body = await request.json().catch(() => ({}));
    const role =
      body.role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    console.log(
      `Generating Agora token for user ${uid} in channel ${CHANNEL_NAME}`
    );

    // Generate the token using the Agora library
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      CHANNEL_NAME,
      uid,
      role,
      expirationTimeInSeconds,
      privilegeExpiredTs
    );

    // Return the token and other necessary info to the client
    return NextResponse.json(
      {
        token: token,
        appId: AGORA_APP_ID,
        channel: CHANNEL_NAME,
        uid: uid,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error generating Agora token:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
