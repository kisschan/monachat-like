import axios from "axios";

import { joinUrl } from "./url";

const API_HOST = import.meta.env.VITE_APP_API_HOST; // 既に使っているやつと同じ

export type LiveStatusResponse = {
  isLive: boolean;
  publisherId: string | null;
  publisherName: string | null;
  audioOnly: boolean;
};

export async function fetchLiveStatus(roomId: string, token: string): Promise<LiveStatusResponse> {
  const encodedRoom = encodeURIComponent(roomId);
  const res = await axios.get<LiveStatusResponse>(
    joinUrl(import.meta.env.VITE_APP_API_HOST, "api", "live", encodedRoom, "status"),
    {
      headers: { "X-Monachat-Token": token },
    },
  );
  return res.data;
}
export async function startLive(roomId: string, token: string, audioOnly: boolean): Promise<void> {
  const base = import.meta.env.VITE_APP_API_HOST;
  await axios.post(
    joinUrl(base, "api", "live", encodeURIComponent(roomId), "start"),
    { audioOnly }, // ★ body に渡す
    {
      headers: { "X-Monachat-Token": token },
    },
  );
}
export async function stopLive(roomId: string, token: string) {
  const encoded = encodeURIComponent(roomId);
  const res = await axios.post(
    joinUrl(API_HOST, "api", "live", encoded, "stop"),
    {},
    {
      headers: { "X-Monachat-Token": token },
    },
  );
  return res.data;
}

export type WebRTCConfigResponse = {
  role: "publisher" | "viewer";
  whipUrl?: string;
  whepUrl: string;
  expiresAt?: number;
};

export async function fetchWebRTCConfig(
  roomId: string,
  token: string,
): Promise<WebRTCConfigResponse> {
  const res = await axios.get(
    joinUrl(API_HOST, "api", "live", encodeURIComponent(roomId), "webrtc-config"),
    {
      headers: { "X-Monachat-Token": token },
    },
  );
  return res.data;
}
