const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

function normalizeResourceLocation(
  locationHeader: string,
  baseUrl: string,
  kind: "whip" | "whep",
): string {
  const base = new URL(baseUrl);

  // Location が絶対URLでも、origin は強制的に base に寄せる（意図しないhostへ飛ばない）
  const raw = new URL(locationHeader, base);
  const safe =
    raw.origin === base.origin ? raw : new URL(raw.pathname + raw.search + raw.hash, base);

  // SRS の /rtc/v1/* を public endpoint に寄せる（/rtc を塞ぐ方針と整合）
  const fromPrefix = kind === "whip" ? "/rtc/v1/whip" : "/rtc/v1/whep";
  const toPrefix = kind === "whip" ? "/whip" : "/whep";

  if (safe.pathname.startsWith(fromPrefix)) {
    safe.pathname = safe.pathname.replace(fromPrefix, toPrefix);
  }

  return safe.toString();
}

export async function requireCreatedSdpWithLocation(
  res: Response,
  baseUrl: string,
  kind: "whip" | "whep",
): Promise<{ resourceUrl: string; answerSdp: string }> {
  // 仕様通り 201 を必須化（曖昧な成功を許さない）
  if (res.status !== 201) {
    const body = await res.text().catch(() => "");
    throw new Error(`${kind.toUpperCase()} POST failed: status=${res.status} body=${body}`);
  }

  const ct = res.headers.get("Content-Type") ?? "";
  if (!ct.includes("application/sdp")) {
    const body = await res.text().catch(() => "");
    throw new Error(`${kind.toUpperCase()} unexpected Content-Type=${ct} body=${body}`);
  }

  const locationHeader = res.headers.get("Location");
  if (!isNonEmptyString(locationHeader)) {
    // ここが「Exposeされてない/ヘッダ欠落」の検出点
    throw new Error(
      `${kind.toUpperCase()} missing Location header (check CORS: Access-Control-Expose-Headers: Location)`,
    );
  }

  const resourceUrl = normalizeResourceLocation(locationHeader, baseUrl, kind);
  const answerSdp = await res.text();

  if (!isNonEmptyString(answerSdp) || !answerSdp.includes("v=")) {
    throw new Error(`${kind.toUpperCase()} invalid SDP answer body`);
  }

  return { resourceUrl, answerSdp };
}
