<template>
  <section class="live-area">
    <header class="live-header">
      <div v-if="!liveEnabled">この部屋では配信機能は利用できません。</div>
      <template v-else>
        <div v-if="isLive">配信中: {{ publisherName ?? "名無し" }}</div>
        <div v-else>配信なし</div>
      </template>
    </header>

    <section v-if="liveEnabled" class="live-card live-card--controls">
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

      <div v-if="publishMode === 'camera'" class="camera-controls">
        <div class="camera-controls__preview">
          <video
            ref="previewVideoRef"
            class="camera-controls__video"
            autoplay
            playsinline
            muted
          ></video>
          <p class="hint camera-controls__hint">
            カメラプレビュー（配信前）。切替後の確認に使えます。
          </p>
        </div>
        <div class="camera-controls__actions">
          <PrimeButton
            :label="isPreviewing ? 'プレビュー更新' : 'プレビュー開始'"
            :disabled="isBusyPublish || isLive || isSwitchingCamera"
            @click="onClickStartPreview"
          />
          <PrimeButton
            :label="cameraFacing === 'user' ? '外カメラへ切替' : '内カメラへ切替'"
            :disabled="isBusyPublish || isSwitchingCamera"
            @click="onClickToggleCamera"
          />
        </div>
        <label class="camera-controls__option">
          <input
            v-model="preferRearOnStart"
            type="checkbox"
            :disabled="isBusyPublish || isLive"
          />
          開始時に外カメラを優先
        </label>
      </div>

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
      <p v-if="isAudioOnlyLive" class="hint">
        現在の配信は音声のみです。視聴は音声のみとなります。
      </p>
    </section>
  </section>

  <!-- 配信一覧（全体）: この部屋が liveEnabled=false でも見える -->

  <section v-if="token" class="live-rooms-area">
    <Accordion :active-index="0">
      <AccordionPanel value="0">
        <AccordionHeader>配信中の部屋一覧({{ liveCount }})</AccordionHeader>
        <AccordionContent>
          <p v-if="isBusyRoomsList" class="hint">読み込み中…</p>
          <p v-else-if="roomsListError" class="error">{{ roomsListError }}</p>
          <p v-else-if="liveCount === 0 && !hasLoadedOnce" class="hint">準備中…</p>
          <p v-else-if="liveCount === 0" class="hint">配信中の部屋はありません。</p>
          <ul v-else class="live-rooms">
            <li v-for="r in visibleLiveRooms" :key="r.room" class="live-rooms__item">
              <button
                type="button"
                class="live-rooms__card"
                :disabled="userStore.currentRoom?.id === r.room"
                :aria-current="userStore.currentRoom?.id === r.room ? 'page' : undefined"
                @click="onClickVisiabilityRoom(r.room)"
              >
                <div class="live-rooms__room">{{ r.room }}</div>

                <div class="live-rooms__meta">
                  <span>配信者: {{ r.publisherName ?? "名無し" }}</span>
                  <span v-if="r.audioOnly">（音声のみ）</span>
                </div>
              </button>
            </li>
          </ul>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import axios from "axios";
