import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
// The 'stream/web' module is needed for type casting response.body.
// import { ReadableStream, TransformStream } from "stream/web";

// Initialize Supabase client
// Ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set in your environment variables.
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

let recordingSid: string | null = null;

// It's a good practice to define constants for event types
// based on the Agora documentation.
const EventType = {
  RECORDER_STARTED: 40,
  UPLOADED: 31,
  BACKUPED: 32, // File is ready on Agora's backup server. THIS IS THE TRIGGER.
  UPLOADING_PROGRESS: 33,
  POSTPONE_TRANSCODE_FINAL_RESULT: 1001,
};

/**
 * API route handler for POST requests from Agora Webhooks.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log(
      `[INFO] Webhook received. EventType: ${body.eventType}, SID: ${body.payload?.sid}`
    );

    const signature = request.headers.get("Agora-Signature");
    if (!signature) {
      console.warn("[WARN] Signature missing from webhook request.");
    }
    // ... add signature validation logic here ...

    switch (body.eventType) {
      case EventType.RECORDER_STARTED:
        console.log(`[INFO] Recording started for SID: ${body.payload.sid}`);
        recordingSid = body.payload.sid;
        break;

      case EventType.BACKUPED:
        console.log(
          `[INFO] Recording backup complete for SID: ${recordingSid}. Starting upload to Supabase.`
        );
        processAndUploadRecording(body.payload).catch((err) => {
          console.error(
            `[ERROR] Unhandled error during webhook processing for SID: ${recordingSid}.`,
            err
          );
        });
        break;

      case EventType.UPLOADED:
        console.log(
          `[INFO] Files for SID ${body.payload.sid} have been uploaded to your configured third-party storage.`
        );
        break;

      case EventType.UPLOADING_PROGRESS:
        if (body.payload?.details?.progress) {
          const progress = body.payload.details.progress / 100;
          console.log(
            `[INFO] Agora upload progress for SID ${
              body.payload.sid
            }: ${progress.toFixed(2)}%`
          );
        }
        break;

      case EventType.POSTPONE_TRANSCODE_FINAL_RESULT:
        console.log(
          `[INFO] Postponed transcode finished for SID: ${body.payload.sid}. You can now process these files.`
        );
        break;

      default:
        console.log(
          `[INFO] Received unhandled eventType: ${body.eventType} for SID: ${body.payload?.sid}`
        );
        break;
    }

    return NextResponse.json(
      { message: "Webhook received and is being processed." },
      { status: 200 }
    );
  } catch (error) {
    console.error("[ERROR] Failed to process webhook:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

/**
 * Downloads the recording from Agora and streams it to Supabase Storage with progress logging.
 */
