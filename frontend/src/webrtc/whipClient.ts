import { waitForIceGatheringComplete } from "./ice";
import { requireCreatedSdpWithLocation } from "./webRTChelper";

export type PublishMode = "camera" | "screen" | "audio";

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
  code:
    | "permission-denied"
    | "no-device"
    | "constraint-failed"
    | "not-supported"
    | "screen-audio-unavailable"
    | "unknown";

  constructor(code: MediaAcquireError["code"], message?: string) {
    super(message);
    this.code = code;
  }
}

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
    if (e.name === "NotSupportedError") {
      return new MediaAcquireError("not-supported", e.message);
    }
  }

  // getDisplayMedia 未実装環境で起きがち
  if (e instanceof TypeError) {
    return new MediaAcquireError("not-supported", e.message);
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

const getDisplayStreamWithAudio = async (): Promise<MediaStream> => {
  const mediaDevices = navigator.mediaDevices; // MediaDevices | undefined の可能性

  if (mediaDevices == null) {
    throw new MediaAcquireError("not-supported", "mediaDevices is not available");
  }

  const getDisplayMedia = mediaDevices.getDisplayMedia;
  if (typeof getDisplayMedia !== "function") {
    throw new MediaAcquireError("not-supported", "getDisplayMedia is not supported");
  }

  try {
    return await getDisplayMedia.call(mediaDevices, { video: true, audio: true });
  } catch (e: unknown) {
    throw toMediaAcquireError(e);
  }
};

type StreamForModeResult = {
  composed: MediaStream;
  sources: MediaStream[];
  displayVideoTrack?: MediaStreamTrack;
};

const stopStream = (s: MediaStream): void => {
  for (const t of s.getTracks()) {
    try {
      t.stop();
    } catch {
      // ignore
    }
  }
};

async function getStreamForMode(mode: PublishMode): Promise<StreamForModeResult> {
  if (mode === "audio") {
    const micStream = await getMicStream();
    return { composed: micStream, sources: [micStream] };
  }

  if (mode === "screen") {
    const displayStream = await getDisplayStreamWithAudio();

    const videoTrack = displayStream.getVideoTracks()[0];
    const audioTrack = displayStream.getAudioTracks()[0];

    if (videoTrack == null) {
      stopStream(displayStream);
      throw new MediaAcquireError("unknown", "no display video track");
    }

    if (audioTrack == null) {
      stopStream(displayStream);
      throw new MediaAcquireError(
        "screen-audio-unavailable",
        "no audio track from display capture (target/OS/browser limitation)",
      );
    }

    const composed = new MediaStream([videoTrack, audioTrack]);

    return {
      composed,
      sources: [displayStream],
      displayVideoTrack: videoTrack,
    };
  }

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
