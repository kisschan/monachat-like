import axios from "axios";

export type WebrtcConfigResponse = {
  whipUrl: string;
  whepUrl: string;
};

export async function fetchWebrtcConfig(
  roomId: string,
  token: string,
): Promise<WebrtcConfigResponse> {
  const encodedRoom = encodeURIComponent(roomId);
  const base = import.meta.env.VITE_APP_API_HOST; // 既存のAPIと同じ

  const res = await axios.get<WebrtcConfigResponse>(
    `${base}api/live/${encodedRoom}/webrtc-config`,
    {
      headers: {
        "X-Monachat-Token": token,
      },
    },
  );

  return res.data;
}
