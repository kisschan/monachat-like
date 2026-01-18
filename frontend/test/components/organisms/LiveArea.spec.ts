import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LiveArea from "@/components/organisms/panel/LiveArea.vue";
import { MediaAcquireError } from "@/webrtc/mediaErrors";
import * as cameraManager from "@/webrtc/cameraManager";
import { replaceVideoTrackSafely } from "@/webrtc/cameraSwitch";
import { restartPublishSessionSafely } from "@/webrtc/publishRestart";

vi.mock("@/webrtc/cameraManager", () => ({
  getCameraStream: vi.fn(),
  listVideoInputs: vi.fn(),
  pickRearCameraDeviceId: vi.fn(),
}));

vi.mock("@/webrtc/cameraSwitch", () => ({
  replaceVideoTrackSafely: vi.fn(),
}));

vi.mock("@/webrtc/publishRestart", () => ({
  restartPublishSessionSafely: vi.fn(),
}));

vi.mock("@/socketIOInstance", () => ({
  socketIOInstance: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mountLiveArea = () =>
  mount(LiveArea, {
    global: {
      plugins: [
        createTestingPinia({
          initialState: {
            user: {
              myToken: null,
              myID: null,
              currentRoom: null,
            },
          },
        }),
      ],
      stubs: {
        PrimeButton: { template: "<button />" },
        Accordion: { template: "<div><slot /></div>" },
        AccordionPanel: { template: "<div><slot /></div>" },
        AccordionHeader: { template: "<div><slot /></div>" },
        AccordionContent: { template: "<div><slot /></div>" },
      },
    },
  });

const createMockStream = () => {
  const track = { stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
};

describe("LiveArea", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps existing preview when start preview fails", async () => {
    expect.assertions(5);
    const { stream, track } = createMockStream();
    const wrapper = mountLiveArea();
    const previewVideoRef = { srcObject: stream } as HTMLVideoElement;

    (wrapper.vm as any).previewStream = stream;
    (wrapper.vm as any).previewVideoRef = previewVideoRef;

    vi.mocked(cameraManager.listVideoInputs).mockResolvedValue([
      { deviceId: "front", label: "Front Cam", kind: "videoinput" } as MediaDeviceInfo,
    ]);
    vi.mocked(cameraManager.getCameraStream).mockRejectedValue(
      new MediaAcquireError("permission-denied"),
    );

    await (wrapper.vm as any).onClickStartPreview();

    expect(track.stop).not.toHaveBeenCalled();
    expect((wrapper.vm as any).previewStream).toStrictEqual(stream);
    expect(previewVideoRef.srcObject).toBe(stream);
    expect((wrapper.vm as any).cameraDeviceId).toBeNull();
    expect((wrapper.vm as any).cameraDeviceIdFacing).toBeNull();
  });

  it("does not update camera state when toggle preview fails", async () => {
    expect.assertions(5);
    const { stream, track } = createMockStream();
    const wrapper = mountLiveArea();
    const previewVideoRef = { srcObject: stream } as HTMLVideoElement;

    (wrapper.vm as any).previewStream = stream;
    (wrapper.vm as any).previewVideoRef = previewVideoRef;
    (wrapper.vm as any).cameraFacing = "user";
    (wrapper.vm as any).cameraDeviceId = "front";
    (wrapper.vm as any).cameraDeviceIdFacing = "user";

    vi.mocked(cameraManager.listVideoInputs).mockResolvedValue([
      { deviceId: "front", label: "Front Cam", kind: "videoinput" } as MediaDeviceInfo,
      { deviceId: "rear", label: "Rear Cam", kind: "videoinput" } as MediaDeviceInfo,
    ]);
    vi.mocked(cameraManager.pickRearCameraDeviceId).mockReturnValue("rear");
    vi.mocked(cameraManager.getCameraStream).mockRejectedValue(
      new MediaAcquireError("permission-denied"),
    );

    await (wrapper.vm as any).onClickToggleCamera();

    expect(track.stop).not.toHaveBeenCalled();
    expect((wrapper.vm as any).cameraFacing).toBe("user");
    expect((wrapper.vm as any).cameraDeviceId).toBe("front");
    expect((wrapper.vm as any).cameraDeviceIdFacing).toBe("user");
    expect((wrapper.vm as any).previewStream).toStrictEqual(stream);
  });

  it("uses restartPublishSessionSafely when replaceTrack fails during publish", async () => {
    expect.assertions(2);
    const wrapper = mountLiveArea();

    (wrapper.vm as any).publishMode = "camera";
    (wrapper.vm as any).cameraFacing = "user";
    (wrapper.vm as any).publishHandle = {
      senders: [{ track: { kind: "video" } }],
    };

    vi.mocked(cameraManager.listVideoInputs).mockResolvedValue([
      { deviceId: "front", label: "Front Cam", kind: "videoinput" } as MediaDeviceInfo,
      { deviceId: "rear", label: "Rear Cam", kind: "videoinput" } as MediaDeviceInfo,
    ]);
    vi.mocked(cameraManager.pickRearCameraDeviceId).mockReturnValue("rear");
    vi.mocked(replaceVideoTrackSafely).mockRejectedValue(new Error("replace-failed"));
    vi.mocked(restartPublishSessionSafely).mockResolvedValue();

    await (wrapper.vm as any).onClickToggleCamera();

    expect(restartPublishSessionSafely).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as any).cameraFacing).toBe("environment");
  });
});
