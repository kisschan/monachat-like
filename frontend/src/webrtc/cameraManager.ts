import { MediaAcquireError, toMediaAcquireError } from "./mediaErrors";

export type CameraFacing = "user" | "environment";

export type CameraStreamOptions = {
  deviceId?: string;
  facing?: CameraFacing;
  widthIdeal?: number;
  heightIdeal?: number;
  fpsIdeal?: number;
  audio?: boolean;
};

const ensureMediaDevicesAvailable = (): MediaDevices => {
  const mediaDevices = navigator.mediaDevices;
  if (mediaDevices == null) {
    throw new MediaAcquireError("not-supported", "mediaDevices is not available");
  }
  return mediaDevices;
};

export const ensureDeviceLabelsUnlocked = async (): Promise<void> => {
  const mediaDevices = ensureMediaDevicesAvailable();
  try {
    const stream = await mediaDevices.getUserMedia({ video: true, audio: false });
    for (const track of stream.getTracks()) {
      track.stop();
    }
  } catch (e: unknown) {
    throw toMediaAcquireError(e);
  }
};

export const listVideoInputs = async (): Promise<MediaDeviceInfo[]> => {
  const mediaDevices = ensureMediaDevicesAvailable();

  const initial = await mediaDevices.enumerateDevices();
  const videoInputs = initial.filter((device) => device.kind === "videoinput");
  const needsUnlock = videoInputs.length > 0 && videoInputs.every((device) => device.label === "");

  if (needsUnlock) {
    await ensureDeviceLabelsUnlocked();
    const refreshed = await mediaDevices.enumerateDevices();
    return refreshed.filter((device) => device.kind === "videoinput");
  }

  return videoInputs;
};

export const pickRearCameraDeviceId = (devices: MediaDeviceInfo[]): string | null => {
  const rearPattern = /(back|rear|environment|背面|後ろ|後面)/i;
  const matched = devices.find((device) => rearPattern.test(device.label));
  return matched?.deviceId ?? null;
};

const buildVideoConstraints = (options: CameraStreamOptions): MediaTrackConstraints => {
  const constraints: MediaTrackConstraints = {};

  if (options.widthIdeal != null) {
    constraints.width = { ideal: options.widthIdeal };
  }
  if (options.heightIdeal != null) {
    constraints.height = { ideal: options.heightIdeal };
  }
  if (options.fpsIdeal != null) {
    constraints.frameRate = { ideal: options.fpsIdeal };
  }

  if (options.deviceId) {
    constraints.deviceId = { exact: options.deviceId };
  } else if (options.facing) {
    constraints.facingMode = { ideal: options.facing };
  }

  return constraints;
};

export const getCameraStream = async (options: CameraStreamOptions = {}): Promise<MediaStream> => {
  const mediaDevices = ensureMediaDevicesAvailable();
  const audio = options.audio ?? true;

  try {
    return await mediaDevices.getUserMedia({
      audio,
      video: buildVideoConstraints(options),
    });
  } catch (e: unknown) {
    throw toMediaAcquireError(e);
  }
};
