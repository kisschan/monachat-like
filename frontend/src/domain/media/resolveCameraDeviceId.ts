export type ResolveCameraDeviceIdResult = {
  ok: true;
  deviceId: string | null;
  reason:
    | "no-videoinput"
    | "preferred-device-id"
    | "no-facing-mode"
    | "no-labels"
    | "label-match"
    | "label-no-match";
};

type MediaDeviceInfoLike = Pick<MediaDeviceInfo, "deviceId" | "label" | "kind">;

type FacingMode = "user" | "environment" | null | undefined;

const frontPattern = /(front|user|selfie|前面|内側|内カメ)/i;
const rearPattern = /(back|rear|environment|背面|後ろ|後面)/i;

const filterVideoInputs = (devices: MediaDeviceInfoLike[]): MediaDeviceInfoLike[] =>
  devices.filter((device) => device.kind == null || device.kind === "videoinput");

export const resolveCameraDeviceId = (
  devices: MediaDeviceInfoLike[],
  preferredDeviceId?: string | null,
  facingMode?: FacingMode,
): ResolveCameraDeviceIdResult => {
  const videoInputs = filterVideoInputs(devices);
  if (videoInputs.length === 0) {
    return { ok: true, deviceId: null, reason: "no-videoinput" };
  }

  if (preferredDeviceId != null) {
    const preferred = videoInputs.find((device) => device.deviceId === preferredDeviceId);
    if (preferred) {
      return { ok: true, deviceId: preferred.deviceId, reason: "preferred-device-id" };
    }
  }

  if (!facingMode) {
    return { ok: true, deviceId: null, reason: "no-facing-mode" };
  }

  const labeledDevices = videoInputs.filter((device) => device.label.trim() !== "");
  if (labeledDevices.length === 0) {
    return { ok: true, deviceId: null, reason: "no-labels" };
  }

  const pattern = facingMode === "environment" ? rearPattern : frontPattern;
  const matched = labeledDevices.find((device) => pattern.test(device.label));
  if (matched) {
    return { ok: true, deviceId: matched.deviceId, reason: "label-match" };
  }

  return { ok: true, deviceId: null, reason: "label-no-match" };
};
