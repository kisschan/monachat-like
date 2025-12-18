export async function waitForIceGatheringComplete(
  pc: RTCPeerConnection,
  timeoutMs = 3000,
): Promise<void> {
  if (pc.iceGatheringState === "complete") return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const listener = () => {
      if (pc.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      pc.removeEventListener("icegatheringstatechange", listener);
    };

    pc.addEventListener("icegatheringstatechange", listener);
  });
}
