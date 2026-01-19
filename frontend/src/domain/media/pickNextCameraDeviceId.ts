export type PickNextCameraDeviceIdResult = {
  ok: boolean;
  deviceId: string | null;
  reason: "round-robin" | "insufficient-devices";
};

type MediaDeviceInfoLike = Pick<MediaDeviceInfo, "deviceId" | "kind">;

const filterVideoInputs = (devices: MediaDeviceInfoLike[]): MediaDeviceInfoLike[] =>
  devices.filter((device) => device.kind == null || device.kind === "videoinput");

export const pickNextCameraDeviceId = (
  devices: MediaDeviceInfoLike[],
  currentDeviceId: string | null,
): PickNextCameraDeviceIdResult => {
  const videoInputs = filterVideoInputs(devices);
  if (videoInputs.length < 2) {
    return { ok: false, deviceId: null, reason: "insufficient-devices" };
  }

  const currentIndex =
    currentDeviceId != null
      ? videoInputs.findIndex((device) => device.deviceId === currentDeviceId)
      : -1;
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % videoInputs.length : 0;
  const nextDevice = videoInputs[nextIndex];

  return { ok: true, deviceId: nextDevice?.deviceId ?? null, reason: "round-robin" };
};
