import axios from "axios";

import { joinUrl } from "./url";

export type WebrtcConfigResponse = {
  role: "publisher" | "viewer";
  whipUrl?: string;
  whepUrl: string;
  expiresAt?: number;
};

export async function fetchWebrtcConfig(
  roomId: string,
  token: string,
): Promise<WebrtcConfigResponse> {
  const encodedRoom = encodeURIComponent(roomId);
  const base = import.meta.env.VITE_APP_API_HOST; // 既存のAPIと同じ

  const res = await axios.get<WebrtcConfigResponse>(
    joinUrl(base, "api", "live", encodedRoom, "webrtc-config"),
    {
      headers: {
        "X-Monachat-Token": token,
      },
    },
  );

  return res.data;
}
