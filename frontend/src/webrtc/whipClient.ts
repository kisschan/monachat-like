export type WhipPublishHandle = {
  stop: () => Promise<void>;
};

export type WhipPublishOptions = {
  audioOnly?: boolean;
};

export async function startWhipPublish(
  whipUrl: string,
  options: WhipPublishOptions = {},
): Promise<WhipPublishHandle> {
  const audioOnly = options.audioOnly === true;

  // 1. メディア取得
  const constraints: MediaStreamConstraints = audioOnly
    ? { audio: true, video: false }
    : {
        audio: true,
        video: {
          width: 1280,
          height: 720,
        },
      };

  const localStream = await navigator.mediaDevices.getUserMedia(constraints);

  // 2. RTCPeerConnection 準備
  const pc = new RTCPeerConnection({
    iceServers: [], // SRS ICE-lite 前提なら空でOK
  });

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  const offer = await pc.createOffer({
    offerToReceiveAudio: false,
    offerToReceiveVideo: false,
  });
  await pc.setLocalDescription(offer);

  // 3. WHIP エンドポイントに SDP を送信
  const res = await fetch(whipUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
    },
    body: offer.sdp ?? "",
  });

  if (!res.ok) {
    pc.close();
    localStream.getTracks().forEach((t) => t.stop());
    throw new Error(`WHIP POST failed: status=${res.status}`);
  }

  const answerSdp = await res.text();
  await pc.setRemoteDescription(
    new RTCSessionDescription({
      type: "answer",
      sdp: answerSdp,
    }),
  );

  const resourceUrl = res.headers.get("Location") ?? whipUrl;

  const stop = async () => {
    try {
      // WHIP セッション削除
      await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
    } finally {
      pc.close();
      localStream.getTracks().forEach((t) => t.stop());
    }
  };

  return { stop };
}
