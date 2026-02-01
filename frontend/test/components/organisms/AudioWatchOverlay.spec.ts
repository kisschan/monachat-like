import { flushPromises, mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import AudioWatchOverlay from "@/components/organisms/AudioWatchOverlay.vue";
import { useLivePlaybackController } from "@/composables/useLivePlaybackController";

vi.mock("@/api/liveWebRTC", () => ({
  fetchWebrtcConfig: vi.fn(async () => ({ whepUrl: "https://example.test/whep" })),
}));

vi.mock("@/webrtc/whepClient", () => ({
  startWhepSubscribe: vi.fn(async () => ({ stop: vi.fn().mockResolvedValue(undefined) })),
  WhepRequestError: class WhepRequestError extends Error {
    status: number;
    constructor(status: number) {
      super();
      this.status = status;
    }
  },
}));

describe("AudioWatchOverlay", () => {
  const mountOverlay = () =>
    mount(AudioWatchOverlay, {
      global: {
        plugins: [
          createTestingPinia({
            initialState: {
              user: {
                currentRoom: { id: "room-1", name: "Room", img_url: "" },
                myToken: "token",
              },
            },
          }),
        ],
      },
    });

  beforeEach(async () => {
    const controller = useLivePlaybackController();
    await controller.stop();
    controller.state.error = null;
    controller.state.isBusy = false;
  });

  it("sets isPlaying true after clicking play", async () => {
    const wrapper = mountOverlay();
    const controller = useLivePlaybackController();

    const playButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "再生");

    if (!playButton) {
      throw new Error("play button not found");
    }

    await playButton.trigger("click");

    expect(controller.state.isPlaying).toBe(true);
  });

  it("sets isPlaying false after clicking stop", async () => {
    const wrapper = mountOverlay();
    const controller = useLivePlaybackController();

    const playButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "再生");
    const stopButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "停止");

    if (!playButton || !stopButton) {
      throw new Error("control buttons not found");
    }

    await playButton.trigger("click");
    await stopButton.trigger("click");

    expect(controller.state.isPlaying).toBe(false);
  });

  it("allows stop to be called repeatedly", async () => {
    const controller = useLivePlaybackController();

    await expect(controller.stop()).resolves.toBeUndefined();
    await expect(controller.stop()).resolves.toBeUndefined();
  });

  it("stops playback on unmount", async () => {
    const wrapper = mountOverlay();
    const controller = useLivePlaybackController();

    const playButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "再生");

    if (!playButton) {
      throw new Error("play button not found");
    }

    await playButton.trigger("click");
    wrapper.unmount();
    await flushPromises();

    expect(controller.state.isPlaying).toBe(false);
  });
});
