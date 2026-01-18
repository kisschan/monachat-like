import { resolveCameraDeviceId } from "@/domain/media/resolveCameraDeviceId";

const device = (deviceId: string, label: string): MediaDeviceInfo =>
  ({
    deviceId,
    label,
    kind: "videoinput",
  }) as MediaDeviceInfo;

describe("resolveCameraDeviceId", () => {
  it("returns null deviceId when labels are generic without facing keywords", () => {
    expect.assertions(2);
    const devices = [device("a", "USB Camera"), device("b", "Camera 1")];

    const userResult = resolveCameraDeviceId(devices, undefined, "user");
    const envResult = resolveCameraDeviceId(devices, undefined, "environment");

    expect(userResult).toEqual({ ok: true, deviceId: null, reason: "label-no-match" });
    expect(envResult).toEqual({ ok: true, deviceId: null, reason: "label-no-match" });
  });

  it("uses facing keywords to pick front/back devices", () => {
    expect.assertions(2);
    const devices = [device("front-id", "Front Camera"), device("back-id", "Rear Camera")];

    const userResult = resolveCameraDeviceId(devices, undefined, "user");
    const envResult = resolveCameraDeviceId(devices, undefined, "environment");

    expect(userResult).toEqual({ ok: true, deviceId: "front-id", reason: "label-match" });
    expect(envResult).toEqual({ ok: true, deviceId: "back-id", reason: "label-match" });
  });

  it("prefers the preferredDeviceId when available", () => {
    expect.assertions(1);
    const devices = [device("front-id", "Front Camera"), device("back-id", "Rear Camera")];

    const result = resolveCameraDeviceId(devices, "back-id", "user");

    expect(result).toEqual({ ok: true, deviceId: "back-id", reason: "preferred-device-id" });
  });
});
