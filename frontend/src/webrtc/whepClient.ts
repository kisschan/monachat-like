export type WhepSubscribeHandle = {
  stop: () => Promise<void>;
};

export type WhepSubscribeOptions = {
  audioOnly?: boolean;
};

export class WhepRequestError extends Error {
  status: number;
  body?: string;

  constructor(status: number, body?: string) {
    super(`WHEP POST failed: status=${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function startWhepSubscribe(
  whepUrl: string,
  videoEl: HTMLVideoElement,
  options: WhepSubscribeOptions = {},
): Promise<WhepSubscribeHandle> {
  const pc = new RTCPeerConnection({ iceServers: [] });

  let remoteStream: MediaStream | null = null;

  pc.ontrack = (event) => {
    const stream = event.streams[0] ?? null;
    if (!stream) return;

    remoteStream = stream;
    videoEl.srcObject = remoteStream;
  };

  const audioOnly = options.audioOnly === true;

  // ★ ここだけ audioOnly で分岐
  if (audioOnly) {
    // 音声のみ: audio の recvonly transceiver だけ
    pc.addTransceiver("audio", { direction: "recvonly" });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  } else {
    // 映像＋音声
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pc.setLocalDescription(offer);
  }

  // 以降は共通：WHEP に SDP を投げる
  const res = await fetch(whepUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
      Accept: "application/sdp",
    },
    body: pc.localDescription?.sdp ?? "",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(audioOnly ? "WHEP error (audioOnly)" : "WHEP error", res.status, text);
    throw new Error(`WHEP POST failed${audioOnly ? " (audioOnly)" : ""}: status=${res.status}`);
  }

  const answerSdp = await res.text();
  await pc.setRemoteDescription(
    new RTCSessionDescription({
      type: "answer",
      sdp: answerSdp,
    }),
  );

  // ★ Location ヘッダ（無ければ fallback として whepUrl 自体）
  const resourceUrl = res.headers.get("Location") ?? whepUrl;

  const stop = async () => {
    try {
      await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
    } finally {
      pc.close();

      if (remoteStream) {
        remoteStream.getTracks().forEach((t) => t.stop());
        remoteStream = null;
      }

      if (videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    }
  };

  return { stop };
}
