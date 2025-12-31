import { describe, it, expect, beforeEach } from "vitest";
import { RoomsLiveInfo } from "./RoomsLiveInfo";

describe.sequential("RoomsLiveInfo.get should return the correct data", () => {
  const store = RoomsLiveInfo.getInstance();

  beforeEach(() => store.clearAll());
  it("未登録ならnullを返す", () => {
    expect(store.get("もなちゃと")).toBeNull();
  });

  it("登録済みならそのまま返す", () => {
    const payload = {
      room: "もなちゃと",
      isLive: true,
      publisherName: "Alice",
    };
    store.set(payload);
    expect(store.get("もなちゃと")).toEqual(payload);
  });

  it("roomの前後空白はtrimされて同じキーとして扱う", () => {
    const payload = {
      room: " もなちゃと ",
      isLive: true,
      publisherName: "Alice",
    };
    store.set(payload);
    // get側もtrimされる想定（key(room).trim()）
    expect(store.get("もなちゃと")).toEqual(payload);
    expect(store.get(" もなちゃと ")).toEqual(payload);
  });
});

describe.sequential("RoomsLiveInfo.getLivePublisherName (raw)", () => {
  const store = RoomsLiveInfo.getInstance();

  beforeEach(() => store.clearAll());

  it("配信中で名前ありならそのまま返す", () => {
    store.set({ room: "もなちゃと", isLive: true, publisherName: "Alice" });
    expect(store.getLivePublisherName("もなちゃと")).toBe("Alice");
  });

  it("配信中で空白名なら空白のまま返す", () => {
    store.set({ room: "もなちゃと", isLive: true, publisherName: "   " });
    expect(store.getLivePublisherName("もなちゃと")).toBe("   ");

    store.set({ room: "room2", isLive: true, publisherName: "" });
    expect(store.getLivePublisherName("room2")).toBe("");
  });

  it("未登録または配信していないならnull", () => {
    expect(store.getLivePublisherName("もなちゃと")).toBeNull();

    store.set({ room: "もなちゃと", isLive: false, publisherName: "Alice" });
    expect(store.getLivePublisherName("もなちゃと")).toBeNull();
  });

  it("配信中で publisherName=null なら null を返す（raw）", () => {
    store.set({ room: "もなちゃと", isLive: true, publisherName: null });
    expect(store.getLivePublisherName("もなちゃと")).toBeNull();
  });
});
