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

      <div
        class="live-controls-grid"
        :class="{ 'live-controls-grid--with-preview': publishMode === 'camera' }"
      >
        <!-- 左：操作一式 -->
        <div class="live-controls-grid__left">
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

          <!-- screenの注意 -->
          <p v-if="publishMode === 'screen'" class="hint">
            画面音声は「共有対象」と「共有ダイアログの音声共有設定」に依存します。
            音声が取得できない場合は配信開始できません。
          </p>

          <!-- camera のときだけ：プレビュー操作 -->
          <div v-if="publishMode === 'camera'" class="camera-actions">
            <div class="buttons">
              <PrimeButton
                :label="isPreviewing ? 'プレビュー更新' : 'プレビュー開始'"
                :disabled="isBusyPublish || isLive || isSwitchingCamera"
                @click="onClickStartPreview"
              />
              <PrimeButton
                label="カメラ切替"
                :disabled="isBusyPublish || isSwitchingCamera || isOtherLive"
                @click="onClickToggleCamera"
              />
            </div>

            <label class="camera-actions__option">
              <input
                v-model="preferRearOnStart"
                type="checkbox"
                :disabled="isBusyPublish || isLive"
              />
              開始時に外カメラを優先
            </label>

            <p class="camera-actions__hint hint">
              カメラプレビュー（配信前）。切替後の確認に使えます。
            </p>
          </div>

          <!-- screen音声が取れなかった時の専用表示 -->
          <p v-if="screenAudioNotice" class="error">{{ screenAudioNotice }}</p>

          <!-- 配信ボタン行 -->
          <div class="buttons">
            <PrimeButton
              label="配信開始"
              :disabled="!canStartPublish"
              @click="onClickStartPublish"
            />
            <PrimeButton label="配信停止" :disabled="!canStopPublish" @click="onClickStopPublish" />
          </div>
          <p v-if="isMyLive" class="hint">あなたが現在の配信者です。</p>

          <hr class="live-sep" />

          <h3 class="subheading">視聴</h3>

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
            <PrimeButton label="視聴開始" :disabled="!canStartWatch" @click="onClickStartWatch" />
            <PrimeButton label="視聴停止" :disabled="!canStopWatch" @click="onClickStopWatch" />
          </div>

          <p v-if="isAudioOnlyLive" class="hint">
            現在の配信は音声のみです。視聴は音声のみとなります。
          </p>
        </div>

        <!-- 右：camera のときだけプレビュー -->
        <div v-if="publishMode === 'camera'" class="live-controls-grid__right">
          <video
            ref="previewVideoRef"
            class="camera-controls__video"
            autoplay
            playsinline
            muted
          ></video>
        </div>
      </div>
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
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import axios from "axios";
import { useUserStore } from "@/stores/user";
import { useRoomStore } from "@/stores/room";
import { useLiveRoomsStore } from "@/stores/liveRooms";
import { useLiveVideoStore } from "@/stores/liveVideo";
import { useUIStore } from "@/stores/ui";
import { fetchLiveStatus, startLive, stopLive } from "@/api/liveAPI";
import { fetchWebrtcConfig } from "@/api/liveWebRTC";
import {
  getCameraStream,
  listVideoInputs,
  type CameraFacing,
  type CameraStreamOptions,
} from "@/webrtc/cameraManager";
import { MediaAcquireError } from "@/webrtc/mediaErrors";
import { restartPublishSessionSafely as restartPublishSessionSafelyHelper } from "@/webrtc/publishRestart";
import { pickNextCameraDeviceId } from "@/domain/media/pickNextCameraDeviceId";
import { resolveCameraDeviceId } from "@/domain/media/resolveCameraDeviceId";
import { switchPublishCameraSafely } from "@/services/live/switchPublishCameraSafely";
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
const uiStore = useUIStore();
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
const cameraDeviceIdFacing = ref<CameraFacing | null>(null);
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
const isStartingWatch = ref(false);
const watchSubscribeInFlight = ref<Promise<WhepSubscribeHandle> | null>(null);
const subscribeHandle = ref<WhepSubscribeHandle | null>(null);
const { videoElement } = storeToRefs(liveVideoStore);
const LIVE_WINDOW_WAIT_TIMEOUT_MS = 5000;
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
const isOtherLive = computed(() => isLive.value && !isMyLive.value);

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

