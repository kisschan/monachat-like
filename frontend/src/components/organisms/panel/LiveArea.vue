<template>
  <section class="live-area">
    <header class="live-header">
      <div v-if="!liveEnabled">この部屋では配信機能は利用できません。</div>
      <template v-else>
        <div v-if="isLive">配信中: {{ publisherName ?? "名無し" }}</div>
        <div v-else>配信なし</div>
      </template>
    </header>

    <section v-if="liveEnabled" class="live-grid">
      <!-- 左：コントロールカード（配信者＋視聴UI） -->
      <section class="live-card live-card--controls">
        <h3>配信者コントロール</h3>

        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        <!-- 配信モード（開始前に選択） -->
        <div class="mode-switch">
          <label>
            <input
              v-model="publishMode"
              type="radio"
              value="camera"
              :disabled="isBusyPublish || isLive"
            />
            カメラ＋マイク
          </label>

          <label>
            <input
              v-model="publishMode"
              type="radio"
              value="screen"
              :disabled="isBusyPublish || isLive"
            />
            画面＋画面音声
          </label>

          <label>
            <input
              v-model="publishMode"
              type="radio"
              value="audio"
              :disabled="isBusyPublish || isLive"
            />
            マイクのみ
          </label>
        </div>

        <!-- screenの注意（常時表示でも、screen選択時のみでもOK） -->
        <p v-if="publishMode === 'screen'" class="hint">
          画面音声は「共有対象」と「共有ダイアログの音声共有設定」に依存します。
          音声が取得できない場合は配信開始できません。
        </p>

        <!-- screen音声が取れなかった時の専用表示 -->
        <p v-if="screenAudioNotice" class="error">
          {{ screenAudioNotice }}
        </p>

        <div class="buttons">
          <PrimeButton label="配信開始" :disabled="!canStartPublish" @click="onClickStartPublish" />
          <PrimeButton label="配信停止" :disabled="!canStopPublish" @click="onClickStopPublish" />
        </div>

        <p v-if="isMyLive" class="hint">あなたが現在の配信者です。</p>

        <hr class="live-sep" />

        <h3>視聴</h3>

        <div class="mode-switch">
          <label
            ><input v-model="watchMode" type="radio" value="av" :disabled="isAudioOnlyLive" />
            映像＋音声</label
          >
          <label><input v-model="watchMode" type="radio" value="audio" /> 音声のみ</label>
        </div>

        <div class="buttons">
          <PrimeButton label="視聴開始" :disabled="!canStartWatch" @click="onClickStartWatch" />
          <PrimeButton label="視聴停止" :disabled="!canStopWatch" @click="onClickStopWatch" />
        </div>
      </section>

      <!-- 右：プレイヤーカード（videoだけ） -->
      <section class="live-card live-card--player">
        <video ref="videoRef" class="live-video" autoplay playsinline controls></video>

        <p v-if="isAudioOnlyLive" class="hint">
          現在の配信は音声のみです。視聴は音声のみとなります。
        </p>
      </section>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import axios from "axios";
import { useUserStore } from "@/stores/user";
import { useRoomStore } from "@/stores/room";
import { fetchLiveStatus, startLive, stopLive } from "@/api/liveAPI";
import { fetchWebrtcConfig } from "@/api/liveWebRTC";
import { socketIOInstance, type LiveStatusChangePayload } from "@/socketIOInstance";
import {
  MediaAcquireError,
  PublishCancelledError,
  startWhipPublish,
  type WhipPublishHandle,
  type PublishMode,
} from "@/webrtc/whipClient";
import {
  WhepRequestError,
  startWhepSubscribe,
  type WhepSubscribeHandle,
} from "@/webrtc/whepClient";
import PrimeButton from "primevue/button";

const userStore = useUserStore();
const roomStore = useRoomStore();

const roomId = computed(() => userStore.currentRoom?.id ?? "");
const token = computed(() => userStore.myToken ?? "");
const myId = computed(() => userStore.myID);