async function processAndUploadRecording(payload: any) {
  const { sid, cname } = payload;
  if (!sid) {
    console.warn(`[WARN] SID missing in payload.`);
    return;
  }

  let fileList = payload.details?.fileList;

  // If fileList is missing or empty from the webhook, try the Query API as a fallback.
  if (!fileList || fileList.length === 0) {
    console.warn(
      `[WARN] fileList is empty in the webhook for SID: ${sid}. Attempting to fetch via Query API.`
    );
    fileList = await getRecordingFilesFromQueryAPI(sid, cname);
    if (!fileList) {
      console.error(
        `[ERROR] Failed to retrieve fileList from Query API for SID: ${sid}. Aborting upload.`
      );
      return;
    }
  }

  const fileListArray = Array.isArray(fileList) ? fileList : [fileList];
  const mp4FileObject = fileListArray.find((file: any) =>
    (file.fileName || file.filename || "").endsWith(".mp4")
  );

  if (!mp4FileObject) {
    console.warn(
      `[WARN] No MP4 file found for SID: ${sid}. File list:`,
      JSON.stringify(fileListArray)
    );
    return;
  }

  const filename = mp4FileObject.fileName || mp4FileObject.filename;
  const downloadUrl = mp4FileObject.downloadUrl;

  if (!downloadUrl) {
    console.error(
      `[ERROR] The file object for SID ${sid} does not contain a 'downloadUrl'. File object: ${JSON.stringify(
        mp4FileObject
      )}`
    );
    return;
  }

  console.log(`[INFO] Processing file: ${filename} for SID: ${sid}`);

  const response = await fetch(downloadUrl);
  if (!response.ok || !response.body) {
    console.error(
      `[ERROR] Failed to download file from Agora for SID: ${sid}. Status: ${response.status}`
    );
    throw new Error(`Failed to download file from Agora: ${filename}`);
  }

  const totalSize = Number(response.headers.get("content-length")) || 0;
  let uploadedBytes = 0;
  let lastLoggedPercentage = -1;

  const progressStream = new TransformStream({
    transform(chunk, controller) {
      uploadedBytes += chunk.length;
      if (totalSize > 0) {
        const percentage = Math.floor((uploadedBytes / totalSize) * 100);
        if (percentage >= lastLoggedPercentage + 5) {
          console.log(
            `[PROGRESS] Downloading to server for SID ${sid}: ${uploadedBytes} / ${totalSize} bytes (${percentage}%)`
          );
          lastLoggedPercentage = percentage;
        }
      }
      controller.enqueue(chunk);
    },
  });

  const uploadStream = response.body.pipeThrough(progressStream);
  const readableNodeStream = Readable.fromWeb(uploadStream as any);
  const supabasePath = `${sid}/${filename}`;
  const bucketName = process.env.SUPABASE_RECORDINGS_BUCKET_NAME;

  if (!bucketName) {
    console.error(
      "[ERROR] SUPABASE_RECORDINGS_BUCKET_NAME environment variable is not set."
    );
    throw new Error("Supabase bucket name is not configured.");
  }

  console.log(`[INFO] Uploading to Supabase at path: ${supabasePath}`);
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(supabasePath, readableNodeStream, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) {
    console.error(`[ERROR] Supabase upload failed for SID: ${sid}.`, error);
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const finalSizeMB = (uploadedBytes / (1024 * 1024)).toFixed(2);
  console.log(
    `[SUCCESS] Successfully uploaded ${filename} (${finalSizeMB} MB) to Supabase for SID: ${sid}. Path: ${data.path}`
  );
}

/**
 * Fetches the recording file list from Agora's Query API.
 * This is a robust fallback for when webhook payloads don't contain the file list.
 * @param {string} sid - The recording session ID.
 * @param {string} cname - The channel name.
 * @returns {Promise<any[] | null>} A promise that resolves to the file list array or null.
 */
async function getRecordingFilesFromQueryAPI(
  sid: string,
  cname: string
): Promise<any[] | null> {
  // IMPORTANT: You must store the resourceId when you call the 'acquire' endpoint to start the recording.
  // Here, you would fetch it from your database using the sid or cname.
  const resourceId = await getResourceIdForSession(sid);
  if (!resourceId) {
    console.error(
      `[ERROR] Could not find resourceId for SID: ${sid}. Cannot query Agora API.`
    );
    return null;
  }

  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  const mode = "mix"; // Or 'individual' depending on your recording mode

  if (!appId || !customerId || !customerSecret) {
    console.error(
      "[ERROR] Agora API credentials (AGORA_APP_ID, AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET) are not set in environment variables."
    );
    return null;
  }

  const queryUrl = `https://api.agora.io/v1/apps/${appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/${mode}/query`;
  const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString(
    "base64"
  );

  console.log(`[INFO] Querying Agora API for file list for SID: ${sid}`);
  try {
    const response = await fetch(queryUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[ERROR] Failed to query Agora API for SID: ${sid}. Status: ${response.status}. Response: ${errorText}`
      );
      return null;
    }

    const data = await response.json();

    // The file list from the query API is under `serverResponse.fileList`
    if (data.serverResponse && data.serverResponse.fileList) {
      console.log(
        `[INFO] Successfully retrieved fileList from Query API for SID: ${sid}`
      );
      return data.serverResponse.fileList;
    } else {
      console.warn(
        `[WARN] Query API response for SID ${sid} did not contain a fileList.`,
        data
      );
      return null;
    }
  } catch (error) {
    console.error(
      `[ERROR] Exception while querying Agora API for SID: ${sid}`,
      error
    );
    return null;
  }
}

/**
 * [PLACEHOLDER] Retrieves the stored resourceId for a given recording session.
 * YOU MUST IMPLEMENT THIS FUNCTION.
 * @param {string} sid - The recording session ID.
 * @returns {Promise<string | null>} The resourceId or null if not found.
 */
async function getResourceIdForSession(sid: string): Promise<string | null> {
  // TODO: Implement this function to retrieve the stored resourceId for the SID from your database (e.g., Supabase).
  // You would have saved this resourceId when you called the /acquire endpoint to start the recording.
  console.log(
    `[TODO] Implement this function to retrieve the stored resourceId for SID: ${sid} from your database.`
  );

  // Example implementation with Supabase:
  /*
    const { data, error } = await supabase
      .from('recordings') // your table name
      .select('resource_id') // your column name
      .eq('sid', sid)
      .single();

    if (error || !data) {
        console.error(`[DB_ERROR] Could not find resource_id for sid ${sid}`, error);
        return null;
    }
    return data.resource_id;
    */

  // Returning a dummy value for now. Replace this with your actual database lookup.
  return "8j7vMUXkKfQXGLiwHRgEE5ebUH1mfCCJwloA6dTT3hj1Xx85OWB-ZhrpNDxNzG_gG-0oGlgC76LcccXLKooD51pvoi-3JW7qA8kL0diwR8dDgXgRlvJSWLBvfYAOtVOnGtH-TozP0KFZWFZykg9BT_iAconbhvcuAoh90lW-YG-2iCsZ7pRq1W0iJOu03Nr54yOr0xm8LZG_VXGj11WEs_nH3UgG3L2tOOADzB03Tgc";
}
