import type { CameraFacing } from "@/webrtc/cameraManager";

export type VideoConstraints = MediaTrackConstraints | true;

export const buildVideoConstraints = (
  resolvedDeviceId: string | null,
  facingMode: CameraFacing | null,
): VideoConstraints => {
  if (resolvedDeviceId != null) {
    return { deviceId: { exact: resolvedDeviceId } };
  }
  if (facingMode) {
    return { facingMode: { ideal: facingMode } };
  }
  return true;
};
