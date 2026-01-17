import { describe, it, expect } from "vitest";
import { replaceVideoTrackSafely } from "@/webrtc/cameraSwitch";

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
}

describe("replaceVideoTrackSafely", () => {
  it("stops acquired tracks when replaceTrack fails", async () => {
    expect.hasAssertions();
    const videoTrack = new FakeTrack("video");
    const audioTrack = new FakeTrack("audio");
    const stream = new FakeStream([videoTrack, audioTrack]);

    const sender = {
      replaceTrack: async () => {
        throw new Error("replace-failed");
      },
    } as unknown as RTCRtpSender;

    await expect(
      replaceVideoTrackSafely({
        sender,
        currentTrack: null,
        getCameraStream: async () => stream as unknown as MediaStream,
        options: { facing: "environment" },
      }),
    ).rejects.toThrow(/replace-failed/);

    expect(videoTrack.stopped).toBe(true);
    expect(audioTrack.stopped).toBe(true);
  });
});
