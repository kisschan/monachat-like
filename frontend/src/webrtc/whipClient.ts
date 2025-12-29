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

export class PublishCancelledError extends Error {
  reason: "display-ended";
  constructor(reason: PublishCancelledError["reason"]) {
    super(reason);
    this.reason = reason;
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

  let cancelReason: "none" | "display-ended" = "none";
  const throwIfCancelled = (): void => {
    if (cancelReason !== "none") throw new PublishCancelledError(cancelReason);
  };

  let composedStream: MediaStream | null = null;
  let sourceStreams: MediaStream[] = [];
  let pc: RTCPeerConnection | null = null;
  let stopped = false;
  let resourceUrl: string | null = null;

  let displayTrackEndedHandler: (() => void) | null = null;
  let displayTrack: MediaStreamTrack | undefined;

  const senders: RTCRtpSender[] = [];

  // ★返却後にも呼べる stop の実体を外に置く
  let stopImpl: (() => Promise<void>) | null = null;

  try {
    const streamResult = await getStreamForMode(mode);
    composedStream = streamResult.composed;
    sourceStreams = streamResult.sources;
    displayTrack = streamResult.displayVideoTrack;

    if (displayTrack !== undefined) {
      displayTrackEndedHandler = () => {
        cancel: {
          cancelReason = "display-ended";
        }

        // UI通知（あれば）
        try {
          options.onDisplayEnded?.();
        } catch {
          // ignore
        }

        // ★返却後なら内部で止められる
        if (stopImpl) void stopImpl();
        // 返却前なら throwIfCancelled のチェックポイントで落ちる
      };

      displayTrack.addEventListener("ended", displayTrackEndedHandler, { once: true });
    }

    throwIfCancelled();

    pc = new RTCPeerConnection({ iceServers: [] });

    for (const track of composedStream.getTracks()) {
      const sender = pc.addTrack(track, composedStream);
      senders.push(sender);
    }

    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    throwIfCancelled();

    await pc.setLocalDescription(offer);
    throwIfCancelled();

    await waitForIceGatheringComplete(pc, 3000);
    throwIfCancelled();

    const res = await fetch(whipUrl, {
      method: "POST",
      headers: { "Content-Type": "application/sdp", Accept: "application/sdp" },
      body: pc.localDescription?.sdp ?? offer.sdp ?? "",
    });

    const { resourceUrl: createdResourceUrl, answerSdp } = await requireCreatedSdpWithLocation(
      res,
      whipUrl,
      "whip",
    );

    resourceUrl = createdResourceUrl;

    if (cancelReason !== "none") {
      await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
      throw new PublishCancelledError(cancelReason);
    }

    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerSdp }));
    throwIfCancelled();

    const stop = async () => {
      if (stopped) return;
      stopped = true;

      if (displayTrack !== undefined && displayTrackEndedHandler != null) {
        displayTrack.removeEventListener("ended", displayTrackEndedHandler);
      }

      try {
        if (resourceUrl != null && resourceUrl !== "") {
          await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
        }
      } finally {
        pc?.close();

        // ★任意: composed も止める（将来mixした時に安全）
        if (composedStream) for (const t of composedStream.getTracks()) t.stop();

        for (const s of sourceStreams) for (const t of s.getTracks()) t.stop();
      }
    };

    // ★ここで返却後 stop を可能にする
    stopImpl = stop;

    throwIfCancelled();
    return { stop, mode, senders };
  } catch (e) {
    if (displayTrack !== undefined && displayTrackEndedHandler != null) {
      displayTrack.removeEventListener("ended", displayTrackEndedHandler);
    }
    if (!stopped && resourceUrl != null && resourceUrl !== "") {
      await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
    }
    pc?.close();
    if (composedStream) for (const t of composedStream.getTracks()) t.stop();
    for (const s of sourceStreams) for (const t of s.getTracks()) t.stop();
    throw e;
  }
}