import { useUserStore } from "@/stores/user";
import { useRoomStore } from "@/stores/room";
import { useLiveRoomsStore } from "@/stores/liveRooms";
import { useLiveVideoStore } from "@/stores/liveVideo";
import { fetchLiveStatus, startLive, stopLive } from "@/api/liveAPI";
import { fetchWebrtcConfig } from "@/api/liveWebRTC";
import {
  getCameraStream,
  listVideoInputs,
  pickRearCameraDeviceId,
  type CameraFacing,
  type CameraStreamOptions,
} from "@/webrtc/cameraManager";
import { MediaAcquireError } from "@/webrtc/mediaErrors";
import {
  LiveRoomsChangedPayload,
  socketIOInstance,
  type LiveStatusChangePayload,
} from "@/socketIOInstance";
import {
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
import Accordion from "primevue/accordion";
import AccordionPanel from "primevue/accordionpanel";
import AccordionContent from "primevue/accordioncontent";
import AccordionHeader from "primevue/accordionheader";
import { useRouter } from "vue-router";
const isProd = import.meta.env.PROD;

type SafeErr = { name?: string; message?: string; status?: number; code?: string };

const toSafeErr = (e: unknown): SafeErr => {
  if (axios.isAxiosError(e)) {
    return {
      name: e.name,
      message: e.message,
      status: e.response?.status,
      code: e.response?.data?.error,
    };
  }
  if (e instanceof Error) return { name: e.name, message: e.message };
  return { message: String(e) };
};

const logErrorSafe = (label: string, e: unknown) => {
  const safe = toSafeErr(e);
  if (isProd) {
    console.error(label, safe); // 本番は要約のみ
  } else {
    console.error(label, e); // DEVは全文
  }
};

const userStore = useUserStore();
const roomStore = useRoomStore();
const router = useRouter();

const roomId = computed(() => userStore.currentRoom?.id ?? "");
const token = computed(() => userStore.myToken ?? "");
const myId = computed(() => userStore.myID);

// =====================
// 配信一覧（全体）
// =====================
const liveRoomsStore = useLiveRoomsStore();
const liveVideoStore = useLiveVideoStore();
const {
  visibleLiveRooms,
  hasLoadedOnce,
  errorMessage: roomsListError,
  status: liveRoomsStatus,
  liveCount,
} = storeToRefs(liveRoomsStore);
const isBusyRoomsList = computed(() => liveRoomsStatus.value === "loading");
// 共通状態
const isLive = ref(false);
const publisherName = ref<string | null>(null);
const publisherId = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
const publishMode = ref<PublishMode>("camera");
const screenAudioNotice = ref<string | null>(null);
const cameraFacing = ref<CameraFacing>("user");
const preferRearOnStart = ref(false);
const cameraDeviceId = ref<string | null>(null);
const cameraDevices = ref<MediaDeviceInfo[]>([]);
const isSwitchingCamera = ref(false);
const previewVideoRef = ref<HTMLVideoElement | null>(null);
const previewStream = ref<MediaStream | null>(null);
const isPreviewing = computed(() => previewStream.value != null);
const whipUrlCache = ref<string | null>(null);
const currentPublishVideoTrack = ref<MediaStreamTrack | null>(null);
const isReadyToLoadLiveRooms = computed(() => {
  return !!token.value && !!roomId.value;
});

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
const { videoElement } = storeToRefs(liveVideoStore);
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

// =====================
// Socket.IO 配信状態変化受信

const clearPublishUiErrors = () => {
  errorMessage.value = null;
  screenAudioNotice.value = null;
};

const stopStreamTracks = (stream: MediaStream | null) => {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
};

const stopPreviewStream = () => {
  stopStreamTracks(previewStream.value);
  previewStream.value = null;
  if (previewVideoRef.value) {
    previewVideoRef.value.srcObject = null;
  }
};

const loadCameraDevices = async (): Promise<MediaDeviceInfo[]> => {
  const devices = await listVideoInputs();
  cameraDevices.value = devices;
  return devices;
};

const pickFrontCameraDeviceId = (devices: MediaDeviceInfo[]): string | null => {
  const frontPattern = /(front|user|selfie|前面|内側|内カメ)/i;
  const matched = devices.find((device) => frontPattern.test(device.label));
  return matched?.deviceId ?? devices[0]?.deviceId ?? null;
};

const resolveCameraDeviceId = async (facing: CameraFacing): Promise<string | null> => {
  const devices = await loadCameraDevices().catch(() => cameraDevices.value);
  if (devices.length === 0) return null;
  if (facing === "environment") {
    return pickRearCameraDeviceId(devices) ?? devices[0]?.deviceId ?? null;
  }
  return pickFrontCameraDeviceId(devices);
};

const getCameraOptionsForFacing = async (facing: CameraFacing): Promise<CameraStreamOptions> => {
  const deviceId = cameraDeviceId.value ?? (await resolveCameraDeviceId(facing));
  if (deviceId) {
    return { deviceId, facing, widthIdeal: 1280, heightIdeal: 720 };
  }
  return { facing, widthIdeal: 1280, heightIdeal: 720 };
};

const attachPreviewStream = (stream: MediaStream) => {
  previewStream.value = stream;
  if (previewVideoRef.value) {
    previewVideoRef.value.srcObject = stream;
  }
};

const startPreviewStream = async (facing: CameraFacing) => {
  stopPreviewStream();
  const options = await getCameraOptionsForFacing(facing);
  const stream = await getCameraStream({ ...options, audio: false });
  attachPreviewStream(stream);
};

const refreshPublishVideoTrack = () => {
  const sender = publishHandle.value?.senders.find((item) => item.track?.kind === "video");
  currentPublishVideoTrack.value = sender?.track ?? null;
};

const restartPublishSession = async (options: CameraStreamOptions) => {
  if (!whipUrlCache.value) {
    throw new Error("whip-url-missing");
  }
  if (!publishHandle.value) {
    throw new Error("publish-handle-missing");
  }
  await publishHandle.value.stop().catch(() => {});
  publishHandle.value = await startWhipPublish(whipUrlCache.value, {
    mode: publishMode.value,
    camera: { ...options, audio: true },
    onDisplayEnded: () => {
      if (publishHandle.value != null) {
        void stopPublishSafely("display-ended", { uiPolicy: "silent" });
      }
    },
  });
  refreshPublishVideoTrack();
};

const replacePublishVideoTrack = async (options: CameraStreamOptions) => {
  if (!publishHandle.value) return;
  const sender = publishHandle.value.senders.find((item) => item.track?.kind === "video");
  if (!sender) {
    throw new Error("video-sender-missing");
  }

  const stream = await getCameraStream({ ...options, audio: false });
  const nextTrack = stream.getVideoTracks()[0];
  if (!nextTrack) {
    stopStreamTracks(stream);
    throw new Error("video-track-missing");
  }

  try {
    await sender.replaceTrack(nextTrack);
  } catch (e) {
    stopStreamTracks(stream);
    throw e;
  }

  if (currentPublishVideoTrack.value && currentPublishVideoTrack.value !== nextTrack) {
    try {
      currentPublishVideoTrack.value.stop();
    } catch {
      // ignore
    }
  }
  currentPublishVideoTrack.value = nextTrack;
  for (const track of stream.getTracks()) {
    if (track !== nextTrack) {
      try {
        track.stop();
      } catch {
        // ignore
      }
    }
  }
};

const handleLiveRoomsChanged = (p: LiveRoomsChangedPayload) => {
  liveRoomsStore.applyLiveRoomsChanged(p);
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

type StopUiPolicy = "silent" | "user-action";
type StopCtx = { roomId: string; token: string };
type StopPublishOpts = {
  ctx?: StopCtx | null; // 明示ctx（部屋移動などで roomId/token が変わっても確実に止める）
  uiPolicy?: StopUiPolicy; // UIに出すか
  preserveUiErrors?: boolean; // stop中に既存エラーを消さない
};

const appendErrorMessage = (msg: string) => {
  if (errorMessage.value) errorMessage.value = `${errorMessage.value}\n${msg}`;
  else errorMessage.value = msg;
};

const isBenignStopLiveError = (e: unknown): boolean => {
  if (!axios.isAxiosError(e)) return false;
  const status = e.response?.status;
  const code = e.response?.data?.error;

  // 二重STOP/後追いSTOPを「成功扱い」にする（ここが一本化の肝）
  if (status === 403 && code === "not-publisher") return true;

  // 実装差があり得るので、止まってる系は広めに成功扱い
  if (status === 404) return true;
  if (status === 410) return true;

  return false;
};

const stopPublishSafely = async (reason: string, opts: StopPublishOpts = {}): Promise<void> => {
  console.debug("stopPublishSafely called:", reason);
  if (isStoppingPublish.value) return;

  const uiPolicy: StopUiPolicy = opts.uiPolicy ?? (reason === "manual" ? "user-action" : "silent");

  const preserveUiErrors = opts.preserveUiErrors ?? false;

  // 多重STOP抑止とUI連打抑止（ここが無いと設計が崩れる）
  isStoppingPublish.value = true;
  isBusyPublish.value = true;

  if (!preserveUiErrors) {
    clearPublishUiErrors();
  }

  const fallbackCtx =
    roomId.value && token.value ? ({ roomId: roomId.value, token: token.value } as StopCtx) : null;

  const ctx: StopCtx | null =
    opts.ctx ?? activePublishCtx.value ?? lastPublishCtx.value ?? fallbackCtx;

  const handle = publishHandle.value;
  publishHandle.value = null;

  let stopNotifiedOk = false;

  try {
    // 1) ローカルWebRTC停止（あれば）
    if (handle) {
      try {
        await handle.stop();
      } catch {}
    }
    currentPublishVideoTrack.value = null;

    // 2) サーバ停止通知（ここだけが stopLive の唯一の呼び出し箇所）
    if (ctx) {
      try {
        await stopLive(ctx.roomId, ctx.token);
        stopNotifiedOk = true;
      } catch (e) {
        if (isBenignStopLiveError(e)) {
          // 二重STOP系は成功扱い（誤通知を根絶）
          stopNotifiedOk = true;
        } else {
          // 本当に止め通知が失敗した場合のみ、ユーザーが行動すべきときに限り表示
          if (uiPolicy === "user-action") {
            appendErrorMessage(
              "配信停止をサーバへ通知できませんでした。通信状況を確認して、もう一度「配信停止」を押してください。",
            );
          }
        }
      }

      // 成功扱いなら ctx を片付ける（失敗なら残して再試行可能にする）
      if (stopNotifiedOk) {
        if (activePublishCtx.value?.roomId === ctx.roomId) activePublishCtx.value = null;
        if (lastPublishCtx.value?.roomId === ctx.roomId) lastPublishCtx.value = null;
      }
    }

    // 3) 状態同期：今いる部屋に合わせる（部屋移動中なら loadStatus が効く）
    try {
      if (ctx && ctx.roomId === roomId.value) {
        await loadStatusFor(ctx);
      } else {
        await loadStatus();
      }
    } catch (e) {
      logErrorSafe("loadStatusFor failed in stopPublishSafely", e);
      if (uiPolicy === "user-action" && errorMessage.value == null) {
        appendErrorMessage("停止後の状態更新に失敗しました。ページ再読み込みで確認してください。");
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

  const ctx = { roomId: rid, token: tok }; // ★固定ctx（部屋移動してもこれで止める）

  clearPublishUiErrors();
  isBusyPublish.value = true;

  const epoch = ++publishStartEpoch.value;
  const ensureNotAborted = () => {
    if (epoch !== publishStartEpoch.value) throw new PublishStartAbortedError();
  };

  const attemptId = ++publishAttemptSeq;
  let needsRollback = false;
  let tmpHandle: WhipPublishHandle | null = null;

  try {
    await startLive(rid, tok, isPublishAudioOnly.value);
    needsRollback = true;

    // ★ startLive 成功時点で ctx を確保（中断でも stopPublishSafely が拾える）
    activePublishCtx.value = ctx;
    lastPublishCtx.value = ctx;

    ensureNotAborted();

    const config = await fetchWebrtcConfig(rid, tok);
    ensureNotAborted();
    if (!config.whipUrl) throw new Error("whip-url-missing");
    whipUrlCache.value = config.whipUrl;

    let cameraOptions: CameraStreamOptions | undefined;
    if (publishMode.value === "camera") {
      const facing = preferRearOnStart.value ? "environment" : cameraFacing.value;
      cameraOptions = await getCameraOptionsForFacing(facing);
      cameraDeviceId.value = cameraOptions.deviceId ?? null;
      cameraFacing.value = facing;
      stopPreviewStream();
    }

    tmpHandle = await startWhipPublish(config.whipUrl, {
      mode: publishMode.value,
      camera: cameraOptions,
      onDisplayEnded: () => {
        if (publishHandle.value != null) {
          void stopPublishSafely("display-ended", { uiPolicy: "silent" });
          return;
        }
        cancelledPublishAttempts.add(attemptId);
      },
    });

    ensureNotAborted();

    publishHandle.value = tmpHandle;
    refreshPublishVideoTrack();
    tmpHandle = null;

    if (cancelledPublishAttempts.has(attemptId)) {
      cancelledPublishAttempts.delete(attemptId);
      await publishHandle.value.stop().catch(() => {});
      publishHandle.value = null;

      throw new PublishCancelledError("display-ended");
    }

    needsRollback = false;

    await loadStatusFor(ctx).catch(() => {});
  } catch (e) {
    if (e instanceof PublishStartAbortedError) {
      if (tmpHandle) await tmpHandle.stop().catch(() => {});

      // ★ stopLive は呼ばない。停止は stopPublishSafely に一本化。
      if (needsRollback) {
        await stopPublishSafely("start-abort", {
          ctx,
          uiPolicy: "user-action", // 本当に止め通知が失敗した時だけユーザーに再操作を促す
          preserveUiErrors: true,
        }).catch(() => {});
      }
      return;
    }

    await onClickStartPublishCatch(e, needsRollback, ctx);
  } finally {
    if (tmpHandle) await tmpHandle.stop().catch(() => {});
    cancelledPublishAttempts.delete(attemptId);

    if (!isStoppingPublish.value) {
      isBusyPublish.value = false;
    }
  }
};

const onClickStartPublishCatch = async (
  e: unknown,
  rollback: boolean,
  ctx: { roomId: string; token: string },
) => {
  if (e instanceof PublishCancelledError && e.reason === "display-ended") {
    // ★停止は stopPublishSafely に一本化（stopLive直呼び撤去）
    await stopPublishSafely("display-ended", {
      ctx,
      uiPolicy: "silent",
      preserveUiErrors: false,
    }).catch(() => {});

    await loadStatusFor(ctx).catch(() => {});
    return;
  }

  if (axios.isAxiosError(e)) {
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
    if (publishMode.value === "screen") {
      if (e.code === "screen-audio-unavailable") {
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
      if (e.code === "permission-denied") {
        errorMessage.value = "マイクやカメラへのアクセスがブラウザに拒否されています。";
      } else if (e.code === "no-device") {
        errorMessage.value = "利用可能なマイク／カメラが見つかりません。";
      } else if (e.code === "constraint-failed") {
        errorMessage.value = "選択したカメラに対応していません。別のカメラをお試しください。";
      } else if (e.code === "not-supported") {
        errorMessage.value = "この端末/ブラウザではカメラ取得に未対応です。";
      } else {
        errorMessage.value = "マイク／カメラの取得に失敗しました。";
      }
    }
  } else {
    errorMessage.value = "予期しないエラーが発生しました。";
  }

  if (rollback) {
    // ★ロールバック停止も stopPublishSafely に一本化（stopLive直呼び撤去）
    await stopPublishSafely("start-rollback", {
      ctx,
      uiPolicy: "user-action", // 停止通知が本当に失敗した時だけ再操作を促す
      preserveUiErrors: true, // 配信開始失敗の理由表示は保持
    }).catch(() => {});

    await loadStatusFor(ctx).catch(() => {});
  }
};

const onClickStopPublish = async () => {
  if (!roomId.value || !token.value) return;
  if (!canStopPublish.value) return;

  await stopPublishSafely("manual");
};

const onClickStartPreview = async () => {
  clearPublishUiErrors();
  try {
    const options = await getCameraOptionsForFacing(cameraFacing.value);
    cameraDeviceId.value = options.deviceId ?? null;
    await startPreviewStream(cameraFacing.value);
  } catch (e) {
    if (e instanceof MediaAcquireError) {
      if (e.code === "permission-denied") {
        errorMessage.value = "カメラへのアクセスが拒否されています。ブラウザの権限を確認してください。";
      } else if (e.code === "no-device") {
        errorMessage.value = "利用可能なカメラが見つかりません。";
      } else if (e.code === "constraint-failed") {
        errorMessage.value = "選択したカメラに対応していません。別のカメラをお試しください。";
      } else if (e.code === "not-supported") {
        errorMessage.value = "この端末/ブラウザではカメラ取得に未対応です。";
      } else {
        errorMessage.value = "カメラの取得に失敗しました。";
      }
    } else {
      errorMessage.value = "カメラの取得に失敗しました。";
    }
  }
};

const onClickToggleCamera = async () => {
  clearPublishUiErrors();
  const nextFacing: CameraFacing = cameraFacing.value === "user" ? "environment" : "user";
  isSwitchingCamera.value = true;
  try {
    const options = await getCameraOptionsForFacing(nextFacing);
    cameraDeviceId.value = options.deviceId ?? null;
    cameraFacing.value = nextFacing;

    if (!isLive.value) {
      await startPreviewStream(nextFacing);
    }

    if (publishHandle.value && publishMode.value === "camera") {
      try {
        await replacePublishVideoTrack({ ...options, facing: nextFacing });
      } catch (e) {
        console.warn("replaceTrack failed, restarting publish session", e);
        await restartPublishSession({ ...options, facing: nextFacing });
      }
    }
  } catch (e) {
    if (e instanceof MediaAcquireError) {
      if (e.code === "permission-denied") {
        appendErrorMessage("カメラへのアクセスが拒否されています。ブラウザの権限を確認してください。");
      } else if (e.code === "no-device") {
        appendErrorMessage("利用可能なカメラが見つかりません。");
      } else if (e.code === "constraint-failed") {
        appendErrorMessage("選択したカメラに対応していません。別のカメラをお試しください。");
      } else if (e.code === "not-supported") {
        appendErrorMessage("この端末/ブラウザではカメラ切替に未対応です。");
      } else {
        appendErrorMessage("カメラの切替に失敗しました。");
      }
    } else {
      appendErrorMessage("カメラの切替に失敗しました。");
    }
  } finally {
    isSwitchingCamera.value = false;
  }
};

const onClickStartWatch = async () => {
  if (!roomId.value || !token.value) return;
  if (!canStartWatch.value) return;
  if (!videoElement.value) {
    errorMessage.value = "LIVE窓を開いてから視聴を開始してください。";
    return;
  }

  errorMessage.value = null;
  isBusyWatch.value = true;

  try {
    const config = await fetchWebrtcConfig(roomId.value, token.value);
    if (!config.whepUrl) {
      throw new Error("whep-url-missing");
    }

    subscribeHandle.value = await startWhepSubscribe(config.whepUrl, videoElement.value, {
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

const onSocketConnect = () => {
  if (isReadyToLoadLiveRooms.value) void liveRoomsStore.load("socket-connect").catch(() => {});
};

const onVisibilityChange = () => {
  if (document.visibilityState === "visible" && isReadyToLoadLiveRooms.value) {
    void liveRoomsStore.load("visibility-change").catch(() => {});
  }
};

const normalizeRoomParam = (room: string): string => {
  // "/21" -> "21", "///21" -> "21"
  return String(room ?? "").replace(/^\/+/, "");
};

const onClickVisiabilityRoom = async (room: string) => {
  const current = userStore.currentRoom?.id ?? "";
  if (!room || room === current) return;

  const id = normalizeRoomParam(room); // ← ここが肝
  if (!id) return;

  try {
    await router.push({ name: "room", params: { id } }); // /room/21 になる
  } catch (e) {
    logErrorSafe("router.push threw", e);
  }
};

watch(
  () => userStore.currentRoom?.id,
  async (newRoomId, oldRoomId) => {
    if (newRoomId === oldRoomId) return;
    abortInFlightPublishStart();
    if (isReadyToLoadLiveRooms.value) {
      void liveRoomsStore.load("room-change").catch(() => {});
    } else {
      liveRoomsStore.reset("room-change");
    }
    // 先に配信停止（サーバロック解除含む）
    if (activePublishCtx.value || publishHandle.value || lastPublishCtx.value) {
      await stopPublishSafely("room-change", { uiPolicy: "user-action" }).catch(() => {});
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
        logErrorSafe("failed to load live status on room change", e);
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
  publishMode,
  (mode) => {
    if (mode !== "camera") {
      stopPreviewStream();
    }
  },
  { immediate: true },
);

watch(
  () => liveEnabled.value,
  (enabled) => {
    if (!enabled) return;
    if (!roomId.value || !token.value) return;
    loadStatus().catch((e) => logErrorSafe("failed to load live status", e));
  },
  { immediate: true },
);

watch(token, () => {
  liveRoomsStore.reset("token-change");
});

watch(
  isReadyToLoadLiveRooms,
  (ready) => {
    if (ready) void liveRoomsStore.load("ready").catch(() => {});
  },
  { immediate: true },
);

onMounted(() => {
  socketIOInstance.on("live_status_change", handleLiveStatusChange);
  socketIOInstance.on("live_rooms_changed", handleLiveRoomsChanged);
  socketIOInstance.on("connect", onSocketConnect);
  document.addEventListener("visibilitychange", onVisibilityChange);
  if (liveEnabled.value) {
    loadStatus().catch((e) => logErrorSafe("failed to load live status on mount", e));
  }
});

onBeforeUnmount(() => {
  abortInFlightPublishStart();
  socketIOInstance.off("live_status_change", handleLiveStatusChange);
  socketIOInstance.off("live_rooms_changed", handleLiveRoomsChanged);
  socketIOInstance.off("connect", onSocketConnect);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  restoreFavicon();
  cancelledPublishAttempts.clear();

  if (activePublishCtx.value || publishHandle.value || lastPublishCtx.value) {
    void stopPublishSafely("unmount");
  }

  stopPreviewStream();

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
  height: 100%;
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

.camera-controls {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}

.camera-controls__preview {
  display: grid;
  gap: 6px;
}

.camera-controls__video {
  width: 100%;
  max-height: 200px;
  background: #111;
  border-radius: 10px;
}

.camera-controls__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.camera-controls__option {
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.camera-controls__hint {
  margin: 0;
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

.live-rooms-area {
  margin: 10px 0 12px;
}

.live-rooms {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.live-rooms__room {
  font-weight: 700;
  margin-bottom: 4px;
}

.live-rooms__meta {
  font-size: 0.85rem;
  opacity: 0.85;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.live-rooms__item {
  /* li側はレイアウトだけ。カード見た目は button 側に寄せる */
  padding: 0;
  border: 0;
  background: transparent;
}

/* 重要：ボタンの標準見た目を完全に殺す */
.live-rooms__card {
  appearance: none;
  -webkit-appearance: none;

  /* クリック領域をカード全体に */
  width: 100%;
  display: block;
  text-align: left;

  /* 標準ボタンの余白/枠/背景を消す */
  border: 0;
  padding: 10px; /* ← ここは元の .live-rooms__item の padding と合わせる */
  background: #fff;
  color: inherit;
  font: inherit;

  /* ここから “カードの見た目” */
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
}

/* disabled を本当に効かせる（見た目も） */
.live-rooms__card:disabled {
  opacity: 0.55;
  cursor: default;
}

.live-rooms__card:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.035);
}

/* キーボード操作時のフォーカス可視化（見た目を壊さない範囲で） */
.live-rooms__card:focus-visible {
  outline: 2px solid rgba(0, 0, 0, 0.35);
  outline-offset: 3px;
}
</style>