// 共通状態
const isLive = ref(false);
const publisherName = ref<string | null>(null);
const publisherId = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const publishMode = ref<PublishMode>("camera");
const screenAudioNotice = ref<string | null>(null);

// 配信者側
const isBusyPublish = ref(false);
const publishHandle = ref<WhipPublishHandle | null>(null);
const isStoppingPublish = ref(false);
let publishAttemptSeq = 0;
const cancelledPublishAttempts = new Set<number>();
const activePublishCtx = ref<{ roomId: string; token: string } | null>(null);
const lastPublishCtx = ref<{ roomId: string; token: string } | null>(null);
class PublishStartAbortedError extends Error {}
const publishStartEpoch = ref(0);
const abortInFlightPublishStart = () => {
  publishStartEpoch.value++;
};

// 視聴者側
const isBusyWatch = ref(false);
const subscribeHandle = ref<WhepSubscribeHandle | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
const watchMode = ref<"av" | "audio">("av");
const isWatchAudioOnly = computed(() => {
  // 配信が audio-only のときは強制
  if (isAudioOnlyLive.value) return true;
  return watchMode.value === "audio";
});
const isAudioOnlyLive = ref(false);

const liveEnabled = computed(() => {
  const id = roomId.value;
  if (!id) return false;

  const meta = roomStore.roomObj(id);
  // roomObj(id) が undefined の場合もあるので ? を付ける
  return meta?.liveEnabled === true;
});

const isMyLive = computed(
  () => isLive.value && publisherId.value != null && publisherId.value === myId.value,
);

//画面共有機能

const clearPublishUiErrors = () => {
  errorMessage.value = null;
  screenAudioNotice.value = null;
};

// =====================
// favicon 差し替え（配信者のみ）
// =====================
type FaviconBackup = { el: HTMLLinkElement; href: string | null };

const faviconBackup = ref<FaviconBackup[] | null>(null);
const createdFaviconEl = ref<HTMLLinkElement | null>(null);

// 配信者時に使う favicon（public に置いたやつ）
const LIVE_FAVICON_HREF = "/favicon_live.png";

const captureFavicons = (): void => {
  if (typeof document === "undefined") return;
  if (faviconBackup.value) return; // 既に退避済み

  const els = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"]'),
  );

  // 何も無い場合は 1 つ作って差し替え対象にする
  if (els.length === 0) {
    const link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
    createdFaviconEl.value = link;
    faviconBackup.value = [{ el: link, href: null }];
    return;
  }

  faviconBackup.value = els.map((el) => ({ el, href: el.getAttribute("href") }));
};

const setFavicon = (href: string): void => {
  if (typeof document === "undefined") return;
  captureFavicons();
  if (!faviconBackup.value) return;

  for (const { el } of faviconBackup.value) {
    el.setAttribute("href", href);
  }
};

const restoreFavicon = (): void => {
  if (typeof document === "undefined") return;
  if (!faviconBackup.value) return;

  for (const { el, href } of faviconBackup.value) {
    if (href == null) el.removeAttribute("href");
    else el.setAttribute("href", href);
  }

  // 自分で作った要素は消して元に戻す
  if (createdFaviconEl.value) {
    createdFaviconEl.value.remove();
    createdFaviconEl.value = null;
  }

  faviconBackup.value = null;
};

// 配信者のときだけ差し替え
watch(
  isMyLive,
  (nowPublisher) => {
    if (nowPublisher) setFavicon(LIVE_FAVICON_HREF);
    else restoreFavicon();
  },
  { immediate: true },
);

// ボタン有効条件

const canStartPublish = computed(() => {
  return (
    liveEnabled.value &&
    !isBusyPublish.value &&
    !isLive.value &&
    publishHandle.value === null &&
    !!roomId.value &&
    !!token.value
  );
});

const canStartWatch = computed(() => {
  return (
    liveEnabled.value &&
    !isBusyWatch.value &&
    isLive.value &&
    !!roomId.value &&
    !!token.value &&
    subscribeHandle.value === null
  );
});

