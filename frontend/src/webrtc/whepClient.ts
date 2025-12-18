import { waitForIceGatheringComplete } from "./ice";

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

const toOptionalNonEmpty = (s: string): string | undefined => {
  const t = s.trim();
  return t.length > 0 ? t : undefined;
};

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

    // 以降は共通：WHEP に SDP を投げる
    const res = await fetch(whepUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        Accept: "application/sdp",
      },
      body: pc.localDescription?.sdp ?? offer.sdp ?? "",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(audioOnly ? "WHEP error (audioOnly)" : "WHEP error", res.status, text);
      throw new WhepRequestError(res.status, toOptionalNonEmpty(text));
    }

    const answerSdp = await res.text();
    await pc.setRemoteDescription(
      new RTCSessionDescription({
        type: "answer",
        sdp: answerSdp,
      }),
    );

    const locationHeader = res.headers.get("Location");
    resourceUrl = isNonEmptyString(locationHeader)
      ? new URL(locationHeader, whepUrl).toString()
      : whepUrl;

    return { stop };
  } catch (e) {
    await stop();
    throw e;
  }
}
