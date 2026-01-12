import { defineStore } from "pinia";
import { shallowRef } from "vue";

export const useLiveVideoStore = defineStore("liveVideo", () => {
  const videoElement = shallowRef<HTMLVideoElement | null>(null);

  const setVideoElement = (element: HTMLVideoElement | null) => {
    videoElement.value = element;
  };

  return {
    videoElement,
    setVideoElement,
  };
});