const canStopPublish = computed(() => {
  return (
    !isBusyPublish.value &&
    (isMyLive.value ||
      publishHandle.value !== null ||
      activePublishCtx.value !== null ||
      lastPublishCtx.value !== null)
  );
});

const canStopWatch = computed(() => {
  return !isBusyWatch.value && subscribeHandle.value !== null;
});

const loadStatusFor = async (ctx: { roomId: string; token: string }) => {
  const res = await fetchLiveStatus(ctx.roomId, ctx.token);

  // 今見てる部屋と違うなら、UI状態は更新しない
  if (userStore.currentRoom?.id !== ctx.roomId) return;

  isLive.value = res.isLive;
  publisherName.value = res.publisherName;
  publisherId.value = res.publisherId;
  isAudioOnlyLive.value = res.audioOnly ?? false;
};

const loadStatus = async () => {
  if (!roomId.value || !token.value) return;

  const res = await fetchLiveStatus(roomId.value, token.value);
  isLive.value = res.isLive;
  publisherName.value = res.publisherName;
  publisherId.value = res.publisherId;
  isAudioOnlyLive.value = res.audioOnly ?? false;
};

const isPublishAudioOnly = computed(() => publishMode.value === "audio");

const stopPublishSafely = async (reason: string): Promise<void> => {
  console.debug("stopPublishSafely called:", reason);
  if (isStoppingPublish.value) return;

  isStoppingPublish.value = true;
  isBusyPublish.value = true;
  clearPublishUiErrors();

  // ctx が無いなら「今の roomId/token」で最後の一撃を用意
  const fallbackCtx =
    roomId.value && token.value ? { roomId: roomId.value, token: token.value } : null;

  const ctx = activePublishCtx.value ?? lastPublishCtx.value ?? fallbackCtx;

  const handle = publishHandle.value;
  publishHandle.value = null;

  try {
    if (handle) {
      try {
        await handle.stop();
      } catch {}
    }

    if (ctx) {
      try {
        await stopLive(ctx.roomId, ctx.token);
        // 成功したら ctx を消す（active を優先して消す）
        if (ctx) {
          // stopLive 成功後
          if (activePublishCtx.value?.roomId === ctx.roomId) activePublishCtx.value = null;
          if (lastPublishCtx.value?.roomId === ctx.roomId) lastPublishCtx.value = null;
        }
      } catch (e) {
        if (axios.isAxiosError(e)) {
          const status = e.response?.status;
          const code = e.response?.data?.error;
          if (status === 403 && code === "not-publisher") {
            errorMessage.value =
              "配信者ではないため停止できません（状態が更新されている可能性があります）。";
            activePublishCtx.value = null;
            lastPublishCtx.value = null;
          } else {
            errorMessage.value =
              "配信停止をサーバへ通知できませんでした（通信/サーバ障害の可能性）。";
          }
        } else {
          errorMessage.value = "配信停止をサーバへ通知できませんでした（通信障害の可能性）。";
        }
      }
    }

    // 状態同期も ctx 優先でOK
    try {
      if (ctx && ctx.roomId === roomId.value) {
        await loadStatusFor(ctx);
      } else {
        await loadStatus(); // 今いる部屋の状態を再取得
      }
    } catch (e) {
      console.error("failed to sync live status after stop", e);
      if (errorMessage.value == null) {
        errorMessage.value = "停止後の状態更新に失敗しました。ページ再読み込みで確認してください。";
      }
    }
  } finally {
    isBusyPublish.value = false;
    isStoppingPublish.value = false;
  }
};

