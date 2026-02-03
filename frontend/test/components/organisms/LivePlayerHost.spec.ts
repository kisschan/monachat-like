import { getByTestId, queryByTestId } from "@testing-library/dom";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import LivePlayerHost from "@/components/organisms/LivePlayerHost.vue";

describe("LivePlayerHost", () => {
  beforeAll(() => {
    if (typeof globalThis.ResizeObserver === "undefined") {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  const mountHost = (uiKind: "audio" | "video") =>
    mount(LivePlayerHost, {
      props: { uiKind },
      global: {
        plugins: [createTestingPinia()],
      },
    });

  it("renders audio-only overlay without video UI", () => {
    expect.hasAssertions();
    const wrapper = mountHost("audio");

    expect(getByTestId(wrapper.element, "audio-play")).toBeInstanceOf(HTMLElement);
    expect(queryByTestId(wrapper.element, "live-video")).toBeNull();
  });

  it("renders video overlay when uiKind=video", () => {
    expect.hasAssertions();
    const wrapper = mountHost("video");

    expect(getByTestId(wrapper.element, "live-video")).toBeInstanceOf(HTMLVideoElement);
  });
});
