import { fireEvent, getByRole } from "@testing-library/dom";
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets isPlaying true after clicking play", async () => {
    expect.hasAssertions();
    const wrapper = mountOverlay();
    const controller = useLivePlaybackController();

    await flushPromises();

    const playButton = getByRole(wrapper.element, "button", { name: /play/i });
    await fireEvent.click(playButton);
    await flushPromises();

    expect(controller.state.isPlaying).toBe(true);
  });

  it("shows manual play button when autoplay is blocked", async () => {
    expect.hasAssertions();
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce({ name: "NotAllowedError" });
    const wrapper = mountOverlay();

    await flushPromises();

    const playButton = getByRole(wrapper.element, "button", { name: /play/i });
    await fireEvent.click(playButton);

    const audioElement = wrapper.find("audio").element as HTMLAudioElement;
    audioElement.srcObject = {} as MediaStream;
    audioElement.dispatchEvent(new Event("loadedmetadata"));

    await flushPromises();

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("手動再生");
  });

  it("calls play again when manual play is clicked", async () => {
    expect.hasAssertions();
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce({ name: "NotAllowedError" })
      .mockResolvedValueOnce(undefined);
    const wrapper = mountOverlay();

    await flushPromises();

    const playButton = getByRole(wrapper.element, "button", { name: /play/i });
    await fireEvent.click(playButton);

    const audioElement = wrapper.find("audio").element as HTMLAudioElement;
    audioElement.srcObject = {} as MediaStream;
    audioElement.dispatchEvent(new Event("loadedmetadata"));

    await flushPromises();

    const manualButton = getByRole(wrapper.element, "button", { name: /manual play/i });
    await fireEvent.click(manualButton);
    await flushPromises();

    expect(playMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).not.toContain("手動再生");
  });

  it("sets isPlaying false after clicking stop", async () => {
    expect.hasAssertions();
    const wrapper = mountOverlay();
    const controller = useLivePlaybackController();

    await flushPromises();

    const playButton = getByRole(wrapper.element, "button", { name: /play/i });
    const stopButton = getByRole(wrapper.element, "button", { name: /stop/i });

    await fireEvent.click(playButton);
    await flushPromises();
    await fireEvent.click(stopButton);
    await flushPromises();

    expect(controller.state.isPlaying).toBe(false);
  });

  it("allows stop to be called repeatedly", async () => {
    expect.hasAssertions();
    const controller = useLivePlaybackController();

    await expect(controller.stop()).resolves.toBeUndefined();
    await expect(controller.stop()).resolves.toBeUndefined();
  });

  it("stops playback on unmount", async () => {
    expect.hasAssertions();
    const wrapper = mountOverlay();
    const controller = useLivePlaybackController();

    await flushPromises();

    const playButton = getByRole(wrapper.element, "button", { name: /play/i });
    await fireEvent.click(playButton);
    wrapper.unmount();
    await flushPromises();

    expect(controller.state.isPlaying).toBe(false);
  });
});
