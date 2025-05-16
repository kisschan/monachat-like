import { defineStore } from "pinia";
import { computed, Ref, ref, watch } from "vue";

export interface ISetting {
  isDarkMode: boolean;
}

const storageKeyPrefix = `/monachatchat`;
type StorageKey =
  | "name"
  | "trip"
  | "type"
  | "color"
  | "tripResult"
  | "darkMode"
  | "sound"
  | "time"
  | "kbMode"
  | "extension"
  | "typingMode"
  | "scrollableLog"
  | "descendingLog"
  | "drawBorderBottomLog"
  | "userColorEnabled"
  | "logInfinite"
  | "logLineNumber"
  | "selectedUsersIhashes"
  | "log";
const TRUE = "true";
const FALSE = "false";

export const SelectedUserColors = ["red", "blue", "green", "purple", "orange", "pink"] as const;
export type SelectedUserColorType = (typeof SelectedUserColors)[number];
export type TimeOptionsType = "quick" | "short" | "medium" | "long";

const getBooleanValueWithDefault = (key: StorageKey, defaultValue: boolean) => {
  const serializedValue = localStorage.getItem(`${storageKeyPrefix}/${key}`);
  if (serializedValue !== null && ![TRUE, FALSE].includes(serializedValue)) {
    return defaultValue;
  }
  return serializedValue === TRUE;
};
const updateBooleanValueWithPerpetuation = (ref: Ref<boolean>, key: StorageKey, value: boolean) => {
  ref.value = value;
  const serializedValue = value ? TRUE : FALSE;
  localStorage.setItem(`${storageKeyPrefix}/${key}`, serializedValue);
};
const getValueWithDefault = (key: StorageKey, defaultValue: string) =>
  localStorage.getItem(`${storageKeyPrefix}/${key}`) ?? defaultValue;
const updateValueWithPerpetuation = (ref: Ref<string>, key: StorageKey, value: string) => {
  ref.value = value;
  localStorage.setItem(`${storageKeyPrefix}/${key}`, value);
};
const getValueSessionStorageWithDefault = (key: StorageKey, defaultValue: string) =>
  sessionStorage.getItem(`${storageKeyPrefix}/${key}`) ?? defaultValue;

const updateValueSessionStorageWithPerpetuation = (
  ref: Ref<string>,
  key: StorageKey,
  value: string,
) => {
  ref.value = value;
  sessionStorage.setItem(`${storageKeyPrefix}/${key}`, value);
};

