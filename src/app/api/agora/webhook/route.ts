import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { ReadableStream } from "stream/web";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

export async function POST(request: NextRequest) {
  const body = await request.json();
  console.log(`Webhook received: [${JSON.stringify(body)}]`);

  return NextResponse.json({ message: "Webhook received" }, { status: 200 });

  const signature = request.headers.get("Agora-Signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature missing" }, { status: 400 });
  }

  if (body.eventType === "") {
    await processWebhook(body.payload);
  }

  return NextResponse.json({ message: "Webhook received" }, { status: 200 });
}

async function processWebhook(payload: any) {
  const { sid } = payload;
  if (!payload.details) {
    console.warn(`No details in webhook for SID: ${sid}`);
    return;
  }

  const { fileList } = payload.details;
  if (!fileList) {
    console.warn(`No fileList in webhook for SID: ${sid}`);
    return;
  }

  // Typically, for mix mode, there's one main M3U8 and one MP4 file. We want the MP4.
  const mp4File = fileList.find((file: any) => file.fileName.endsWith(".mp4"));
  if (!mp4File) {
    console.warn(`No MP4 file found in webhook for SID: ${sid}`);
    return;
  }

  const { fileName, downloadUrl } = mp4File;
  console.log(`Processing file: ${fileName}`);

  // Download the file from Agora's backup
  const response = await fetch(downloadUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download file from Agora: ${fileName}`);
  }

  // Stream the download directly to Supabase Storage to avoid high memory usage
  const readableStream = Readable.fromWeb(response.body as ReadableStream);
  const supabasePath = `${process.env.SUPABASE_RECORDINGS_BUCKET_NAME}/${sid}/${fileName}`;

  console.log(`Uploading to Supabase at: ${supabasePath}`);
  const { data, error } = await supabase.storage
    .from(process.env.SUPABASE_RECORDINGS_BUCKET_NAME!)
    .upload(supabasePath, readableStream, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  console.log(`Successfully uploaded to Supabase: ${data.path}`);
}
