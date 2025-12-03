<template>
  <section class="live-area">
    <header class="live-header">
      <div v-if="!liveEnabled">この部屋では配信機能は利用できません。</div>
      <template v-else>
        <div v-if="isLive">配信中: {{ publisherName ?? "名無し" }}</div>
        <div v-else>配信なし</div>
      </template>
    </header>

    <section class="live-controls">
      <div v-if="liveEnabled">
        <h3>配信者コントロール</h3>

        <!-- 追加：配信モード切り替え -->
        <div class="mode-switch">
          <label>
            <input v-model="publishMode" type="radio" value="av" />
            映像＋音声
          </label>
          <label>
            <input v-model="publishMode" type="radio" value="audio" />
            音声のみ
          </label>
        </div>

        <div class="buttons">
          <button :disabled="!canStartPublish" @click="onClickStartPublish">配信開始</button>
          <button :disabled="!canStopPublish" @click="onClickStopPublish">配信停止</button>
        </div>
        <p v-if="isMyLive" class="hint">あなたが現在の配信者です。</p>
      </div>
    </section>

    <section class="watch-controls">
      <div v-if="liveEnabled">
        <h3>視聴</h3>

        <div class="mode-switch">
          <label>
            <input v-model="watchMode" type="radio" value="av" :disabled="isAudioOnlyLive" />
            映像＋音声
          </label>
          <label>
            <input v-model="watchMode" type="radio" value="audio" />
            音声のみ
          </label>
        </div>

        <div class="buttons">
          <button :disabled="!canStartWatch" @click="onClickStartWatch">視聴開始</button>
          <button :disabled="!canStopWatch" @click="onClickStopWatch">視聴停止</button>
        </div>
        <video ref="videoRef" class="live-video" autoplay playsinline controls></video>

        <p v-if="isAudioOnlyLive" class="hint">
          現在の配信は音声のみです。視聴は音声のみとなります。
        </p>
      </div>
    </section>

    <p v-if="errorMessage" class="error">
      {{ errorMessage }}
    </p>
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
import { startWhipPublish, type WhipPublishHandle } from "@/webrtc/whipClient";
import { startWhepSubscribe, type WhepSubscribeHandle } from "@/webrtc/whepClient";

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
const publishMode = ref<"av" | "audio">("av");

// 配信者側
const isBusyPublish = ref(false);
const publishHandle = ref<WhipPublishHandle | null>(null);

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

// ボタン有効条件

const canStartPublish = computed(() => {
  return (
    liveEnabled.value && !isBusyPublish.value && !isLive.value && !!roomId.value && !!token.value
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
  return !isBusyPublish.value && isMyLive.value;
});

const canStopWatch = computed(() => {
  return !isBusyWatch.value && subscribeHandle.value !== null;
});

const loadStatus = async () => {
  if (!roomId.value || !token.value) return;

  const res = await fetchLiveStatus(roomId.value, token.value);
  isLive.value = res.isLive;
  publisherName.value = res.publisherName;
  publisherId.value = res.publisherId;
  isAudioOnlyLive.value = res.audioOnly ?? false; // ★ 追加
};

const isPublishAudioOnly = computed(() => publishMode.value === "audio");

const onClickStartPublish = async () => {
  if (!roomId.value || !token.value) return;
  if (!canStartPublish.value) return;

  errorMessage.value = null;
  isBusyPublish.value = true;

  try {
    const { whipUrl } = await fetchWebrtcConfig(roomId.value, token.value);

    let handle: WhipPublishHandle;
    try {
      handle = await startWhipPublish(whipUrl, {
        audioOnly: isPublishAudioOnly.value, // WHIP 側にも渡している前提
      });
      publishHandle.value = handle;
    } catch (webrtcErr) {
      errorMessage.value = "配信開始に失敗しました。";
      console.error(webrtcErr);
      return;
    }

    try {
      // ★ サーバに audioOnly を伝える
      await startLive(roomId.value, token.value, isPublishAudioOnly.value);
    } catch (e: unknown) {}

    await loadStatus();
  } finally {
    isBusyPublish.value = false;
  }
};

// 配信停止
const onClickStopPublish = async () => {
  if (!roomId.value || !token.value) return;
  if (!canStopPublish.value) return;

  errorMessage.value = null;
  isBusyPublish.value = true;

  try {
    if (publishHandle.value) {
      await publishHandle.value.stop();
      publishHandle.value = null;
    }

    await stopLive(roomId.value, token.value);
    await loadStatus();
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      if (e.response?.status === 403) {
        errorMessage.value = "配信者ではないため停止できません。";
      } else {
        errorMessage.value = "配信停止に失敗しました。";
      }
    } else {
      errorMessage.value = "予期しないエラーが発生しました。";
      console.error(e);
    }
  } finally {
    isBusyPublish.value = false;
  }
};