const stopTrackSafe = (track: MediaStreamTrack) => {
  try {
    track.stop();
  } catch {
    // ignore
  }
};

const getUserMediaRaw = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices) {
    const error = new Error("mediaDevices is not available") as Error & { name: string };
    error.name = "NotSupportedError";
    throw error;
  }
  return await mediaDevices.getUserMedia(constraints);
};

const loadCameraDevices = async (): Promise<MediaDeviceInfo[]> => {
  const devices = await listVideoInputs();
  cameraDevices.value = devices;
  return devices;
};

const resolveCameraDeviceIdForFacing = async (
  facing: CameraFacing,
): Promise<{ deviceId: string | null; reason: string }> => {
  const devices = await loadCameraDevices().catch(() => cameraDevices.value);
  const resolved = resolveCameraDeviceId(devices, null, facing);
  if (!isProd) {
    console.debug("resolveCameraDeviceIdForFacing:", {
      facing,
      deviceId: resolved.deviceId,
      reason: resolved.reason,
    });
  }
  return { deviceId: resolved.deviceId, reason: resolved.reason };
};

const getCameraOptionsForFacing = async (facing: CameraFacing): Promise<CameraStreamOptions> => {
  const canReuse = cameraDeviceId.value != null && cameraDeviceIdFacing.value === facing;
  const resolved = canReuse
    ? { deviceId: cameraDeviceId.value, reason: "reuse" }
    : await resolveCameraDeviceIdForFacing(facing);
  if (!isProd) {
    console.debug("getCameraOptionsForFacing:", {
      facing,
      hasDeviceId: resolved.deviceId != null,
      reason: resolved.reason,
    });
  }
  if (resolved.deviceId) {
    return { deviceId: resolved.deviceId, facing, widthIdeal: 1280, heightIdeal: 720 };
  }
  return { facing, widthIdeal: 1280, heightIdeal: 720 };
};

const attachPreviewStream = (stream: MediaStream) => {
  previewStream.value = stream;
  if (previewVideoRef.value) {
    previewVideoRef.value.srcObject = stream;
  }
};

const startPreviewStream = async (options: CameraStreamOptions) => {
  const stream = await getCameraStream({ ...options, audio: false });
  stopPreviewStream();
  attachPreviewStream(stream);
};

const refreshPublishVideoTrack = () => {
  const sender = publishHandle.value?.senders.find((item) => item.track?.kind === "video");
  currentPublishVideoTrack.value = sender?.track ?? null;
};

