// File: src/app/speak/page.tsx
// This is the UPDATED speaker page. It now shows the local speaker,
// a grid of other speakers, and a count of the audience.

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
import { useState } from "react";

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
  onLeave,
}: {
  connectionData: AgoraConnectionData;
  onLeave: () => void;
}) {
  const { appId, channel, token, uid } = connectionData;

  // Hooks to manage local media tracks
  const { localMicrophoneTrack } = useLocalMicrophoneTrack();
  const { localCameraTrack } = useLocalCameraTrack();

  // Hook to join the channel
  useJoin({ appid: appId, channel, token, uid });

  // Hook to publish the local tracks
  usePublish([localMicrophoneTrack, localCameraTrack]);

  // Hook to get the list of all remote users
  const remoteUsers = useRemoteUsers();

  // **KEY CHANGE**: Filter users into speakers and audience
  const otherSpeakers = remoteUsers.filter((user) => user.hasVideo);
  const audienceCount = remoteUsers.filter((user) => !user.hasVideo).length;

  return (
    <div className="flex flex-col h-full">
      {/* Top section with main speaker video and audience count */}
      <div className="flex-grow w-full h-3/5 p-4 relative">
        <div className="w-full h-full bg-black rounded-lg overflow-hidden border-2 border-blue-500">
          <p className="absolute top-2 left-2 z-10 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
            Your View
          </p>
          <LocalVideoTrack
            track={localCameraTrack}
            play={true}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute top-6 right-6 bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg">
          <p className="font-semibold text-lg">Audience: {audienceCount}</p>
        </div>
      </div>

      {/* **KEY CHANGE**: Bottom section with a grid of other speakers */}
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
    </div>
  );
}

// The main page component that wraps everything
export default function SpeakPage() {
  const [connectionData, setConnectionData] =
    useState<AgoraConnectionData | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

  const joinCall = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/agora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "publisher" }), // Ensure role is publisher
      });
      if (!response.ok)
        throw new Error(
          `Failed to fetch Agora token: ${await response.text()}`
        );
      const data: AgoraConnectionData = await response.json();
      setConnectionData(data);
      setIsCallActive(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setLoading(false);
    }
  };

  const leaveCall = () => {
    setIsCallActive(false);
    setConnectionData(null);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-2 md:p-8 bg-gray-950 text-white">
      <div className="w-full h-full md:h-[90vh] max-w-6xl bg-gray-900 rounded-xl shadow-2xl overflow-hidden">
        <h1 className="text-2xl md:text-3xl font-bold p-4 text-center bg-gray-800">
          Speaker Broadcast Room
        </h1>
        <div className="h-[calc(100%-68px)]">
          {isCallActive && connectionData ? (
            <AgoraRTCProvider client={client}>
              <SpeakerRoom
                connectionData={connectionData}
                onLeave={leaveCall}
              />
            </AgoraRTCProvider>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              {loading && <p className="text-xl">Joining...</p>}
              {error && <p className="text-xl text-red-500">Error: {error}</p>}
              {!loading && (
                <>
                  <p className="text-lg">You are not currently broadcasting.</p>
                  <button
                    onClick={joinCall}
                    className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-white font-bold text-xl">
                    Start Broadcast
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