const onClickStartPublish = async () => {
  const rid = roomId.value;
  const tok = token.value;
  if (!rid || !tok) return;
  if (!canStartPublish.value) return;

  clearPublishUiErrors();
  isBusyPublish.value = true;

  const epoch = ++publishStartEpoch.value;
  const ensureNotAborted = () => {
    if (epoch !== publishStartEpoch.value) throw new PublishStartAbortedError();
  };

  const attemptId = ++publishAttemptSeq;
  let needsRollback = false;
  let tmpHandle: WhipPublishHandle | null = null; // ★追加

  try {
    await startLive(rid, tok, isPublishAudioOnly.value);
    needsRollback = true;
    ensureNotAborted();

    activePublishCtx.value = { roomId: rid, token: tok };
    lastPublishCtx.value = { roomId: rid, token: tok };

    const config = await fetchWebrtcConfig(rid, tok);
    ensureNotAborted();
    if (!config.whipUrl) throw new Error("whip-url-missing");

    tmpHandle = await startWhipPublish(config.whipUrl, {
      mode: publishMode.value,
      onDisplayEnded: () => {
        if (publishHandle.value != null) {
          void stopPublishSafely("display-ended");
          return;
        }
        cancelledPublishAttempts.add(attemptId);
      },
    });

    // aborted ならここで止められる
    ensureNotAborted();

    // ★ここで先に publishHandle に入れてレース窓を潰す
    publishHandle.value = tmpHandle;
    tmpHandle = null;

    if (cancelledPublishAttempts.has(attemptId)) {
      cancelledPublishAttempts.delete(attemptId);
      await publishHandle.value.stop().catch(() => {});
      publishHandle.value = null;

      throw new PublishCancelledError("display-ended");
    }

    needsRollback = false;

    await loadStatusFor({ roomId: rid, token: tok }).catch(() => {});
  } catch (e) {
    if (e instanceof PublishStartAbortedError) {
      if (tmpHandle) await tmpHandle.stop().catch(() => {});
      if (needsRollback) {
        try {
          await stopLive(rid, tok);
          activePublishCtx.value = null;
          lastPublishCtx.value = null;
        } catch {
          // 失敗時は ctx を残す（再試行可能にする）
          errorMessage.value =
            "配信開始を中断しましたが、サーバへの停止通知に失敗しました。配信停止を押して再試行してください。";
        } finally {
          await loadStatusFor({ roomId: rid, token: tok }).catch(() => {});
        }
      }
      return;
    }
    await onClickStartPublishCatch(e, needsRollback, { roomId: rid, token: tok });
  } finally {
    if (tmpHandle) await tmpHandle.stop().catch(() => {}); // ★保険（任意だが強い）
    cancelledPublishAttempts.delete(attemptId);
    // ★ stopPublishSafely が走ってるなら、busy解除しない
    if (!isStoppingPublish.value) {
      isBusyPublish.value = false;
    }
  }
};

