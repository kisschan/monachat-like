import { useSettingStore, type LongPressAction } from "@/stores/setting";
import { useUserStore } from "@/stores/user";
import { useUsersStore } from "@/stores/users";

type Ctx = {
  setting: ReturnType<typeof useSettingStore>;
  user: ReturnType<typeof useUserStore>;
  users: ReturnType<typeof useUsersStore>;
};
type Cmd = (ihash: string, ctx: Ctx) => void;

const Commands: Record<LongPressAction, Cmd> = {
  none: () => {},
  ignore: (ihash, { user, users }) => {
    const myIhash = user.ihash;
    if (typeof myIhash === "string" && ihash === myIhash) return;
    user.sendIgnorance(ihash, true);
    users.idsByIhash[ihash]?.forEach((id) => users.removeChatMessages(id));
  },
  clear: (ihash, { setting }) => {
    if (setting.selectedUsersIhashes[ihash] !== undefined)
      delete setting.selectedUsersIhashes[ihash];
  },
};

export function handleLongPressOnUser(ihash: string): void {
  const ctx: Ctx = {
    setting: useSettingStore(),
    user: useUserStore(),
    users: useUsersStore(),
  };
  const action = ctx.setting.longPressAction as LongPressAction;
  Commands[action](ihash, ctx);
}
