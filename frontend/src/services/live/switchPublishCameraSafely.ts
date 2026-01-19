import type { CameraFacing } from "@/webrtc/cameraManager";
import { buildVideoConstraints } from "@/domain/media/buildVideoConstraints";
import { pickNextCameraDeviceId } from "@/domain/media/pickNextCameraDeviceId";
import { resolveCameraDeviceId } from "@/domain/media/resolveCameraDeviceId";

export type SwitchPublishCameraSafelySuccess = {
  ok: true;
  nextFacingMode: CameraFacing;
  nextDeviceId: string | null;
  reason: string;
  stoppedCurrentTrack: boolean;
};

export type SwitchPublishCameraSafelyFailure = {
  ok: false;
  reason: string;
  errorName?: string;
  stoppedCurrentTrack: boolean;
};

export type SwitchPublishCameraSafelyResult =
  | SwitchPublishCameraSafelySuccess
  | SwitchPublishCameraSafelyFailure;

export type SwitchPublishCameraSafelyDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  replacePublishVideoTrack: (track: MediaStreamTrack) => Promise<void>;
  restartPublishSessionSafely: (options: {
    deviceId?: string;
    facing?: CameraFacing;
  }) => Promise<boolean>;
  stopTrack: (track: MediaStreamTrack) => void;
};

export type SwitchPublishCameraSafelyParams = {
  currentTrack: MediaStreamTrack | null;
  devices: MediaDeviceInfo[];
  currentFacingMode: CameraFacing;
  currentDeviceId: string | null;
};

const stopTrackSafe = (stopTrack: (track: MediaStreamTrack) => void, track: MediaStreamTrack) => {
  try {
    stopTrack(track);
  } catch {
    // ignore
  }
};

const stopStreamTracks = (
  stopTrack: (track: MediaStreamTrack) => void,
  stream: MediaStream,
  keepTrack?: MediaStreamTrack,
) => {
  for (const track of stream.getTracks()) {
    if (keepTrack && track === keepTrack) continue;
    stopTrackSafe(stopTrack, track);
  }
};

const getErrorName = (error: unknown): string | undefined => {
  if (error === null || error === undefined) return undefined;

  if (typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string") return name;
    if (name == null) return undefined;
    return String(name);
  }

  return undefined;
};

const toggleFacingMode = (current: CameraFacing): CameraFacing =>
  current === "user" ? "environment" : "user";

export const switchPublishCameraSafely = async (
  params: SwitchPublishCameraSafelyParams,
  deps: SwitchPublishCameraSafelyDeps,
): Promise<SwitchPublishCameraSafelyResult> => {
  const nextFacingMode = toggleFacingMode(params.currentFacingMode);
  const pickNext = pickNextCameraDeviceId(params.devices, params.currentDeviceId);

  let targetDeviceId: string | null = null;
  let selectionReason = "";

  if (pickNext.ok) {
    targetDeviceId = pickNext.deviceId;
    selectionReason = pickNext.reason;
  } else {
    const resolved = resolveCameraDeviceId(params.devices, null, nextFacingMode);
    targetDeviceId = resolved.deviceId;
    selectionReason = resolved.reason;
  }

  const videoConstraints = buildVideoConstraints(
    targetDeviceId,
    targetDeviceId != null ? null : nextFacingMode,
  );
  const mediaConstraints: MediaStreamConstraints = {
    audio: false,
    video: videoConstraints,
  };

  let stoppedCurrentTrack = false;
  let stream: MediaStream;

  const attemptGetUserMedia = () => deps.getUserMedia(mediaConstraints);

  try {
    stream = await attemptGetUserMedia();
  } catch (error) {
    const errorName = getErrorName(error);
    if (errorName === "NotReadableError" && params.currentTrack) {
      stopTrackSafe(deps.stopTrack, params.currentTrack);
      stoppedCurrentTrack = true;
      try {
        stream = await attemptGetUserMedia();
      } catch (retryError) {
        return {
          ok: false,
          reason: "getUserMedia-retry-failed",
          errorName: getErrorName(retryError),
          stoppedCurrentTrack,
        };
      }
    } else {
      return {
        ok: false,
        reason: "getUserMedia-failed",
        errorName,
        stoppedCurrentTrack,
      };
    }
  }

  const nextTrack = stream.getVideoTracks()[0];
  if (!nextTrack) {
    stopStreamTracks(deps.stopTrack, stream);
    return {
      ok: false,
      reason: "video-track-missing",
      stoppedCurrentTrack,
    };
  }

  try {
    await deps.replacePublishVideoTrack(nextTrack);
  } catch (error) {
    const restartOk = await deps.restartPublishSessionSafely({
      deviceId: targetDeviceId ?? undefined,
      facing: targetDeviceId != null ? undefined : nextFacingMode,
    });
    stopStreamTracks(deps.stopTrack, stream);

    if (!restartOk) {
      return {
        ok: false,
        reason: "replace-and-restart-failed",
        errorName: getErrorName(error),
        stoppedCurrentTrack,
      };
    }

    return {
      ok: true,
      nextFacingMode,
      nextDeviceId: targetDeviceId,
      reason: `restart-${selectionReason}`,
      stoppedCurrentTrack,
    };
  }

  stopStreamTracks(deps.stopTrack, stream, nextTrack);
  if (params.currentTrack && params.currentTrack !== nextTrack && !stoppedCurrentTrack) {
    stopTrackSafe(deps.stopTrack, params.currentTrack);
    stoppedCurrentTrack = true;
  }

  return {
    ok: true,
    nextFacingMode,
    nextDeviceId: targetDeviceId,
    reason: `replace-${selectionReason}`,
    stoppedCurrentTrack,
  };
};
