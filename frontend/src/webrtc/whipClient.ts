import { waitForIceGatheringComplete } from "./ice";
import { requireCreatedSdpWithLocation } from "./webRTChelper";

export type PublishMode = "camera" | "screen" | "screen_silent" | "audio";

export type WhipPublishHandle = {
  stop: () => Promise<void>;
  mode: PublishMode;
  /**
   * TODO: replaceTrack() による配信中モード切替の際に利用する
   */
  senders: RTCRtpSender[];
};

export type WhipPublishOptions = {
  mode?: PublishMode;
  onDisplayEnded?: () => void;
};

export class MediaAcquireError extends Error {
  code: "permission-denied" | "no-device" | "constraint-failed" | "unknown";

  constructor(code: MediaAcquireError["code"], message?: string) {
    super(message);
    this.code = code;
  }
}

type StreamForModeResult = {
  composed: MediaStream;
  sources: MediaStream[];
  displayVideoTrack?: MediaStreamTrack;
};

const toMediaAcquireError = (e: unknown): MediaAcquireError => {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError" || e.name === "SecurityError") {
      return new MediaAcquireError("permission-denied", e.message);
    }
    if (e.name === "NotFoundError") {
      return new MediaAcquireError("no-device", e.message);
    }
    if (e.name === "OverconstrainedError") {
      return new MediaAcquireError("constraint-failed", e.message);
    }
  }

  return new MediaAcquireError("unknown", e instanceof Error ? e.message : String(e));
};

const getMicStream = async (): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e: unknown) {
    throw toMediaAcquireError(e);
  }
};

const getCameraStream = async (): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        width: 1280,
        height: 720,
      },
    });
  } catch (e: unknown) {
    throw toMediaAcquireError(e);
  }
};

const getDisplayStream = async (): Promise<MediaStream> => {
  try {
    // P0: システム音声は扱わない
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (e: unknown) {
    throw toMediaAcquireError(e);
  }
};

async function getStreamForMode(mode: PublishMode): Promise<StreamForModeResult> {
  if (mode === "audio") {
    const micStream = await getMicStream();
    return { composed: micStream, sources: [micStream] };
  }

  if (mode === "screen_silent") {
    const displayStream = await getDisplayStream();
    const videoTrack = displayStream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new MediaAcquireError("unknown", "no display video track");
    }
    const composed = new MediaStream([videoTrack]);
    return {
      composed,
      sources: [displayStream],
      displayVideoTrack: videoTrack,
    };
  }

  if (mode === "screen") {
    const [displayStream, micStream] = await Promise.all([getDisplayStream(), getMicStream()]);
    const videoTrack = displayStream.getVideoTracks()[0];
    const audioTrack = micStream.getAudioTracks()[0];
    if (!videoTrack) {
      throw new MediaAcquireError("unknown", "no display video track");
    }
    if (!audioTrack) {
      throw new MediaAcquireError("no-device", "no audio track from microphone");
    }
    const composed = new MediaStream([videoTrack, audioTrack]);
    return {
      composed,
      sources: [displayStream, micStream],
      displayVideoTrack: videoTrack,
    };
  }

  // default: camera
  const cameraStream = await getCameraStream();
  return { composed: cameraStream, sources: [cameraStream] };
}

export async function startWhipPublish(
  whipUrl: string,
  options: WhipPublishOptions = {},
): Promise<WhipPublishHandle> {
  const mode: PublishMode = options.mode ?? "camera";

  let composedStream: MediaStream | null = null;
  let sourceStreams: MediaStream[] = [];
  let pc: RTCPeerConnection | null = null;
  let stopped = false;
  let resourceUrl: string | null = null;
  let displayTrackEndedHandler: (() => void) | null = null;
  let displayTrack: MediaStreamTrack | undefined;
  const senders: RTCRtpSender[] = [];

  try {
    // 1. メディア取得（必要に応じて合成）
    const streamResult = await getStreamForMode(mode);
    composedStream = streamResult.composed;
    sourceStreams = streamResult.sources;
    displayTrack = streamResult.displayVideoTrack;

    if (displayTrack && options.onDisplayEnded) {
      displayTrackEndedHandler = () => options.onDisplayEnded?.();
      displayTrack.addEventListener("ended", displayTrackEndedHandler, { once: true });
    }

    // 2. RTCPeerConnection 準備
    pc = new RTCPeerConnection({
      iceServers: [], // SRS ICE-lite 前提なら空でOK
    });

    composedStream.getTracks().forEach((track) => {
      // replaceTrack で後から差し替える可能性があるので保持しておく
      const sender = pc?.addTrack(track, composedStream as MediaStream);
      if (sender) senders.push(sender);
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
      if (displayTrack && displayTrackEndedHandler) {
        displayTrack.removeEventListener("ended", displayTrackEndedHandler);
      }
      try {
        if (resourceUrl !== null && resourceUrl !== "") {
          await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
        }
      } finally {
        pc?.close();
        sourceStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      }
    };

    return { stop, mode, senders };
  } catch (e) {
    if (displayTrack && displayTrackEndedHandler) {
      displayTrack.removeEventListener("ended", displayTrackEndedHandler);
    }
    if (!stopped && resourceUrl != null) {
      await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
    }
    pc?.close();
    sourceStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    throw e;
  }
}
