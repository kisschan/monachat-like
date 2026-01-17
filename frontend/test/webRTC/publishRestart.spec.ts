import { describe, it, expect, vi } from "vitest";
import { restartPublishSessionSafely } from "@/webrtc/publishRestart";

describe("restartPublishSessionSafely", () => {
  it("stops publish safely when restart fails", async () => {
    expect.hasAssertions();
    const restartPublishSession = vi.fn(async () => {
      throw new Error("restart-failed");
    });
    const stopPublishSafely = vi.fn(async () => {});
    const onRestartError = vi.fn();
    const onUiError = vi.fn();

    await restartPublishSessionSafely({
      restartPublishSession,
      stopPublishSafely,
      onRestartError,
      onUiError,
    });

    expect(onRestartError).toHaveBeenCalledTimes(1);
    expect(onUiError).toHaveBeenCalledTimes(1);
    expect(stopPublishSafely).toHaveBeenCalledWith("restart-failed", {
      uiPolicy: "user-action",
      preserveUiErrors: true,
    });
  });
});