const resolveSwitchErrorMessage = (errorName?: string): string => {
  if (errorName === "NotAllowedError" || errorName === "SecurityError") {
    return "カメラへのアクセスが拒否されています。ブラウザの権限を確認してください。";
  }
  if (errorName === "NotFoundError") {
    return "利用可能なカメラが見つかりません。";
  }
  if (errorName === "OverconstrainedError") {
    return "選択したカメラに対応していません。別のカメラをお試しください。";
  }
  if (errorName === "NotSupportedError") {
    return "この端末/ブラウザではカメラ切替に未対応です。";
  }
  return "カメラの切替に失敗しました。";
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

const restartPublishSessionSafely = async (options: CameraStreamOptions): Promise<boolean> => {
  return await restartPublishSessionSafelyHelper({
    restartPublishSession: () => restartPublishSession(options),
    stopPublishSafely,
    onRestartError: (e) => logErrorSafe("restartPublishSession failed", e),
    onUiError: () => {
      appendErrorMessage("配信の再開に失敗したため配信を停止しました。");
    },
  });
};

const replacePublishVideoTrack = async (nextTrack: MediaStreamTrack) => {
  if (!publishHandle.value) return;
  const sender = publishHandle.value.senders.find((item) => item.track?.kind === "video");
  if (!sender) {
    throw new Error("video-sender-missing");
  }
  await sender.replaceTrack(nextTrack);
  currentPublishVideoTrack.value = nextTrack;
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
    !isStartingWatch.value &&
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

const ensureCameraOperationAllowed = (): boolean => {
  if (isOtherLive.value) {
    appendErrorMessage("他のユーザーが配信中のため、カメラ操作はできません。");
    return false;
  }
  return true;
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
  if (!ensureCameraOperationAllowed()) return;
  clearPublishUiErrors();
  try {
    const options = await getCameraOptionsForFacing(cameraFacing.value);
    await startPreviewStream(options);
    cameraDeviceId.value = options.deviceId ?? null;
    cameraDeviceIdFacing.value = cameraFacing.value;
  } catch (e) {
    if (e instanceof MediaAcquireError) {
      if (e.code === "permission-denied") {
        errorMessage.value =
          "カメラへのアクセスが拒否されています。ブラウザの権限を確認してください。";
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

  const prevFacing = cameraFacing.value;
  const nextFacing: CameraFacing = prevFacing === "user" ? "environment" : "user";

  if (isSwitchingCamera.value) return;
  isSwitchingCamera.value = true;

  try {
    const devices = await loadCameraDevices().catch(() => cameraDevices.value);

    if (!publishHandle.value) {
      const pickNext = pickNextCameraDeviceId(devices, cameraDeviceId.value);
      const resolved = pickNext.ok
        ? { deviceId: pickNext.deviceId, reason: pickNext.reason }
        : resolveCameraDeviceId(devices, null, nextFacing);
      const options: CameraStreamOptions = {
        deviceId: resolved.deviceId ?? undefined,
        facing: resolved.deviceId ? undefined : nextFacing,
        widthIdeal: 1280,
        heightIdeal: 720,
      };

      const nextStream = await getCameraStream({ ...options, audio: false });
      stopPreviewStream();
      attachPreviewStream(nextStream);

      cameraFacing.value = nextFacing;
      cameraDeviceId.value = resolved.deviceId ?? null;
      cameraDeviceIdFacing.value = nextFacing;
      return;
    }

    if (publishHandle.value && publishMode.value === "camera") {
      const result = await switchPublishCameraSafely(
        {
          currentTrack: currentPublishVideoTrack.value,
          devices,
          currentFacingMode: prevFacing,
          currentDeviceId: cameraDeviceId.value,
        },
        {
          getUserMedia: getUserMediaRaw,
          replacePublishVideoTrack: async (track) => replacePublishVideoTrack(track),
          restartPublishSessionSafely: async (options) =>
            restartPublishSessionSafely({
              ...options,
              widthIdeal: 1280,
              heightIdeal: 720,
            }),
          stopTrack: stopTrackSafe,
        },
      );

      if (!result.ok) {
        appendErrorMessage(resolveSwitchErrorMessage(result.errorName));
        return;
      }

      cameraFacing.value = result.nextFacingMode;
      cameraDeviceId.value = result.nextDeviceId ?? null;
      cameraDeviceIdFacing.value = result.nextFacingMode;
    }
  } catch (e) {
    if (e instanceof MediaAcquireError) {
      if (e.code === "permission-denied") {
        appendErrorMessage(
          "カメラへのアクセスが拒否されています。ブラウザの権限を確認してください。",
        );
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
  const startRoomId = roomId.value;
  const startToken = token.value;
  if (!startRoomId || !startToken) return;
  if (isStartingWatch.value) return;
  if (!liveEnabled.value || !isLive.value) return;
  if (isBusyWatch.value || subscribeHandle.value || watchSubscribeInFlight.value) return;
  isStartingWatch.value = true;
  let subscribePromise: Promise<WhepSubscribeHandle> | null = null;

  try {
    if (!videoElement.value) {
      if (router.currentRoute.value.name !== "room") {
        errorMessage.value = "LIVE窓を表示できる画面で視聴を開始してください。";
        return;
      }
      uiStore.openLiveWindow();
      await nextTick();
    }
    if (!videoElement.value) {
      const hasVideoElement = await new Promise<boolean>((resolve) => {
        let timeoutId: number | null = null;
        const stopVideoWatch = watch(
          videoElement,
          (element) => {
            if (element) {
              cleanup();
              resolve(true);
            }
          },
          { flush: "post" },
        );
        const stopRouteWatch = watch(
          () => router.currentRoute.value.name,
          (name) => {
            if (name !== "room") {
              cleanup();
              resolve(false);
            }
          },
        );
        const cleanup = () => {
          stopVideoWatch();
          stopRouteWatch();
          if (timeoutId) {
            window.clearTimeout(timeoutId);
          }
        };
        timeoutId = window.setTimeout(() => {
          cleanup();
          resolve(false);
        }, LIVE_WINDOW_WAIT_TIMEOUT_MS);
      });
      if (!hasVideoElement) {
        errorMessage.value = "LIVE窓を開いてから視聴を開始してください。";
        return;
      }
    }
    if (!videoElement.value) {
      errorMessage.value = "LIVE窓を開いてから視聴を開始してください。";
      return;
    }
    if (subscribeHandle.value || watchSubscribeInFlight.value) {
      return;
    }

    errorMessage.value = null;
    isBusyWatch.value = true;

    const config = await fetchWebrtcConfig(startRoomId, startToken);
    if (!config.whepUrl) {
      throw new Error("whep-url-missing");
    }

    subscribePromise = startWhepSubscribe(config.whepUrl, videoElement.value, {
      audioOnly: isWatchAudioOnly.value,
    });
    watchSubscribeInFlight.value = subscribePromise;
    const handle = await subscribePromise;
    if (subscribeHandle.value) {
      await handle.stop().catch(() => {});
    } else {
      subscribeHandle.value = handle;
    }
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
    if (watchSubscribeInFlight.value === subscribePromise) {
      watchSubscribeInFlight.value = null;
    }
    isBusyWatch.value = false;
    isStartingWatch.value = false;
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
}

.live-card h3 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
}

.subheading {
  margin: 0;
  font-size: 14px;
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

/* 2カラムの主構造：camera時だけ右にプレビュー */
.live-controls-grid {
  display: grid;
  gap: 12px;
}

.live-controls-grid--with-preview {
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  align-items: start;
}

.live-controls-grid__left {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.live-controls-grid__right {
  min-width: 0;
  height: 100%;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 10px;
  background: #fff;
}

/* ボタン */
.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.buttons :deep(.p-button) {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
}

/* camera操作群 */
.camera-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.camera-actions__option {
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.camera-actions__hint {
  margin: 0;
}

/* プレビュー映像（camera のときだけDOMが存在するのでプレースホルダーではない） */
.camera-controls__video {
  width: 100%;
  height: 100%;
  background: #111;
  border-radius: 10px;
  display: block;
  object-fit: cover;
  max-height: 420px;
}

.error {
  color: #d64545;
  font-size: 0.9rem;
}

.hint {
  font-size: 0.8rem;
  opacity: 0.8;
  margin: 0;
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

.live-rooms__item {
  padding: 0;
  border: 0;
  background: transparent;
}

.live-rooms__card {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  display: block;
  text-align: left;
  border: 0;
  padding: 10px;
  background: #fff;
  color: inherit;
  font: inherit;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
}

.live-rooms__card:disabled {
  opacity: 0.55;
  cursor: default;
}

.live-rooms__card:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.035);
}

.live-rooms__card:focus-visible {
  outline: 2px solid rgba(0, 0, 0, 0.35);
  outline-offset: 3px;
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

@media (max-width: 760px) {
  .live-controls-grid--with-preview {
    grid-template-columns: 1fr;
  }
  .camera-controls__video {
    max-height: 260px;
  }
}
</style>
