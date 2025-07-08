// File 2: src/app/stream/page.tsx
// This is the UPDATED audience page. It now only shows speakers.

"use client";

import AgoraRTC, {
  AgoraRTCProvider,
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  RemoteUser,
  useJoin,
  useRemoteUsers,
} from "agora-rtc-react";
import { useEffect, useMemo, useState } from "react";

// Define the type for the connection data we'll get from our API
interface AgoraConnectionData {
  appId: string;
  channel: string;
  token: string;
  uid: number;
}

// The main component for the audience view.
function AudienceView({
  connectionData,
}: {
  connectionData: AgoraConnectionData;
}) {
  const client: IAgoraRTCClient = useMemo(
    () => AgoraRTC.createClient({ mode: "rtc", codec: "vp8" }),
    []
  );

  return (
    <AgoraRTCProvider client={client}>
      <VideoGrid connectionData={connectionData} />
    </AgoraRTCProvider>
  );
}

// Component that handles the actual video grid and logic
function VideoGrid({
  connectionData,
}: {
  connectionData: AgoraConnectionData;
}) {
  const { appId, channel, token, uid } = connectionData;
  const [featuredUser, setFeaturedUser] = useState<IAgoraRTCRemoteUser | null>(
    null
  );

  useJoin({ appid: appId, channel, token, uid });
  const remoteUsers = useRemoteUsers();

  // **KEY CHANGE**: Filter remote users to only include those who are publishing video.
  // This effectively identifies them as "speakers".
  const speakers = remoteUsers.filter((user) => user.hasVideo);

  // Adjust the grid logic to work with the filtered 'speakers' list
  const gridSpeakers = featuredUser
    ? speakers.filter((u) => u.uid !== featuredUser.uid)
    : speakers;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Featured Speaker Area */}
      {featuredUser && (
        <div className="flex-grow w-full h-3/5 p-2 relative">
          <div className="w-full h-full bg-black rounded-lg overflow-hidden">
            <RemoteUser
              user={featuredUser}
              playVideo={true}
              playAudio={true}
              className="w-full h-full object-contain"
            />
            <button
              onClick={() => setFeaturedUser(null)}
              className="absolute top-4 right-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full z-10 hover:bg-opacity-75 transition-opacity">
              Back to Grid
            </button>
          </div>
        </div>
      )}

      {/* Main Grid Area */}
      <div
        className={`flex-grow p-2 grid gap-2 ${
          featuredUser ? "h-2/5" : "h-full"
        } grid-cols-2 md:grid-cols-3`}>
        {gridSpeakers.map((user) => (
          <div
            key={user.uid}
            className="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden cursor-pointer group"
            onClick={() => setFeaturedUser(user)}>
            <RemoteUser
              user={user}
              playVideo={true}
              playAudio={true}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center transition-all duration-300">
              <p className="text-white text-lg font-bold opacity-0 group-hover:opacity-100">
                View Speaker {user.uid}
              </p>
            </div>
          </div>
        ))}
        {/* Display a message if no speakers are present */}
        {speakers.length === 0 && !featuredUser && (
          <div className="col-span-2 md:col-span-3 flex items-center justify-center text-gray-500">
            <p>Waiting for speakers to join the stream...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// The main page component that fetches data and renders the view.
export default function StreamPage() {
  const [connectionData, setConnectionData] =
    useState<AgoraConnectionData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConnectionData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/agora", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "subscriber" }),
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
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchConnectionData();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <div className="w-full h-screen">
        <h1 className="text-2xl md:text-3xl font-bold p-4 text-center bg-gray-800 absolute top-0 left-0 right-0 z-20">
          Live Event Stream
        </h1>
        <div className="pt-20 h-full">
          {loading && (
            <p className="text-xl text-center p-8">Connecting to stream...</p>
          )}
          {error && (
            <p className="text-xl text-red-500 text-center p-8">
              Error: {error}
            </p>
          )}
          {connectionData && <AudienceView connectionData={connectionData} />}
        </div>
      </div>
    </main>
  );
}
