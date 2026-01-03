export function joinUrl(base: string, ...segments: string[]): string {
  const normalizedBase = (base ?? "").replace(/\/+$/u, "");
  const normalizedSegments = segments
    .map((segment) => (segment ?? "").replace(/^\/+/u, "").replace(/\/+$/u, ""))
    .filter((segment) => segment.length > 0);

  if (!normalizedBase) {
    return normalizedSegments.join("/");
  }

  return [normalizedBase, ...normalizedSegments].join("/");
}
