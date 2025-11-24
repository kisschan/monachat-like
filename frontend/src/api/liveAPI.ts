import axios from "axios";

const API_HOST = import.meta.env.VITE_APP_API_HOST; // 既に使っているやつと同じ

export async function fetchLiveStatus(roomId: string, token: string) {
  const encoded = encodeURIComponent(roomId);
  const res = await axios.get(`${API_HOST}api/live/${encoded}/status`, {
    headers: { "X-Monachat-Token": token },
  });
  return res.data;
}

export async function startLive(roomId: string, token: string) {
  const encoded = encodeURIComponent(roomId);
  const res = await axios.post(
    `${API_HOST}api/live/${encoded}/start`,
    {},
    {
      headers: { "X-Monachat-Token": token },
    },
  );
  return res.data;
}

export async function stopLive(roomId: string, token: string) {
  const encoded = encodeURIComponent(roomId);
  const res = await axios.post(
    `${API_HOST}api/live/${encoded}/stop`,
    {},
    {
      headers: { "X-Monachat-Token": token },
    },
  );
  return res.data;
}