const onClickStartWatch = async () => {
  if (!roomId.value || !token.value) return;
  if (!canStartWatch.value) return;
  if (!videoRef.value) return;

  errorMessage.value = null;
  isBusyWatch.value = true;

  try {
    const { whepUrl } = await fetchWebrtcConfig(roomId.value, token.value);

    subscribeHandle.value = await startWhepSubscribe(whepUrl, videoRef.value, {
      audioOnly: isWatchAudioOnly.value,
    });
  } catch (e: unknown) {
    errorMessage.value = "視聴開始に失敗しました。";
    console.error(e);
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
    console.error(e);
  } finally {
    isBusyWatch.value = false;
  }
};

// サーバ側の live_status_change を受けて状態を更新
const handleLiveStatusChange = (payload: LiveStatusChangePayload) => {
  if (!userStore.currentRoom || userStore.currentRoom.id !== payload.room) return;

  isLive.value = payload.isLive;
  publisherName.value = payload.publisherName;
  publisherId.value = payload.publisherId;
  isAudioOnlyLive.value = payload.audioOnly ?? false;

  if (!payload.isLive && subscribeHandle.value) {
    subscribeHandle.value.stop().catch(() => {});
    subscribeHandle.value = null;
  }
};

watch(
  () => userStore.currentRoom?.id,
  async (newRoomId, oldRoomId) => {
    if (newRoomId === oldRoomId) return;

    // まず前の部屋での配信・視聴セッションを完全に破棄
    if (publishHandle.value) {
      try {
        await publishHandle.value.stop();
      } catch {
        // ログだけ残したければ console.error など
      } finally {
        publishHandle.value = null;
      }
    }

    if (subscribeHandle.value) {
      try {
        await subscribeHandle.value.stop();
      } catch {
        // 同上
      } finally {
        subscribeHandle.value = null;
      }
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

onMounted(() => {
  socketIOInstance.on("live_status_change", handleLiveStatusChange);
  if (liveEnabled.value) {
    loadStatus();
  }
});

onBeforeUnmount(() => {
  socketIOInstance.off("live_status_change", handleLiveStatusChange);

  if (publishHandle.value) {
    publishHandle.value.stop().catch(() => {});
    publishHandle.value = null;
  }

  if (subscribeHandle.value) {
    subscribeHandle.value.stop().catch(() => {});
    subscribeHandle.value = null;
  }
});
</script>

<style scoped>
.live-area {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.live-header {
  font-weight: bold;
}

.live-controls,
.watch-controls {
  margin-bottom: 0.5rem;
}

.buttons {
  display: flex;
  gap: 0.5rem;
  margin: 0.25rem 0;
}

.live-video {
  width: 100%;
  max-height: 240px;
  background: #000;
}

.error {
  color: #f55;
  font-size: 0.9rem;
}

.hint {
  font-size: 0.8rem;
  opacity: 0.8;
}
.mode-switch {
  display: flex;
  gap: 0.75rem;
  font-size: 0.85rem;
  margin-bottom: 0.25rem;
}
</style>
