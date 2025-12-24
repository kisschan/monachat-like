import { describe, it, expect } from "vitest";
import { requireCreatedSdpWithLocation } from "@/webrtc/webRTChelper";

type MockRes = {
  status: number;
  headers: { get: (key: string) => string | null };
  text: () => Promise<string>;
};

function mockResponse(opts: {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}): MockRes {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    map.set(k.toLowerCase(), v);
  }
  return {
    status: opts.status,
    headers: {
      get: (key: string) => map.get(key.toLowerCase()) ?? null,
    },
    text: async () => opts.body ?? "",
  };
}

describe("requireCreatedSdpWithLocation", () => {
  it("wHIP: Location(SRS) + baseUrl(auth/app/stream) をマージして resourceUrl を返す", async () => {
    expect.hasAssertions();
    const baseUrl = "https://live.monachat.tech/whip/?app=live&stream=abc&auth=whip%3Axxx";

    // SRSが返すLocation（例）：/rtc/v1/whip に token/session が付く
    const locationHeader =
      "https://live.monachat.tech/rtc/v1/whip/?app=live&stream=abc&session=s1&token=srsToken";

    const sdp = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\n";
    const res = mockResponse({
      status: 201,
      headers: {
        "Content-Type": "application/sdp",
        Location: locationHeader,
      },
      body: sdp,
    });

    const out = await requireCreatedSdpWithLocation(res as Response, baseUrl, "whip");

    expect(out.answerSdp).toContain("v=");
    const u = new URL(out.resourceUrl);

    // normalize: /rtc/v1/whip -> /whip (その後 merge で /whip/ に補正)
    expect(u.pathname).toBe("/whip/");

    // SRS由来 token/session は維持される
    expect(u.searchParams.get("token")).toBe("srsToken");
    expect(u.searchParams.get("session")).toBe("s1");

    // baseUrl由来 auth/app/stream が補完される
    expect(u.searchParams.get("auth")).toBe("whip:xxx"); // URLデコードされる
    expect(u.searchParams.get("app")).toBe("live");
    expect(u.searchParams.get("stream")).toBe("abc");
  });

  it("wHEP: baseUrl が legacy token しか持ってない場合、auth にコピーする（移行用）", async () => {
    expect.hasAssertions();
    const baseUrl = "https://live.monachat.tech/whep/?app=live&stream=def&token=whep%3Ayyy";

    const locationHeader =
      "https://live.monachat.tech/rtc/v1/whep/?app=live&stream=def&session=s2&token=srsToken2";

    const sdp = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\n";
    const res = mockResponse({
      status: 201,
      headers: {
        "Content-Type": "application/sdp",
        Location: locationHeader,
      },
      body: sdp,
    });

    const out = await requireCreatedSdpWithLocation(res as Response, baseUrl, "whep");

    const u = new URL(out.resourceUrl);
    expect(u.pathname).toBe("/whep/");

    // SRS token/session は維持
    expect(u.searchParams.get("token")).toBe("srsToken2");
    expect(u.searchParams.get("session")).toBe("s2");

    // legacy token を auth にコピー
    expect(u.searchParams.get("auth")).toBe("whep:yyy");
    expect(u.searchParams.get("app")).toBe("live");
    expect(u.searchParams.get("stream")).toBe("def");
  });

  it("location が無い場合はエラーになる（CORS Expose/ヘッダ欠落検出）", async () => {
    expect.hasAssertions();
    const baseUrl = "https://live.monachat.tech/whip/?app=live&stream=abc&auth=whip%3Axxx";

    const sdp = "v=0\r\n";
    const res = mockResponse({
      status: 201,
      headers: {
        "Content-Type": "application/sdp",
        // Location なし
      },
      body: sdp,
    });

    await expect(requireCreatedSdpWithLocation(res as Response, baseUrl, "whip")).rejects.toThrow(
      /missing Location/i,
    );
  });

  it("201以外はエラーになる", async () => {
    expect.hasAssertions();
    const baseUrl = "https://live.monachat.tech/whip/?app=live&stream=abc&auth=whip%3Axxx";

    const res = mockResponse({
      status: 403,
      headers: {
        "Content-Type": "text/html",
      },
      body: "forbidden",
    });

    await expect(requireCreatedSdpWithLocation(res as Response, baseUrl, "whip")).rejects.toThrow(
      /status=403/,
    );
  });
});
