import { waitForIceGatheringComplete } from "./ice";
import { requireCreatedSdpWithLocation } from "./webRTChelper";

export type WhipPublishHandle = {
  stop: () => Promise<void>;
};

export type WhipPublishOptions = {
  audioOnly?: boolean;
};

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

    const res = await fetch(whipUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        Accept: "application/sdp",
      },
      body: pc.localDescription?.sdp ?? offer.sdp ?? "",
    });

    const { resourceUrl: createdResourceUrl, answerSdp } = await requireCreatedSdpWithLocation(
      res,
      whipUrl,
      "whip",
    );

    resourceUrl = createdResourceUrl;

    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerSdp }));

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
