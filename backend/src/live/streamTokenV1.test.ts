import { describe, it, expect } from "vitest";
import { signStreamTokenV1, verifyStreamTokenV1 } from "./streamTokenV1";

describe("streamTokenV1 invariants (currently expected to fail)", () => {
  it("roundtrip: token signed by signStreamTokenV1 should be accepted by verifyStreamTokenV1", () => {
    const secret = "a".repeat(32);
    const streamKey = "test-stream";
    const expiresAt = Math.floor(Date.now() / 1000) + 60;

    const streamV1 = signStreamTokenV1({
      secret,
      streamKey,
      expiresAt,
      scope: "whip",
    });

    const v = verifyStreamTokenV1({
      secret,
      streamParam: streamKey,
      tokenParam: streamV1,
      scope: "whip",
      nowSec: Math.floor(Date.now() / 1000),
    });

    expect(v.ok).toBe(true);
  });

  it("scope separation: even if attacker strips scope prefix, whep token must NOT be usable as whip token", () => {
    const secret = "a".repeat(32);
    const streamKey = "test-stream";
    const expiresAt = Math.floor(Date.now() / 1000) + 60;

    const whepToken = signStreamTokenV1({
      secret,
      streamKey,
      expiresAt,
      scope: "whep",
    });

    // 攻撃者が prefix を剥がして hmac.exp だけにする想定
    const stripped = whepToken.replace(/^[a-z]+:/, "");

    const v = verifyStreamTokenV1({
      secret,
      streamParam: streamKey,
      tokenParam: stripped,
      scope: "whip",
      nowSec: Math.floor(Date.now() / 1000),
    });

    expect(v.ok).toBe(false);
  });
});
