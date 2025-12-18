import { waitForIceGatheringComplete } from "./ice";

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

const toOptionalNonEmpty = (s: string): string | undefined => {
  const t = s.trim();
  return t.length > 0 ? t : undefined;
};

export type WhipPublishHandle = {
  stop: () => Promise<void>;
};

export type WhipPublishOptions = {
  audioOnly?: boolean;
};

class WhipRequestError extends Error {
  status: number;
  body?: string;

  constructor(status: number, body?: string) {
    super(`WHIP POST failed: status=${status}${body != null ? ` body=${body}` : ""}`);
    this.status = status;
    this.body = body;
  }
}

export class MediaAcquireError extends Error {
  code: "permission-denied" | "no-device" | "constraint-failed" | "unknown";

  constructor(code: MediaAcquireError["code"], message?: string) {
    super(message);
    this.code = code;
  }
}

async function getLocalMediaStream(audioOnly: boolean): Promise<MediaStream> {
  const primaryConstraints: MediaStreamConstraints = audioOnly
    ? { audio: true, video: false }
    : {
        audio: true,
        video: {
          width: 1280,
          height: 720,
        },
      };

  try {
    return await navigator.mediaDevices.getUserMedia(primaryConstraints);
  } catch (e: unknown) {
    if (e instanceof DOMException) {
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        throw new MediaAcquireError("permission-denied", e.message);
      }
      if (e.name === "NotFoundError") {
        throw new MediaAcquireError("no-device", e.message);
      }
      if (e.name === "OverconstrainedError") {
        throw new MediaAcquireError("constraint-failed", e.message);
      }
    }

    throw new MediaAcquireError("unknown", e instanceof Error ? e.message : String(e));
  }
}

export async function startWhipPublish(
  whipUrl: string,
  options: WhipPublishOptions = {},
): Promise<WhipPublishHandle> {
  const audioOnly = options.audioOnly === true;

  let localStream: MediaStream | null = null;
  let pc: RTCPeerConnection | null = null;
  let stopped = false;
  let resourceUrl: string | null = null;

  try {
    // 1. メディア取得
    localStream = await getLocalMediaStream(audioOnly);

    // 2. RTCPeerConnection 準備
    pc = new RTCPeerConnection({
      iceServers: [], // SRS ICE-lite 前提なら空でOK
    });

    localStream.getTracks().forEach((track) => {
      pc?.addTrack(track, localStream as MediaStream);
    });

    const offer = await pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc, 3000);

    // 3. WHIP エンドポイントに SDP を送信
    const res = await fetch(whipUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
      },
      body: pc.localDescription?.sdp ?? offer.sdp ?? "",
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new WhipRequestError(res.status, toOptionalNonEmpty(bodyText));
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
      ? new URL(locationHeader, whipUrl).toString()
      : whipUrl;

    const stop = async () => {
      if (stopped) return;
      stopped = true;
      try {
        if (resourceUrl !== null && resourceUrl !== "") {
          await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
        }
      } finally {
        pc?.close();
        localStream?.getTracks().forEach((t) => t.stop());
      }
    };

    return { stop };
  } catch (e) {
    if (!stopped && resourceUrl != null) {
      await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
    }
    pc?.close();
    localStream?.getTracks().forEach((t) => t.stop());
    throw e;
  }
}
