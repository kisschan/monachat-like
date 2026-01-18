import { pickNextCameraDeviceId } from "@/domain/media/pickNextCameraDeviceId";

const device = (deviceId: string): MediaDeviceInfo =>
  ({
    deviceId,
    label: "",
    kind: "videoinput",
  }) as MediaDeviceInfo;

describe("pickNextCameraDeviceId", () => {
  it("round-robins deterministically when two or more devices exist", () => {
    expect.assertions(2);
    const devices = [device("a"), device("b"), device("c")];

    const nextFromA = pickNextCameraDeviceId(devices, "a");
    const nextFromC = pickNextCameraDeviceId(devices, "c");

    expect(nextFromA).toEqual({ ok: true, deviceId: "b", reason: "round-robin" });
    expect(nextFromC).toEqual({ ok: true, deviceId: "a", reason: "round-robin" });
  });

  it("falls back to the first device when current is missing", () => {
    expect.assertions(1);
    const devices = [device("a"), device("b")];

    const result = pickNextCameraDeviceId(devices, "missing");

    expect(result).toEqual({ ok: true, deviceId: "a", reason: "round-robin" });
  });

  it("returns ok=false when fewer than two devices exist", () => {
    expect.assertions(1);
    const devices = [device("a")];

    const result = pickNextCameraDeviceId(devices, "a");

    expect(result).toEqual({ ok: false, deviceId: null, reason: "insufficient-devices" });
  });
});