export const useSettingStore = defineStore("setting", () => {
  // キャラクター情報
  const savedName = ref(getValueWithDefault("name", ""));
  const updateSavedName = (value: string) => updateValueWithPerpetuation(savedName, "name", value);
  const savedInputTrip = ref(getValueWithDefault("trip", ""));
  const updateSavedInputTrip = (value: string) =>
    updateValueWithPerpetuation(savedInputTrip, "trip", value);
  const tripResult = ref(getValueWithDefault("tripResult", ""));
  const updateTripResult = (value: string | undefined) =>
    updateValueWithPerpetuation(tripResult, "tripResult", value ?? "");
  const savedType = ref(getValueWithDefault("type", "charhan"));
  const updateSavedType = (value: string) => updateValueWithPerpetuation(savedType, "type", value);
  const savedColor = ref(getValueWithDefault("color", "#ffffff"));
  const updateSavedColor = (value: string) =>
    updateValueWithPerpetuation(savedColor, "color", value);
  const characterSetupResult = {
    savedName,
    updateSavedName,
    savedInputTrip,
    updateSavedInputTrip,
    tripResult,
    updateTripResult,
    savedType,
    updateSavedType,
    savedColor,
    updateSavedColor,
  };

  // 設定情報
  const selectedVolume = ref(getValueWithDefault("sound", ""));
  const updateSelectedVolume = (value: string) =>
    updateValueWithPerpetuation(selectedVolume, "sound", value);
  const selectedTime = ref(getValueWithDefault("time", "short"));
  const updateSelectedTime = (value: string) =>
    updateValueWithPerpetuation(selectedTime, "time", value);
  // 設定情報（下部パネル）
  const isKBMode = ref(getBooleanValueWithDefault("kbMode", false)); // KBモード ON/OFF
  const updateIsKBMode = (value: boolean) =>
    updateBooleanValueWithPerpetuation(isKBMode, "kbMode", value);
  const isExtension = ref(getBooleanValueWithDefault("extension", false)); // 拡張機能　ON/OFF
  const updateIsExtension = (value: boolean) =>
    updateBooleanValueWithPerpetuation(isExtension, "extension", value);
  const isDarkMode = ref(getBooleanValueWithDefault("darkMode", false));
  const updateIsDarkMode = (value: boolean) =>
    updateBooleanValueWithPerpetuation(isDarkMode, "darkMode", value);
  const isTypingMode = ref(getBooleanValueWithDefault("typingMode", true)); // タイピングモード ON/OFF
  const updateIsTypingMode = (value: boolean) =>
    updateBooleanValueWithPerpetuation(isTypingMode, "typingMode", value);
  const isScrollableLog = ref(getBooleanValueWithDefault("scrollableLog", false));
  const updateIsScrollableLog = (value: boolean) =>
    updateBooleanValueWithPerpetuation(isScrollableLog, "scrollableLog", value);
  const isDescendingLog = ref(getBooleanValueWithDefault("descendingLog", false));
  const updateIsDescendingLog = (value: boolean) =>
    updateBooleanValueWithPerpetuation(isDescendingLog, "descendingLog", value);
  const isDrawnUnderlineLog = ref(getBooleanValueWithDefault("drawBorderBottomLog", false));
  const updateIsDrawnUnderlineLog = (value: boolean) =>
    updateBooleanValueWithPerpetuation(isDrawnUnderlineLog, "drawBorderBottomLog", value);
  const isClickToChangeColorEnabled = ref(getBooleanValueWithDefault("userColorEnabled", false));
  const updateIsClickToChangeColorEnabled = (value: boolean) =>
    updateBooleanValueWithPerpetuation(isClickToChangeColorEnabled, "userColorEnabled", value);
  // TODO: logLineNumberへの移行が完了したら削除
  const isInfiniteLog = ref(getBooleanValueWithDefault("logInfinite", false)); // ログを無限に保存するか
  const logLineNumber = ref(getValueWithDefault("logLineNumber", ""));
  const logLineNumberInteger = computed(() => {
    const parsed = parseInt(logLineNumber.value, 10);
    return isNaN(parsed) ? 0 : parsed;
  });
  const updateLogLineNumber = (value: string) =>
    updateValueWithPerpetuation(logLineNumber, "logLineNumber", value);

  const settingSetupResult = {
    selectedVolume,
    updateSelectedVolume,
    selectedTime,
    updateSelectedTime,
    isKBMode,
    updateIsExtension,
    isExtension,
    updateIsKBMode,
    isDarkMode,
    updateIsDarkMode,
    isTypingMode,
    updateIsTypingMode,
    isScrollableLog,
    updateIsScrollableLog,
    isDescendingLog,
    updateIsDescendingLog,
    isDrawnUnderlineLog,
    updateIsDrawnUnderlineLog,
    isClickToChangeColorEnabled,
    updateIsClickToChangeColorEnabled,
    isInfiniteLog,
    logLineNumber,
    logLineNumberInteger,
    updateLogLineNumber,
  };

  // ユーザー設定情報

  const selectedUsersIhashesRaw = ref(
    getValueSessionStorageWithDefault("selectedUsersIhashes", "{}"),
  );

  const loadSelectedUsersIhashesRaw = (defaultRaw: object = {}) => {
    let raw: { [key in string]: SelectedUserColorType };
    try {
      raw = JSON.parse(selectedUsersIhashesRaw.value);
      return raw;
    } catch {
      sessionStorage.removeItem(storageKeyPrefix + "/selectedUsersIhashes");
      return defaultRaw;
    }
  };

  const savedselectedUsersIhashes = computed(() => {
    return loadSelectedUsersIhashesRaw() as { [key in string]: SelectedUserColorType };
  });

  const selectedUsersIhashes = ref<{ [key in string]: SelectedUserColorType }>(
    savedselectedUsersIhashes.value,
  );

  const toggleUserSelecting = (ihash: string) => {
    if (selectedUsersIhashes.value[ihash]) {
      delete selectedUsersIhashes.value[ihash];
    } else {
      selectedUsersIhashes.value[ihash] = "red";
    }
  };

  const changeSelectedUserColor = (ihash: string) => {
    const indexOfSelectedColor = SelectedUserColors.indexOf(
      selectedUsersIhashes.value[ihash] ?? "red",
    );
    const nextIndex = (indexOfSelectedColor + 1) % SelectedUserColors.length;
    selectedUsersIhashes.value[ihash] = SelectedUserColors[nextIndex] ?? "red";
  };

  const clickToChangeColor = (ihash: string) => {
    if (selectedUsersIhashes.value[ihash] === "pink") {
      delete selectedUsersIhashes.value[ihash];
      return;
    }
    if (selectedUsersIhashes.value[ihash]) {
      changeSelectedUserColor(ihash);
    } else {
      selectedUsersIhashes.value[ihash] = "red";
    }
  };

  const saveCurrentSelectedUsersIhashesObj = (value: {
    [key in string]: SelectedUserColorType;
  }) => {
    const selectedUsersIhashesRawData = JSON.stringify(value);
    updateValueSessionStorageWithPerpetuation(
      selectedUsersIhashesRaw,
      "selectedUsersIhashes",
      selectedUsersIhashesRawData,
    );
  };

  watch(
    selectedUsersIhashes,
    (newVal: { [key in string]: SelectedUserColorType }) => {
      saveCurrentSelectedUsersIhashesObj(newVal);
    },
    { deep: true },
  );

  const log = ref(getValueSessionStorageWithDefault("log", "[]"));
  const saveCurrentLog = (
    value: {
      head: string;
      content: string;
      foot: string;
      visibleOnReceived: boolean;
      color: string;
      ihash: string;
    }[],
  ) => {
    const SAVED_LOG_MAX = 10_000;
    let cutLogs = value;
    if (value.length > SAVED_LOG_MAX) {
      cutLogs = value.slice(0, SAVED_LOG_MAX - value.length);
    }
    const logRawData = JSON.stringify(cutLogs);
    updateValueSessionStorageWithPerpetuation(log, "log", logRawData);
  };
  const loadedLogFromStorage = computed(() => {
    return JSON.parse(log.value) as {
      head: string;
      content: string;
      foot: string;
      visibleOnReceived: boolean;
      color: string;
      ihash: string;
    }[];
  });
  const userSettingResult = {
    selectedUsersIhashes,
    toggleUserSelecting,
    changeSelectedUserColor,
    clickToChangeColor,
    log,
    saveCurrentLog,
    loadedLogFromStorage,
  };

  const savedNameWithTrip = computed(() => {
    if (savedInputTrip.value === "") {
      return savedName.value;
    }
    return `${savedName.value}#${savedInputTrip.value}`;
  });

  return {
    ...characterSetupResult,
    ...settingSetupResult,
    ...userSettingResult,
    savedNameWithTrip,
  };
});
