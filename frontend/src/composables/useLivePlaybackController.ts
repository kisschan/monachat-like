import { reactive, ref } from "vue";
import axios from "axios";
import { fetchWebrtcConfig } from "@/api/liveWebRTC";
import {
  startWhepSubscribe,
  WhepRequestError,
  type WhepSubscribeHandle,
} from "@/webrtc/whepClient";

export type LivePlaybackStartArgs = {
  roomId: string;
  token: string;
  mediaElement: HTMLMediaElement;
  audioOnly: boolean;
};

const state = reactive({
  isPlaying: false,
  isBusy: false,
  error: null as string | null,
});

const subscribeHandle = ref<WhepSubscribeHandle | null>(null);
const watchSubscribeInFlight = ref<Promise<WhepSubscribeHandle> | null>(null);
const pendingStop = ref(false);

const handleWatchStartError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const code = error.response?.data?.error;

    if (status === 404 || status === 410) {
      return "配信が終了しています。ページを再読み込みしてください。";
    }
    if (status === 403 && code === "live-disabled") {
      return "この部屋では配信機能は利用できません。";
    }
    return "視聴開始に失敗しました。";
  }

  if (error instanceof WhepRequestError) {
    if (error.status === 404 || error.status === 410) {
      return "配信が終了しています。ページを再読み込みしてください。";
    }
    if (error.status === 403) {
      return `視聴の認可に失敗しました。もう一度お試しください。(status=${error.status})`;
    }
    if (error.status === 401) {
      return "視聴権限がありません。ページを再読み込みしてください。";
    }
    if (error.status === 400) {
      return "視聴開始に失敗しました。（接続に問題があります）";
    }
    return `視聴開始に失敗しました。(status=${error.status})`;
  }

  return "視聴開始に失敗しました。";
};

const stopHandleSafely = async (handle: WhepSubscribeHandle) => {
  try {
    await handle.stop();
  } catch {
    // ignore
  }
};

export const useLivePlaybackController = () => {
  const start = async (args: LivePlaybackStartArgs) => {
    if (state.isBusy || subscribeHandle.value || watchSubscribeInFlight.value) return;
    if (!args.roomId || !args.token || !args.mediaElement) return;

    state.isBusy = true;
    state.error = null;

    let subscribePromise: Promise<WhepSubscribeHandle> | null = null;

    try {
      const config = await fetchWebrtcConfig(args.roomId, args.token);
      if (!config.whepUrl) {
        throw new Error("whep-url-missing");
      }

      subscribePromise = startWhepSubscribe(config.whepUrl, args.mediaElement, {
        audioOnly: args.audioOnly,
      });
      watchSubscribeInFlight.value = subscribePromise;

      const handle = await subscribePromise;

      if (pendingStop.value) {
        pendingStop.value = false;
        await stopHandleSafely(handle);
        return;
      }

      if (subscribeHandle.value) {
        await stopHandleSafely(handle);
      } else {
        subscribeHandle.value = handle;
        state.isPlaying = true;
      }
    } catch (e: unknown) {
      state.error = handleWatchStartError(e);
    } finally {
      if (watchSubscribeInFlight.value === subscribePromise) {
        watchSubscribeInFlight.value = null;
      }
      state.isBusy = false;
      if (!subscribeHandle.value) {
        state.isPlaying = false;
      }
    }
  };

  const stop = async () => {
    if (watchSubscribeInFlight.value && !subscribeHandle.value) {
      pendingStop.value = true;
      state.isPlaying = false;
      return;
    }

    if (!subscribeHandle.value) {
      pendingStop.value = false;
      state.isPlaying = false;
      return;
    }

    state.isBusy = true;
    state.error = null;

    try {
      await subscribeHandle.value.stop();
      subscribeHandle.value = null;
    } catch {
      state.error = "視聴停止に失敗しました。";
    } finally {
      state.isBusy = false;
      state.isPlaying = false;
      subscribeHandle.value = null;
    }
  };

  return {
    state,
    start,
    stop,
  };
};