// エラー時の処理
const onClickStartPublishCatch = async (
  e: unknown,
  rollback: boolean,
  ctx: { roomId: string; token: string },
) => {
  if (e instanceof PublishCancelledError && e.reason === "display-ended") {
    try {
      await stopLive(ctx.roomId, ctx.token);
      activePublishCtx.value = null;
      lastPublishCtx.value = null;
    } catch {
      errorMessage.value =
        "画面共有が終了しましたが、サーバへの停止通知に失敗しました。配信停止を押して再試行してください。";
    } finally {
      await loadStatusFor(ctx).catch(() => {});
    }
    return;
  }
  if (axios.isAxiosError(e)) {
    // 既存のままでOK
    const status = e.response?.status;
    const code = e.response?.data?.error;

    if (status === 409 && code === "already-live") {
      errorMessage.value = "この部屋では既に他のユーザーが配信中です。";
    } else if (status === 403 && code === "live-disabled") {
      errorMessage.value = "この部屋では配信機能は利用できません。";
    } else if (status === 403 && code === "forbidden") {
      errorMessage.value = "配信権限がありません。";
    } else {
      errorMessage.value = "配信開始に失敗しました（サーバーエラー）。";
    }
  } else if (e instanceof MediaAcquireError) {
    // screenはマイクを扱わないので、メッセージも「マイク/カメラ」固定にしない
    if (publishMode.value === "screen") {
      if (e.code === "screen-audio-unavailable") {
        // ここが「落とすけど納得させる」要
        screenAudioNotice.value =
          "画面音声を共有できませんでした。共有ダイアログで「音声を共有」を有効にするか、音声共有可能な対象（例：ブラウザのタブ）を選んでください。";
        errorMessage.value = "配信開始に失敗しました（画面音声を取得できません）。";
      } else if (e.code === "permission-denied") {
        errorMessage.value = "画面共有が拒否されました（ブラウザの権限/操作を確認してください）。";
      } else if (e.code === "not-supported") {
        errorMessage.value = "この端末/ブラウザでは画面共有配信に未対応です。";
      } else {
        errorMessage.value = "画面共有の取得に失敗しました。";
      }
    } else {
      // camera/audio 側の既存文言
      if (e.code === "permission-denied") {
        errorMessage.value = "マイクやカメラへのアクセスがブラウザに拒否されています。";
      } else if (e.code === "no-device") {
        errorMessage.value = "利用可能なマイク／カメラが見つかりません。";
      } else {
        errorMessage.value = "マイク／カメラの取得に失敗しました。";
      }
    }
  } else {
    errorMessage.value = "予期しないエラーが発生しました。";
  }

  if (rollback) {
    try {
      await stopLive(ctx.roomId, ctx.token);
      activePublishCtx.value = null;
      lastPublishCtx.value = null;
    } catch (e) {
      // 失敗時は ctx を残す（再試行できる）
      errorMessage.value =
        "配信開始に失敗し、サーバへの停止通知にも失敗しました。通信状況を確認し、配信停止を再度押してください。";
    } finally {
      await loadStatusFor(ctx).catch(() => {});
    }
  }
};

const onClickStopPublish = async () => {
  if (!roomId.value || !token.value) return;
  if (!canStopPublish.value) return;

  await stopPublishSafely("manual");
};

const onClickStartWatch = async () => {
  if (!roomId.value || !token.value) return;
  if (!canStartWatch.value) return;
  if (!videoRef.value) return;

  errorMessage.value = null;
  isBusyWatch.value = true;

  try {
    const config = await fetchWebrtcConfig(roomId.value, token.value);
    if (!config.whepUrl) {
      throw new Error("whep-url-missing");
    }

    subscribeHandle.value = await startWhepSubscribe(config.whepUrl, videoRef.value, {
      audioOnly: isWatchAudioOnly.value,
    });
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status;
      const code = e.response?.data?.error;

      if (status === 404 || status === 410) {
        errorMessage.value = "配信が終了しています。ページを再読み込みしてください。";
      } else if (status === 403 && code === "live-disabled") {
        errorMessage.value = "この部屋では配信機能は利用できません。";
      } else {
        errorMessage.value = "視聴開始に失敗しました。";
      }
    } else if (e instanceof WhepRequestError) {
      if (e.status === 404 || e.status === 410) {
        errorMessage.value = "配信が終了しています。ページを再読み込みしてください。";
      } else if (e.status === 403) {
        errorMessage.value = `視聴の認可に失敗しました。もう一度お試しください。(status=${e.status})`;
      } else if (e.status === 401) {
        errorMessage.value = "視聴権限がありません。ページを再読み込みしてください。";
      } else if (e.status === 400) {
        errorMessage.value = "視聴開始に失敗しました。（接続に問題があります）";
      } else {
        errorMessage.value = `視聴開始に失敗しました。(status=${e.status})`;
      }
    } else {
      errorMessage.value = "視聴開始に失敗しました。";
    }
  } finally {
    isBusyWatch.value = false;
  }
};

// 視聴停止
const onClickStopWatch = async () => {
  if (!canStopWatch.value) return;

  errorMessage.value = null;
  isBusyWatch.value = true;

  try {
    if (subscribeHandle.value) {
      await subscribeHandle.value.stop();
      subscribeHandle.value = null;
    }
  } catch (e: unknown) {
    errorMessage.value = "視聴停止に失敗しました。";
  } finally {
    isBusyWatch.value = false;
  }
};

