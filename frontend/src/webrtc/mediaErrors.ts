export class MediaAcquireError extends Error {
  code:
    | "permission-denied"
    | "no-device"
    | "constraint-failed"
    | "not-supported"
    | "screen-audio-unavailable"
    | "unknown";

  constructor(code: MediaAcquireError["code"], message?: string) {
    super(message);
    this.code = code;
  }
}

export const toMediaAcquireError = (e: unknown): MediaAcquireError => {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError" || e.name === "SecurityError") {
      return new MediaAcquireError("permission-denied", e.message);
    }
    if (e.name === "NotFoundError") {
      return new MediaAcquireError("no-device", e.message);
    }
    if (e.name === "OverconstrainedError") {
      return new MediaAcquireError("constraint-failed", e.message);
    }
    if (e.name === "NotSupportedError") {
      return new MediaAcquireError("not-supported", e.message);
    }
  }

  // getDisplayMedia 未実装環境で起きがち
  if (e instanceof TypeError) {
    return new MediaAcquireError("not-supported", e.message);
  }

  return new MediaAcquireError("unknown", e instanceof Error ? e.message : String(e));
};
