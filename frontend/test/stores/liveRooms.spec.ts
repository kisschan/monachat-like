import { createPinia, setActivePinia } from "pinia";
import { vi, expect, describe, beforeEach, it } from "vitest";
import axios from "axios";
import { useLiveRoomsStore } from "@/stores/liveRooms";
import { useUserStore } from "@/stores/user";

vi.mock("axios");

describe("liveRooms store", () => {
  const mockedAxios = axios as unknown as vi.Mocked<typeof axios>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  const primeUser = () => {
    const user = useUserStore();
    user.$patch({
      myToken: "token",
      currentRoom: { id: "/live", name: "live", img_url: "" },
    });
  };

  it("reloads from API when socket payload lacks detail", async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: [], status: 200 });
    primeUser();
    const store = useLiveRoomsStore();

    store.applyLiveRoomsChanged({ room: "/live" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it("updates in-memory rooms when payload has detail", async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: [], status: 200 });
    primeUser();
    const store = useLiveRoomsStore();

    store.applyLiveRoomsChanged({
      room: "/live",
      isLive: true,
      publisherName: "pub",
      audioOnly: false,
    });

    expect(store.rooms).toEqual([
      { room: "/live", isLive: true, publisherName: "pub", audioOnly: false },
    ]);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
