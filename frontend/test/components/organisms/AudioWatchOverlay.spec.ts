import { fireEvent, getByTestId } from "@testing-library/dom";
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

    const playButton = getByTestId(wrapper.element, "live-audio-play");
    await fireEvent.click(playButton);
    await flushPromises();

    expect(controller.state.isPlaying).toBe(true);
  });

  it("shows blocked message when autoplay is prevented", async () => {
    expect.hasAssertions();
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce({ name: "NotAllowedError" });
    const wrapper = mountOverlay();

    await flushPromises();

    const playButton = getByTestId(wrapper.element, "live-audio-play");
    await fireEvent.click(playButton);

    const audioElement = wrapper.find("audio").element as HTMLAudioElement;
    audioElement.srcObject = {} as MediaStream;
    audioElement.dispatchEvent(new Event("loadedmetadata"));

    await flushPromises();

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("再生がブロックされました");
  });

  it("calls play again when play is clicked after a block", async () => {
    expect.hasAssertions();
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValueOnce({ name: "NotAllowedError" })
      .mockResolvedValueOnce(undefined);
    const wrapper = mountOverlay();

    await flushPromises();

    const playButton = getByTestId(wrapper.element, "live-audio-play");
    await fireEvent.click(playButton);

    const audioElement = wrapper.find("audio").element as HTMLAudioElement;
    audioElement.srcObject = {} as MediaStream;
    audioElement.dispatchEvent(new Event("loadedmetadata"));

    await flushPromises();

    await fireEvent.click(playButton);
    await flushPromises();

    expect(playMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).not.toContain("再生がブロックされました");
  });

  it("sets isPlaying false after clicking stop", async () => {
    expect.hasAssertions();
    const wrapper = mountOverlay();
    const controller = useLivePlaybackController();

    await flushPromises();

    const playButton = getByTestId(wrapper.element, "live-audio-play");
    const stopButton = getByTestId(wrapper.element, "live-audio-stop");

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

    const playButton = getByTestId(wrapper.element, "live-audio-play");
    await fireEvent.click(playButton);
    wrapper.unmount();
    await flushPromises();

    expect(controller.state.isPlaying).toBe(false);
  });

  it("moves the mini overlay when dragging the handle", async () => {
    expect.hasAssertions();
    const wrapper = mountOverlay();

    const overlay = wrapper.element as HTMLElement;
    const handle = getByTestId(overlay, "audio-mini-handle");
    const container = document.createElement("div");
    container.style.width = "320px";
    container.style.height = "200px";
    document.body.appendChild(container);
    container.appendChild(overlay);

    Object.defineProperty(overlay, "offsetParent", { value: container });
    container.getBoundingClientRect = () =>
      ({
        width: 320,
        height: 200,
        top: 0,
        left: 0,
        right: 320,
        bottom: 200,
      }) as DOMRect;
    overlay.getBoundingClientRect = () =>
      ({
        width: 120,
        height: 60,
        top: 0,
        left: 0,
        right: 120,
        bottom: 60,
      }) as DOMRect;

    await flushPromises();

    await fireEvent.pointerDown(handle, { pointerId: 1, clientX: 200, clientY: 150 });
    await fireEvent.pointerMove(document, { pointerId: 1, clientX: 180, clientY: 130 });
    await fireEvent.pointerUp(document, { pointerId: 1, clientX: 180, clientY: 130 });

    expect(overlay.getAttribute("style")).toContain("translate3d(164px, 54px, 0)");
  });

  it("does not start dragging from the play button", async () => {
    expect.hasAssertions();
    const wrapper = mountOverlay();

    const overlay = wrapper.element as HTMLElement;
    const playButton = getByTestId(overlay, "live-audio-play");
    const container = document.createElement("div");
    container.style.width = "320px";
    container.style.height = "200px";
    document.body.appendChild(container);
    container.appendChild(overlay);

    Object.defineProperty(overlay, "offsetParent", { value: container });
    container.getBoundingClientRect = () =>
      ({
        width: 320,
        height: 200,
        top: 0,
        left: 0,
        right: 320,
        bottom: 200,
      }) as DOMRect;
    overlay.getBoundingClientRect = () =>
      ({
        width: 120,
        height: 60,
        top: 0,
        left: 0,
        right: 120,
        bottom: 60,
      }) as DOMRect;

    await flushPromises();

    const initialStyle = overlay.getAttribute("style");
    await fireEvent.pointerDown(playButton, { pointerId: 2, clientX: 200, clientY: 150 });
    await fireEvent.pointerMove(document, { pointerId: 2, clientX: 100, clientY: 50 });
    await fireEvent.pointerUp(document, { pointerId: 2, clientX: 100, clientY: 50 });

    expect(overlay.getAttribute("style")).toBe(initialStyle);
  });
});
