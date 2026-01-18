import { switchPublishCameraSafely } from "@/services/live/switchPublishCameraSafely";

class FakeTrack {
  kind = "video" as const;
  stop = vi.fn();
}

class FakeAudioTrack {
  kind = "audio" as const;
  stop = vi.fn();
}

const createStream = (tracks: MediaStreamTrack[]): MediaStream =>
  ({
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
    getTracks: () => tracks,
  }) as MediaStream;

const device = (deviceId: string): MediaDeviceInfo =>
  ({
    deviceId,
    label: "",
    kind: "videoinput",
  }) as MediaDeviceInfo;

describe("switchPublishCameraSafely", () => {
  it("succeeds on first getUserMedia and replace, stopping the old track", async () => {
    expect.assertions(5);
    const currentTrack = new FakeTrack();
    const nextTrack = new FakeTrack();
    const audioTrack = new FakeAudioTrack();
    const stream = createStream([
      nextTrack as unknown as MediaStreamTrack,
      audioTrack as unknown as MediaStreamTrack,
    ]);

    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const replacePublishVideoTrack = vi.fn().mockResolvedValue(undefined);
    const restartPublishSessionSafely = vi.fn().mockResolvedValue(true);
    const stopTrack = vi.fn();

    const result = await switchPublishCameraSafely(
      {
        currentTrack: currentTrack as unknown as MediaStreamTrack,
        devices: [device("a"), device("b")],
        currentFacingMode: "user",
        currentDeviceId: "a",
      },
      {
        getUserMedia,
        replacePublishVideoTrack,
        restartPublishSessionSafely,
        stopTrack,
      },
    );

    expect(result.ok).toBe(true);
    expect(replacePublishVideoTrack).toHaveBeenCalledWith(nextTrack);
    expect(stopTrack).toHaveBeenCalledWith(currentTrack);
    expect(stopTrack).toHaveBeenCalledWith(audioTrack);
    expect(restartPublishSessionSafely).not.toHaveBeenCalled();
  });

  it("retries after NotReadableError by stopping the current track", async () => {
    expect.assertions(4);
    const currentTrack = new FakeTrack();
    const nextTrack = new FakeTrack();
    const stream = createStream([nextTrack as unknown as MediaStreamTrack]);
    const notReadable = Object.assign(new Error("busy"), { name: "NotReadableError" });

    const getUserMedia = vi.fn().mockRejectedValueOnce(notReadable).mockResolvedValueOnce(stream);
    const replacePublishVideoTrack = vi.fn().mockResolvedValue(undefined);
    const restartPublishSessionSafely = vi.fn().mockResolvedValue(true);
    const stopTrack = vi.fn();

    const result = await switchPublishCameraSafely(
      {
        currentTrack: currentTrack as unknown as MediaStreamTrack,
        devices: [device("a"), device("b")],
        currentFacingMode: "user",
        currentDeviceId: "a",
      },
      {
        getUserMedia,
        replacePublishVideoTrack,
        restartPublishSessionSafely,
        stopTrack,
      },
    );

    expect(result.ok).toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(stopTrack).toHaveBeenCalledWith(currentTrack);
    expect(replacePublishVideoTrack).toHaveBeenCalledWith(nextTrack);
  });

  it("does not retry on NotAllowedError", async () => {
    expect.assertions(4);
    const currentTrack = new FakeTrack();
    const notAllowed = Object.assign(new Error("denied"), { name: "NotAllowedError" });

    const getUserMedia = vi.fn().mockRejectedValueOnce(notAllowed);
    const replacePublishVideoTrack = vi.fn();
    const restartPublishSessionSafely = vi.fn();
    const stopTrack = vi.fn();

    const result = await switchPublishCameraSafely(
      {
        currentTrack: currentTrack as unknown as MediaStreamTrack,
        devices: [device("a")],
        currentFacingMode: "user",
        currentDeviceId: "a",
      },
      {
        getUserMedia,
        replacePublishVideoTrack,
        restartPublishSessionSafely,
        stopTrack,
      },
    );

    expect(result.ok).toBe(false);
    expect("nextFacingMode" in result).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(stopTrack).not.toHaveBeenCalled();
  });

  it("stops the new track when replace and restart both fail", async () => {
    expect.assertions(5);
    const currentTrack = new FakeTrack();
    const nextTrack = new FakeTrack();
    const stream = createStream([nextTrack as unknown as MediaStreamTrack]);

    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const replacePublishVideoTrack = vi.fn().mockRejectedValue(new Error("replace"));
    const restartPublishSessionSafely = vi.fn().mockResolvedValue(false);
    const stopTrack = vi.fn();

    const result = await switchPublishCameraSafely(
      {
        currentTrack: currentTrack as unknown as MediaStreamTrack,
        devices: [device("a"), device("b")],
        currentFacingMode: "user",
        currentDeviceId: "a",
      },
      {
        getUserMedia,
        replacePublishVideoTrack,
        restartPublishSessionSafely,
        stopTrack,
      },
    );

    expect(result.ok).toBe(false);
    expect(restartPublishSessionSafely).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledWith(nextTrack);
    expect(stopTrack).not.toHaveBeenCalledWith(currentTrack);
    expect("nextFacingMode" in result).toBe(false);
  });

  it("stops after retry failure on NotReadableError", async () => {
    expect.assertions(4);
    const currentTrack = new FakeTrack();
    const notReadable = Object.assign(new Error("busy"), { name: "NotReadableError" });

    const getUserMedia = vi.fn().mockRejectedValue(notReadable);
    const replacePublishVideoTrack = vi.fn();
    const restartPublishSessionSafely = vi.fn();
    const stopTrack = vi.fn();

    const result = await switchPublishCameraSafely(
      {
        currentTrack: currentTrack as unknown as MediaStreamTrack,
        devices: [device("a"), device("b")],
        currentFacingMode: "user",
        currentDeviceId: "a",
      },
      {
        getUserMedia,
        replacePublishVideoTrack,
        restartPublishSessionSafely,
        stopTrack,
      },
    );

    expect(result.ok).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(stopTrack).toHaveBeenCalledWith(currentTrack);
    expect("nextFacingMode" in result).toBe(false);
  });

  it("prefers pickNext deviceId when multiple devices exist", async () => {
    expect.assertions(2);
    const currentTrack = new FakeTrack();
    const nextTrack = new FakeTrack();
    const stream = createStream([nextTrack as unknown as MediaStreamTrack]);

    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const replacePublishVideoTrack = vi.fn().mockResolvedValue(undefined);
    const restartPublishSessionSafely = vi.fn().mockResolvedValue(true);
    const stopTrack = vi.fn();

    await switchPublishCameraSafely(
      {
        currentTrack: currentTrack as unknown as MediaStreamTrack,
        devices: [device("a"), device("b")],
        currentFacingMode: "user",
        currentDeviceId: "a",
      },
      {
        getUserMedia,
        replacePublishVideoTrack,
        restartPublishSessionSafely,
        stopTrack,
      },
    );

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { deviceId: { exact: "b" } },
    });
  });
});
