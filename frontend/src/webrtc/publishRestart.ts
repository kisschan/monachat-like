export type RestartPublishSessionSafelyDeps = {
  restartPublishSession: () => Promise<void>;
  stopPublishSafely: (
    reason: string,
    opts: { uiPolicy?: "silent" | "user-action"; preserveUiErrors?: boolean },
  ) => Promise<void>;
  onRestartError?: (error: unknown) => void;
  onUiError?: () => void;
};

export const restartPublishSessionSafely = async ({
  restartPublishSession,
  stopPublishSafely,
  onRestartError,
  onUiError,
}: RestartPublishSessionSafelyDeps): Promise<boolean> => {
  try {
    await restartPublishSession();
    return true;
  } catch (e) {
    onRestartError?.(e);
    onUiError?.();
    await stopPublishSafely("restart-failed", {
      uiPolicy: "user-action",
      preserveUiErrors: true,
    });
    return false;
  }
};
