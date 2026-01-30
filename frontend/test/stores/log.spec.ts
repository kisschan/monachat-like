import { setActivePinia, createPinia } from "pinia";
import { useLogStore } from "@/stores/log";
import { useUsersStore } from "@/stores/users";

describe("useLogStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("filters visibleLogMessages by ignore, silent ignore, and log exclude", () => {
    expect.assertions(2);
    const logStore = useLogStore();
    const usersStore = useUsersStore();

    logStore.$patch({
      logs: [
        {
          head: "head-a",
          content: "content-a",
          foot: "foot-a",
          visibleOnReceived: true,
          color: "#ffffff",
          ihash: "a",
          uniqueId: "1",
        },
        {
          head: "head-b",
          content: "content-b",
          foot: "foot-b",
          visibleOnReceived: true,
          color: "#ffffff",
          ihash: "b",
          uniqueId: "2",
        },
        {
          head: "head-c",
          content: "content-c",
          foot: "foot-c",
          visibleOnReceived: true,
          color: "#ffffff",
          ihash: "c",
          uniqueId: "3",
        },
        {
          head: "head-empty",
          content: "content-empty",
          foot: "foot-empty",
          visibleOnReceived: true,
          color: "#ffffff",
          ihash: "",
          uniqueId: "4",
        },
      ],
    });

    usersStore.updateUserIgnore("a", true);
    usersStore.updateUserSilentIgnore("b", true);
    usersStore.setLogExcluded("c", true);

    expect(logStore.visibleLogMessages.map((log) => log.ihash)).toEqual([""]);

    usersStore.updateUserIgnore("a", false);
    usersStore.updateUserSilentIgnore("b", false);
    usersStore.setLogExcluded("c", false);

    expect(logStore.visibleLogMessages.length).toBe(4);
  });
});
