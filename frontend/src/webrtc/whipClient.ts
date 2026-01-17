import { getCameraStream, type CameraStreamOptions } from "./cameraManager";
import { waitForIceGatheringComplete } from "./ice";
import { MediaAcquireError, toMediaAcquireError } from "./mediaErrors";
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
  camera?: CameraStreamOptions;
};

export class PublishCancelledError extends Error {
  reason: "display-ended";
  constructor(reason: PublishCancelledError["reason"]) {
    super(reason);
    this.reason = reason;
  }
}

const getMicStream = async (): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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

async function getStreamForMode(
  mode: PublishMode,
  cameraOptions: CameraStreamOptions = {},
): Promise<StreamForModeResult> {
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

  const cameraStream = await getCameraStream({
    audio: true,
    widthIdeal: 1280,
    heightIdeal: 720,
    ...cameraOptions,
  });
  return { composed: cameraStream, sources: [cameraStream] };
}

export async function startWhipPublish(
  whipUrl: string,
  options: WhipPublishOptions = {},
): Promise<WhipPublishHandle> {
  const mode: PublishMode = options.mode ?? "camera";

  // 呼び出し単位のキャンセル状態にする
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

  try {
    const streamResult = await getStreamForMode(mode, options.camera);
    composedStream = streamResult.composed;
    sourceStreams = streamResult.sources;
    displayTrack = streamResult.displayVideoTrack;

    //  listener はここでOK（strict-boolean対応）
    if (displayTrack !== undefined && options.onDisplayEnded != null) {
      displayTrackEndedHandler = () => {
        cancelReason = "display-ended";
        try {
          options.onDisplayEnded?.();
        } catch {
          // UI側例外でwhipClientのcleanupを壊さない
        }
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

    // ここが超重要：先に代入して “DELETEできる状態” にする
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
        for (const s of sourceStreams) for (const t of s.getTracks()) t.stop();
      }
    };

    throwIfCancelled();

    return { stop, mode, senders };
  } catch (e) {
    if (displayTrack !== undefined && displayTrackEndedHandler != null) {
      displayTrack.removeEventListener("ended", displayTrackEndedHandler);
    }
    if (!stopped && resourceUrl != null) {
      await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
    }
    pc?.close();
    for (const s of sourceStreams) for (const t of s.getTracks()) t.stop();
    throw e;
  }
}
