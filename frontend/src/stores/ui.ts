import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useSettingStore } from "./setting";

export interface IUI {
  width: number;
  height: number;
  bottomBarHeight: number;
}

export const useUIStore = defineStore("ui", () => {
  const settingStore = useSettingStore();

  const width = ref(1_000);
  const height = ref(500);
  const bottomBarHeight = ref(50);
  const isLogVisible = ref(false); // ログ窓表示
  const isLiveVisible = ref(false); // LIVE窓表示

  const backgroundColor = computed(() => (settingStore.isDarkMode ? "black" : "#d9d5da"));
  const panelBackgroundColor = computed(() => (settingStore.isDarkMode ? "#121212" : "white"));
  const greyBackgroundColor = computed(() => (settingStore.isDarkMode ? "#3A3A3A" : "#dcdcdc"));

  const openLiveWindow = () => {
    isLiveVisible.value = true;
  };

  const closeLiveWindow = () => {
    isLiveVisible.value = false;
  };

  const toggleLiveWindow = () => {
    isLiveVisible.value = !isLiveVisible.value;
  };

  return {
    width,
    height,
    bottomBarHeight,
    isLogVisible,
    isLiveVisible,
    backgroundColor,
    panelBackgroundColor,
    greyBackgroundColor,
    openLiveWindow,
    closeLiveWindow,
    toggleLiveWindow,
  };
});
