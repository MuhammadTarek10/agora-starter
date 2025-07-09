"use client";

import AgoraRTC, {
  AgoraRTCProvider,
  LocalVideoTrack,
  RemoteUser,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
} from "agora-rtc-react";
import { useEffect, useState } from "react";

// Define the type for the connection data we'll get from our API
interface AgoraConnectionData {
  appId: string;
  channel: string;
  token: string;
  uid: number;
}

// Component that handles the core video room logic
function SpeakerRoom({
  connectionData,
}: {
  connectionData: AgoraConnectionData;
}) {
  const { appId, channel, token, uid } = connectionData;

  // --- State for Recording ---
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  // Hooks to manage local media tracks
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(true); // Start with mic enabled
  const { localCameraTrack } = useLocalCameraTrack(true); // Start with camera enabled

  useJoin({ appid: appId, channel, token, uid });
  usePublish([localMicrophoneTrack, localCameraTrack]);
  const remoteUsers = useRemoteUsers();

  const otherSpeakers = remoteUsers.filter((user) => user.hasVideo);
  const audienceCount = remoteUsers.filter((user) => !user.hasVideo).length;

  // --- Recording Handler Functions ---
  const handleRecording = async (action: "start" | "stop") => {
    setIsProcessingRecording(true);
    setRecordingError(null);
    try {
      const response = await fetch("/api/agora/recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} recording.`);
      }
      setIsRecording(action === "start");
      console.log(`Recording action '${action}' successful:`, data);
    } catch (err) {
      setRecordingError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
      console.error(err);
    } finally {
      setIsProcessingRecording(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top section with main speaker video and audience count */}
      <div className="flex-grow w-full h-3/5 p-4 relative">
        <div className="w-full h-full bg-black rounded-lg overflow-hidden border-2 border-blue-500">
          <p className="absolute top-2 left-2 z-10 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
            Your View
          </p>
          {/* Recording Indicator */}
          {isRecording && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-md">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              REC
            </div>
          )}
          <LocalVideoTrack
            track={localCameraTrack}
            play={true}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute top-14 right-6 bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg">
          <p className="font-semibold text-lg">Audience: {audienceCount}</p>
        </div>
      </div>

      {/* Bottom section with a grid of other speakers */}
      <div className="w-full h-2/5 p-4 border-t-2 border-gray-800">
        <h3 className="text-lg font-semibold mb-2 text-gray-300">
          Other Speakers ({otherSpeakers.length})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 h-[calc(100%-36px)]">
          {otherSpeakers.length > 0 ? (
            otherSpeakers.map((user) => (
              <div
                key={user.uid}
                className="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden">
                <RemoteUser
                  user={user}
                  playVideo={true}
                  playAudio={true}
                  className="w-full h-full object-cover"
                />
              </div>
            ))
          ) : (
            <div className="col-span-full flex items-center justify-center text-gray-500">
              <p>Waiting for other speakers to join...</p>
            </div>
          )}
        </div>
      </div>

      {/* **REMOVED**: All manual media and leave controls have been removed. */}
      {/* Recording controls remain as requested. */}
      <div className="flex justify-center items-center flex-wrap gap-4 p-4 bg-gray-900 border-t border-gray-700">
        {!isRecording ? (
          <button
            onClick={() => handleRecording("start")}
            disabled={isProcessingRecording}
            className="px-4 py-2 rounded-lg font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:cursor-not-allowed">
            {isProcessingRecording ? "Starting..." : "Start Recording"}
          </button>
        ) : (
          <button
            onClick={() => handleRecording("stop")}
            disabled={isProcessingRecording}
            className="px-4 py-2 rounded-lg font-semibold bg-red-600 hover:bg-red-500 disabled:bg-red-900 disabled:cursor-not-allowed">
            {isProcessingRecording ? "Stopping..." : "Stop Recording"}
          </button>
        )}
        {recordingError && (
          <p className="w-full text-center text-red-400 mt-2">
            Recording Error: {recordingError}
          </p>
        )}
      </div>
    </div>
  );
}

// The main page component that wraps everything
export default function SpeakPage() {
  const [connectionData, setConnectionData] =
    useState<AgoraConnectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

  useEffect(() => {
    const joinCall = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/agora", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "publisher" }),
        });
        if (!response.ok)
          throw new Error(
            `Failed to fetch Agora token: ${await response.text()}`
          );
        const data: AgoraConnectionData = await response.json();
        setConnectionData(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
      } finally {
        setLoading(false);
      }
    };
    joinCall();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-2 md:p-8 bg-gray-950 text-white">
      <div className="w-full h-full md:h-[90vh] max-w-6xl bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
        <h1 className="text-2xl md:text-3xl font-bold p-4 text-center bg-gray-800">
          Speaker Broadcast Room
        </h1>
        <div className="h-[calc(100%-68px)]">
          {loading && (
            <p className="text-xl text-center p-8">Joining Broadcast...</p>
          )}
          {error && (
            <p className="text-xl text-red-500 text-center p-8">
              Error: {error}
            </p>
          )}
          {connectionData ? (
            <AgoraRTCProvider client={client}>
              <SpeakerRoom connectionData={connectionData} />
            </AgoraRTCProvider>
          ) : (
            !loading && (
              <p className="text-xl text-center p-8">
                Could not connect to the broadcast room.
              </p>
            )
          )}
        </div>
      </div>
    </main>
  );
}
