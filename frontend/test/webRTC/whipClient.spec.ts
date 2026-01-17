import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class FakeTrack {
  kind: "audio" | "video";
  stopped = false;
  constructor(kind: "audio" | "video") {
    this.kind = kind;
  }
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  tracks: FakeTrack[];
  constructor(tracks: FakeTrack[]) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
}

class FakeSender {
  track: FakeTrack | null;
  constructor(track: FakeTrack) {
    this.track = track;
  }
  async replaceTrack(next: FakeTrack | null): Promise<void> {
    this.track = next;
  }
}

class FakeRTCPeerConnection {
  localDescription: { sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  senders: FakeSender[] = [];
  iceGatheringState = "complete" as RTCIceGatheringState;

  addTrack(track: FakeTrack) {
    const sender = new FakeSender(track);
    this.senders.push(sender);
    return sender as unknown as RTCRtpSender;
  }

  getSenders() {
    return this.senders as unknown as RTCRtpSender[];
  }

  async createOffer() {
    return { sdp: "offer-sdp" } as RTCSessionDescriptionInit;
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = { sdp: desc.sdp ?? "" };
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.remoteDescription = { type: desc.type ?? "answer", sdp: desc.sdp ?? "" };
  }

  addEventListener() {}
  removeEventListener() {}
  close() {}
}

const state = vi.hoisted(() => ({
  cameraStream: null as unknown as FakeStream,
}));

vi.mock("@/webrtc/cameraManager", () => ({
  getCameraStream: vi.fn(async () => state.cameraStream),
}));
vi.mock("/src/webrtc/cameraManager.ts", () => ({
  getCameraStream: vi.fn(async () => state.cameraStream),
}));

vi.mock("@/webrtc/ice", () => ({
  waitForIceGatheringComplete: vi.fn(async () => {}),
}));
vi.mock("/src/webrtc/ice.ts", () => ({
  waitForIceGatheringComplete: vi.fn(async () => {}),
}));

// ★ここだけに統一（重複mock禁止）
const webRTChelperMock = vi.hoisted(() => ({
  requireCreatedSdpWithLocation: vi.fn(async () => ({
    resourceUrl: "https://example.test/whip/123",
    answerSdp: "answer-sdp",
  })),
}));

vi.mock("@/webrtc/webRTChelper", () => webRTChelperMock);
vi.mock("/src/webrtc/webRTChelper", () => webRTChelperMock);
vi.mock("/src/webrtc/webRTChelper.ts", () => webRTChelperMock);

describe("startWhipPublish stop cleanup", () => {
  beforeEach(() => {
    vi.resetModules();

    vi.stubGlobal(
      "RTCPeerConnection",
      FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
    );

    vi.stubGlobal(
      "RTCSessionDescription",
      class {
        type: string;
        sdp: string;
        constructor(init: RTCSessionDescriptionInit) {
          this.type = init.type ?? "answer";
          this.sdp = init.sdp ?? "";
        }
      } as unknown as typeof RTCSessionDescription,
    );

    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 201 })) as unknown as typeof fetch);

    // hoisted mock の呼び出し履歴を各テストでリセットしたければここ
    webRTChelperMock.requireCreatedSdpWithLocation.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("stops the current sender track after replaceTrack", async () => {
    expect.hasAssertions();

    const initialVideo = new FakeTrack("video");
    const initialAudio = new FakeTrack("audio");
    state.cameraStream = new FakeStream([initialVideo, initialAudio]);

    const { startWhipPublish } = await import("@/webrtc/whipClient");

    const handle = await startWhipPublish("https://example.test/whip", { mode: "camera" });

    const replacedVideo = new FakeTrack("video");
    const videoSender = handle.senders.find((s) => s.track?.kind === "video");

    expect(videoSender).toBeTruthy();

    await (
      videoSender! as unknown as { replaceTrack: (t: MediaStreamTrack) => Promise<void> }
    ).replaceTrack(replacedVideo as unknown as MediaStreamTrack);

    await handle.stop();

    expect(replacedVideo.stopped).toBe(true);
  });
});
