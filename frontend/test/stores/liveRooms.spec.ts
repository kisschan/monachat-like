import { createPinia, setActivePinia } from "pinia";
import { vi, expect, describe, beforeEach, it, type Mocked } from "vitest";
import axios from "axios";
import { useLiveRoomsStore } from "@/stores/liveRooms";
import { useUserStore } from "@/stores/user";

vi.mock("axios");

describe("liveRooms store", () => {
  const mockedAxios = axios as unknown as Mocked<typeof axios>;

  beforeEach(() => {
    // spy の残骸を消す（clearAllMocks だけだと spy は残りやすい）
    vi.restoreAllMocks();
    setActivePinia(createPinia());
  });

  const primeUser = () => {
    const user = useUserStore();
    user.$patch({
      myToken: "token",
      currentRoom: { id: "/live", name: "live", img_url: "" },
    });
  };

  it("reloads from API when socket payload lacks detail", async () => {
    expect.assertions(1);

    const getSpy = vi.spyOn(mockedAxios, "get").mockResolvedValue({ data: [], status: 200 } as any);

    primeUser();
    const store = useLiveRoomsStore();

    // invalidate系（isLive欠落 or detail欠落）を想定
    store.applyLiveRoomsChanged({ room: "/live" } as any);

    // 安全のため microtask を一周
    await Promise.resolve();

    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it("updates in-memory rooms when payload has detail", () => {
    expect.assertions(2);

    const getSpy = vi.spyOn(mockedAxios, "get").mockResolvedValue({ data: [], status: 200 } as any);

    primeUser();
    const store = useLiveRoomsStore();

    store.applyLiveRoomsChanged({
      room: "/live",
      isLive: true,
      publisherName: "pub",
      audioOnly: false,
    } as any);

    expect(store.rooms).toStrictEqual([
      { room: "/live", isLive: true, publisherName: "pub", audioOnly: false },
    ]);
    expect(getSpy).not.toHaveBeenCalled();
  });
});
