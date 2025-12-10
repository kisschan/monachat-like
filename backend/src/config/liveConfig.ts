const SRS_WHIP_BASE = process.env.SRS_WHIP_BASE;

export const isLiveConfigured =
  typeof SRS_WHIP_BASE === "string" && SRS_WHIP_BASE.length > 0;

if (!isLiveConfigured) {
  console.warn(
    "[live] SRS_WHIP_BASE is not set. Live streaming will be disabled."
  );
}

export function getWhipBase(): string {
  if (!isLiveConfigured) {
    throw new Error("SRS_WHIP_BASE is not configured");
  }
  return SRS_WHIP_BASE as string;
}
