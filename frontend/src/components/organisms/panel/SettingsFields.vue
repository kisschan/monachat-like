<template>
  <div>
    <Accordion :value="['0', '1']" multiple>
      <AccordionPanel value="0">
        <AccordionHeader>一般／外観</AccordionHeader>
        <AccordionContent>
          <div class="field-wrapper">
            <SwitchField
              v-model="isDrawnUnderlineLog"
              label="ログに色の下線を引く"
              label-id="drawUnderLineLog"
            />
          </div>
          <div class="field-wrapper">
            <SwitchField
              v-model="isClickToChangeColorEnabled"
              label="クリックのみでユーザーのログの色を切り替える"
              label-id="userColorEnabled"
            />
          </div>
          <div class="field-wrapper">
            <SwitchField v-model="isKBMode" label="KBテーマ" label-id="KBMode" />
          </div>
          <div class="field-wrapper">
            <SwitchField v-model="isDarkMode" label="ダークモード" label-id="darkMode" />
          </div>
          <div class="field-wrapper">
            <div><SpanText id="lp-action" text="長押しの動作" /></div>
            <SelectButton
              v-model="longPressActionView"
              :options="longPressOptions"
              option-label="label"
              option-value="value"
              aria-labelledby="lp-action"
              class="lp-select"
            />
          </div>
        </AccordionContent>
      </AccordionPanel>
      <AccordionPanel value="1">
        <AccordionHeader>高度な設定</AccordionHeader>
        <AccordionContent>
          <div class="field-wrapper">
            <SwitchField
              v-model="isScrollableLog"
              label="ログの高さを固定する（スクロール）"
              label-id="scrollableLog"
            />
          </div>
          <div class="field-wrapper">
            <SwitchField
              v-model="isDescendingLog"
              label="ログの最新を一番下にする"
              label-id="descendingLog"
            />
          </div>
          <div class="field-wrapper">
            <SwitchField v-model="isTypingMode" label="タイピングモード" label-id="typingMode" />
          </div>
          <div class="field-wrapper">
            <div><SpanText text="ログ行数" /></div>
            <SelectButton v-model="logLineNumber" :options="options" aria-labelledby="basic" />
          </div>
          <div class="field-wrapper">
            <SwitchField
              v-model="isExtention"
              label="拡張機能をONにする(要リロード)"
              label-id="extension"
            />
          </div>
          <div class="field-wrapper">
            <PrimeButton
              label="ログを削除する"
              icon="pi pi-trash"
              class="p-button-raised p-button-sm p-button-text p-button-warning"
              @click="deleteLog"
            />
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import PrimeButton from "primevue/button";
import Accordion from "primevue/accordion";
import AccordionPanel from "primevue/accordionpanel";
import AccordionHeader from "primevue/accordionheader";
import AccordionContent from "primevue/accordioncontent";
import SelectButton from "primevue/selectbutton";
import SwitchField from "@/components/molecules/SwitchField.vue";
import SpanText from "@/components/atoms/SpanText.vue";
import { useSettingStore } from "@/stores/setting";
import { useLogStore } from "@/stores/log";
import type { LongPressAction } from "@/stores/setting";

const logStore = useLogStore();
const settingStore = useSettingStore();

const options = ["制限なし", "1000行", "200行", "100行", "50行"];

const isKBMode = computed({
  get: () => settingStore.isKBMode,
  set: (value) => settingStore.updateIsKBMode(value),
});

const isExtention = computed({
  get: () => settingStore.isExtension,
  set: (value) => settingStore.updateIsExtension(value),
});

const isTypingMode = computed({
  get: () => settingStore.isTypingMode,
  set: (value) => settingStore.updateIsTypingMode(value),
});
const isScrollableLog = computed({
  get: () => settingStore.isScrollableLog,
  set: (value) => settingStore.updateIsScrollableLog(value),
});
const isDescendingLog = computed({
  get: () => settingStore.isDescendingLog,
  set: (value) => settingStore.updateIsDescendingLog(value),
});
const isDrawnUnderlineLog = computed({
  get: () => settingStore.isDrawnUnderlineLog,
  set: (value) => settingStore.updateIsDrawnUnderlineLog(value),
});
const isClickToChangeColorEnabled = computed({
  get: () => settingStore.isClickToChangeColorEnabled,
  set: (value) => settingStore.updateIsClickToChangeColorEnabled(value),
});
const longPressOptions = [
  { label: "何もしない", value: "none" as LongPressAction },
  { label: "無視", value: "ignore" as LongPressAction },
  { label: "色を消す", value: "clear" as LongPressAction },
];

const longPressActionView = computed<LongPressAction>({
  get: () => settingStore.longPressAction as LongPressAction,
  set: (v: LongPressAction) => settingStore.updateLongPressAction(v),
});
const logLineNumber = computed({
  get: () => {
    const value = settingStore.logLineNumber;
    switch (value) {
      case "0":
        return "制限なし";
      case "1000":
        return "1000行";
      case "200":
        return "200行";
      case "100":
        return "100行";
      case "50":
        return "50行";
      default:
        return "";
    }
  },
  set: (value) => {
    switch (value) {
      case "制限なし":
        settingStore.updateLogLineNumber("0");
        break;
      case "1000行":
        settingStore.updateLogLineNumber("1000");
        break;
      case "200行":
        settingStore.updateLogLineNumber("200");
        break;
      case "100行":
        settingStore.updateLogLineNumber("100");
        break;
      case "50行":
        settingStore.updateLogLineNumber("50");
        break;
      default:
        settingStore.updateLogLineNumber("");
        break;
    }
  },
});
const isDarkMode = computed({
  get: () => settingStore.isDarkMode,
  set: (value) => settingStore.updateIsDarkMode(value),
});
const deleteLog = () => logStore.resetLog();

watch(
  isDarkMode,
  (value) => {
    if (value) {
      document.querySelector("html")?.classList.add("my-app-dark");
    } else {
      document.querySelector("html")?.classList.remove("my-app-dark");
    }
  },
  { immediate: true },
);

// NOTE: logInfiniteの移行
if (logLineNumber.value === "") {
  logLineNumber.value = settingStore.isInfiniteLog ? "制限なし" : "1000行";
}
</script>

<style lang="scss" scoped>
.field-wrapper {
  padding-top: 0.3rem;
  padding-bottom: 0.3rem;
}

:deep(.p-togglebutton) {
  width: 100px;
  padding: 6px 10px;
}

:deep(.lp-select .p-togglebutton) {
  width: 150px;
  padding: 6px 10px;
}
</style>
