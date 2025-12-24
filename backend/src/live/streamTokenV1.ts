import * as crypto from "crypto";

export type StreamTokenScope = "whip" | "whep";

export type TokenVerifyResult =
  | { ok: true; reason: null }
  | {
      ok: false;
      reason: "missing-params" | "bad-format" | "expired" | "invalid-signature";
    };

const MIN_SECRET_LEN = 32;

export function signStreamTokenV1(args: {
  secret: string;
  streamKey: string;
  expiresAt: number;
  scope: StreamTokenScope;
}): string {
  const { secret, streamKey, expiresAt, scope } = args;

  if (typeof secret !== "string" || secret.length < MIN_SECRET_LEN) {
    // 既存実装の挙動に合わせる（misconfigured はバグ扱い）
    throw new Error("WHIP_TOKEN_SECRET is not configured correctly");
  }

  // ★ scope を payload に含める
  const payload = `${scope}:${streamKey}:${expiresAt}`;
  const mac = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${scope}:${mac}.${expiresAt}`;
}

export function verifyStreamTokenV1(args: {
  secret: string;
  streamParam: string | null;
  tokenParam: string | null;
  scope: StreamTokenScope;
  nowSec: number;
}): TokenVerifyResult {
  const { secret, streamParam, tokenParam, scope, nowSec } = args;

  if (!streamParam || !tokenParam)
    return { ok: false, reason: "missing-params" };
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LEN) {
    return { ok: false, reason: "invalid-signature" };
  }

  // token: scope:mac.exp
  const dot = tokenParam.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "bad-format" };

  const left = tokenParam.slice(0, dot); // scope:mac
  const expStr = tokenParam.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp <= 0)
    return { ok: false, reason: "bad-format" };

  if (exp < nowSec) return { ok: false, reason: "expired" };

  const colon = left.indexOf(":");
  if (colon <= 0) return { ok: false, reason: "bad-format" };

  const scopePart = left.slice(0, colon);
  const mac = left.slice(colon + 1);

  // ★ scope を突き合わせ（不一致は invalid-signature に寄せる）
  if (scopePart !== scope) return { ok: false, reason: "invalid-signature" };

  // ★ scope を含めて再計算
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${scope}:${streamParam}:${exp}`)
    .digest("base64url");

  try {
    const macBuf = Buffer.from(mac, "base64url");
    const expectedBuf = Buffer.from(expected, "base64url");
    if (macBuf.length !== expectedBuf.length)
      return { ok: false, reason: "invalid-signature" };

    const a = new Uint8Array(
      macBuf.buffer,
      macBuf.byteOffset,
      macBuf.byteLength
    );
    const b = new Uint8Array(
      expectedBuf.buffer,
      expectedBuf.byteOffset,
      expectedBuf.byteLength
    );

    if (!crypto.timingSafeEqual(a, b))
      return { ok: false, reason: "invalid-signature" };
  } catch {
    return { ok: false, reason: "invalid-signature" };
  }

  return { ok: true, reason: null };
}
