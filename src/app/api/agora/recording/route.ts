import { NextRequest, NextResponse } from "next/server";

const NESTJS_BACKEND_URL =
  process.env.NESTJS_BACKEND_URL || "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, channelName } = body;

    if (!action || !channelName) {
      return NextResponse.json(
        { error: "Action and channelName are required." },
        { status: 400 }
      );
    }

    let targetUrl: string;
    if (action === "start") {
      targetUrl = `${NESTJS_BACKEND_URL}/api/v1/agora/recording/start`;
    } else if (action === "stop") {
      targetUrl = `${NESTJS_BACKEND_URL}/api/v1/agora/recording/stop`;
    } else {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelName, mode: "mix" }), // Pass channelName to the backend
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || `Failed to ${action} recording.` },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error(`Error in /api/agora/recording:`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
