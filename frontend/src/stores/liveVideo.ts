import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

export type LivePlayerUiKind = "video" | "audio";

export const useLiveVideoStore = defineStore("liveVideo", () => {
  const videoElement = shallowRef<HTMLVideoElement | null>(null);
  const audioElement = shallowRef<HTMLAudioElement | null>(null);
  const mediaElement = shallowRef<HTMLMediaElement | null>(null);
  const uiKind = ref<LivePlayerUiKind>("video");

  const setVideoElement = (element: HTMLVideoElement | null) => {
    videoElement.value = element;
    mediaElement.value = element;
  };

  const setAudioElement = (element: HTMLAudioElement | null) => {
    audioElement.value = element;
    mediaElement.value = element;
  };

  const setUiKind = (next: LivePlayerUiKind) => {
    uiKind.value = next;
  };

  return {
    audioElement,
    mediaElement,
    videoElement,
    setVideoElement,
    setAudioElement,
    uiKind,
    setUiKind,
  };
});
