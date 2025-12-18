import { waitForIceGatheringComplete } from "./ice";
import { requireCreatedSdpWithLocation } from "./webRTChelper";

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
    super(`WHEP POST failed: status=${status}${body != null ? ` body=${body}` : ""}`);
    this.status = status;
    this.body = body;
  }
}

export async function startWhepSubscribe(
  whepUrl: string,
  mediaEl: HTMLMediaElement,
  options: WhepSubscribeOptions = {},
): Promise<WhepSubscribeHandle> {
  const pc = new RTCPeerConnection({ iceServers: [] });

  let remoteStream: MediaStream | null = null;
  let stopped = false;
  let resourceUrl: string | null = null;

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      if (resourceUrl !== null && resourceUrl !== "") {
        await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
      }
    } finally {
      pc.close();
      if (remoteStream) {
        remoteStream.getTracks().forEach((t) => t.stop());
        remoteStream = null;
      }

      if (mediaEl.srcObject) {
        mediaEl.srcObject = null;
      }
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0] ?? null;
    if (!stream) return;

    remoteStream = stream;
    mediaEl.srcObject = remoteStream;
    mediaEl.play().catch(() => {
      // autoplay 失敗は UI 側で扱う前提
    });
  };

  try {
    const audioOnly = options.audioOnly === true;

    if (!audioOnly) {
      pc.addTransceiver("video", { direction: "recvonly" });
    }
    pc.addTransceiver("audio", { direction: "recvonly" });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc, 3000);

    const res = await fetch(whepUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        Accept: "application/sdp",
      },
      body: pc.localDescription?.sdp ?? offer.sdp ?? "",
    });

    const { resourceUrl: createdResourceUrl, answerSdp } = await requireCreatedSdpWithLocation(
      res,
      whepUrl,
      "whep",
    );

    resourceUrl = createdResourceUrl;

    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerSdp }));

    return { stop };
  } catch (e) {
    await stop();
    throw e;
  }
}