// サーバ側の live_status_change を受けて状態を更新
const handleLiveStatusChange = (payload: LiveStatusChangePayload) => {
  if (!userStore.currentRoom || userStore.currentRoom.id !== payload.room) return;

  const wasLive = isLive.value;

  isLive.value = payload.isLive;
  publisherName.value = payload.publisherName;
  publisherId.value = payload.publisherId;
  isAudioOnlyLive.value = payload.audioOnly ?? false;

  if (!payload.isLive) {
    activePublishCtx.value = null;
    if (lastPublishCtx.value?.roomId === payload.room) {
      lastPublishCtx.value = null;
    }
  }

  // 視聴側
  if (!payload.isLive && subscribeHandle.value) {
    subscribeHandle.value.stop().catch(() => {});
    subscribeHandle.value = null;
  }

  // 配信側（サーバから isLive=false が飛んできたら止める）
  if (wasLive && !payload.isLive && publishHandle.value) {
    publishHandle.value.stop().catch(() => {});
    publishHandle.value = null;
  }
};

watch(
  () => userStore.currentRoom?.id,
  async (newRoomId, oldRoomId) => {
    if (newRoomId === oldRoomId) return;
    abortInFlightPublishStart();

    // 先に配信停止（サーバロック解除含む）
    if (activePublishCtx.value || publishHandle.value || lastPublishCtx.value) {
      await stopPublishSafely("room-change").catch(() => {});
    }

    // 視聴停止
    if (subscribeHandle.value) {
      await subscribeHandle.value.stop().catch(() => {});
      subscribeHandle.value = null;
    }

    // 表示状態をリセット
    isLive.value = false;
    publisherId.value = null;
    publisherName.value = null;

    if (!liveEnabled.value) return;

    // 部屋に入っているなら、その部屋の配信状態を再取得
    if (newRoomId && roomId.value && token.value) {
      try {
        await loadStatus();
      } catch (e) {
        console.error("failed to load live status after room change", e);
      }
    }
  },
);

// 配信が audio-only になった瞬間に UI 上もラジオボタンを audio に寄せる
watch(isAudioOnlyLive, (val) => {
  if (val) {
    watchMode.value = "audio";
  }
});

watch(
  () => liveEnabled.value,
  (enabled) => {
    if (!enabled) return;
    if (!roomId.value || !token.value) return;
    loadStatus().catch((e) => console.error("failed to load live status", e));
  },
  { immediate: true },
);

onMounted(() => {
  socketIOInstance.on("live_status_change", handleLiveStatusChange);
  if (liveEnabled.value) {
    loadStatus().catch((e) => console.error("failed to load live status on mount", e));
  }
});

onBeforeUnmount(() => {
  abortInFlightPublishStart();
  socketIOInstance.off("live_status_change", handleLiveStatusChange);
  restoreFavicon();
  cancelledPublishAttempts.clear();

  if (activePublishCtx.value || publishHandle.value || lastPublishCtx.value) {
    void stopPublishSafely("unmount");
  }

  if (subscribeHandle.value) {
    subscribeHandle.value.stop().catch(() => {});
    subscribeHandle.value = null;
  }
});
</script>

<style scoped>
.live-area {
  max-width: 1100px;
  margin: 0 auto;
  padding: 12px 16px 20px;
}

.live-grid {
  display: grid;
  grid-template-columns: minmax(300px, 2fr) minmax(420px, 3fr);
  gap: 14px;
  align-items: start;
}

.live-header {
  font-weight: 700;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.live-card {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  padding: 14px;
}

.live-card h3 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
}

.live-sep {
  border: 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  margin: 12px 0;
}

.mode-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin: 6px 0 10px;
  font-size: 13px;
}

.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.buttons :deep(.p-button) {
  padding: 8px 10px;
  font-size: 13px;
}

.live-video {
  width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  border-radius: 12px;
  background: #111;
  display: block;
}

.error {
  color: #d64545;
  font-size: 0.9rem;
}

.hint {
  font-size: 0.8rem;
  opacity: 0.8;
  margin-top: 10px;
}
</style>
