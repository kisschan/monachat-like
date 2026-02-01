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
    const wrapper = mountHost("audio");

    expect(wrapper.find("video").exists()).toBe(false);
    expect(wrapper.find('[aria-label="ライブ窓サイズ"]').exists()).toBe(false);

    const buttonLabels = wrapper.findAll("button").map((button) => button.text());
    expect(buttonLabels).toEqual(expect.arrayContaining(["再生", "停止"]));
  });

  it("renders video overlay when uiKind=video", () => {
    const wrapper = mountHost("video");

    expect(wrapper.find("video").exists()).toBe(true);
    expect(wrapper.find('[aria-label="ライブ窓サイズ"]').exists()).toBe(true);
  });
});
