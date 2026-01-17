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
    return this.tracks.filter((track) => track.kind === "video");
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
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

  // NOTE: 本番は addTrack(track, stream) で呼ばれるが、JSは余剰引数を無視できるので引数は1つでOK
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

describe("startWhipPublish stop cleanup", () => {
  beforeEach(() => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("stops the current sender track after replaceTrack", async () => {
    expect.hasAssertions();

    const initialVideo = new FakeTrack("video");
    const initialAudio = new FakeTrack("audio");
    const cameraStream = new FakeStream([initialVideo, initialAudio]);

    vi.doMock("@/webrtc/cameraManager", () => ({
      getCameraStream: vi.fn(async () => cameraStream),
    }));
    vi.doMock("@/webrtc/ice", () => ({
      waitForIceGatheringComplete: vi.fn(async () => {}),
    }));
    vi.doMock("@/webrtc/webRTChelper", () => ({
      requireCreatedSdpWithLocation: vi.fn(async () => ({
        resourceUrl: "https://example.test/whip/123",
        answerSdp: "answer-sdp",
      })),
    }));

    const fetchSpy = vi.fn(async () => ({ status: 201 }));
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const { startWhipPublish } = await import("@/webrtc/whipClient");

    const handle = await startWhipPublish("https://example.test/whip", { mode: "camera" });

    const replacedVideo = new FakeTrack("video");
    const videoSender = handle.senders.find((sender) => sender.track?.kind === "video");

    // 「条件分岐（throw）」を消して、expectで存在保証だけする
    expect(videoSender).toBeTruthy();

    // TSの型狭めはしないので、非null断言で進める（条件分岐は入れない）
    await (
      videoSender! as unknown as { replaceTrack: (t: MediaStreamTrack) => Promise<void> }
    ).replaceTrack(replacedVideo as unknown as MediaStreamTrack);

    await handle.stop();

    expect(replacedVideo.stopped).toBe(true);
  });
});
