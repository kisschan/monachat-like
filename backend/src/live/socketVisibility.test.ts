import { describe, expect, it, beforeEach, vi } from "vitest";
import { AccountRepository } from "../infrastructure/accountRepository";
import { Account } from "../entity/account";
import { IDGeneratable } from "../domain/idGenerator";
import { Avatar } from "../domain/avatar";
import { Name } from "../domain/name";
import { CharType } from "../domain/charType";
import { Color } from "../domain/color";
import { WhiteTrip } from "../domain/trip";
import { IP } from "../domain/ip";
import { HashTripper } from "../domain/tripper";
import {
  emitLiveRoomsChangedFiltered,
  emitLiveStatusChangeFiltered,
} from "./socketVisibility";
import type { Server, Socket } from "socket.io";

const accountRepo = AccountRepository.getInstance();

class FixedIdGenerator implements IDGeneratable {
  private values: string[];
  constructor(...values: string[]) {
    this.values = values;
  }
  generate(): string {
    return this.values.shift() ?? "unknown";
  }
}

type FakeSocket = Pick<Socket, "id" | "rooms" | "emit">;

const createAccount = ({
  id,
  token,
  socketId,
  room,
  ip,
}: {
  id: string;
  token: string;
  socketId: string;
  room: string;
  ip: string;
}): { account: Account; ihash: string } => {
  const generator = new FixedIdGenerator(id, token);
  const account = accountRepo.create(socketId, generator);
  const avatar = new Avatar({
    name: new Name(id),
    charType: new CharType("mona"),
    charColor: Color.white(),
    whiteTrip: new WhiteTrip(new IP(ip), new HashTripper("seed")),
  });
  accountRepo.updateCharacter(
    account.id,
    account.character.copy().updateAvatar(avatar).moveRoom(room)
  );
  return { account, ihash: avatar.whiteTrip?.value ?? "" };
};

const createFakeServer = (sockets: Map<string, FakeSocket>): Server => {
  return {
    sockets: { sockets },
  } as unknown as Server;
};

describe("socketVisibility filtered emitters", () => {
  const room = "/room";

  beforeEach(() => {
    accountRepo.deleteAll();
  });

  it("sends invalidate live_rooms_changed to blocked viewers", () => {
    const publisher = createAccount({
      id: "publisher",
      token: "pub-token",
      socketId: "pub-socket",
      room,
      ip: "1.1.1.1",
    });
    const allowedViewer = createAccount({
      id: "viewer-allowed",
      token: "allowed-token",
      socketId: "allowed-socket",
      room,
      ip: "2.2.2.2",
    });
    const blockedViewer = createAccount({
      id: "viewer-blocked",
      token: "blocked-token",
      socketId: "blocked-socket",
      room,
      ip: "3.3.3.3",
    });

    accountRepo.updateIgnore(publisher.account.id, blockedViewer.ihash, true);

    const allowedSocket: FakeSocket = {
      id: "allowed-socket",
      rooms: new Set([room]),
      emit: vi.fn(),
    };
    const blockedSocket: FakeSocket = {
      id: "blocked-socket",
      rooms: new Set([room]),
      emit: vi.fn(),
    };

    const ioServer = createFakeServer(
      new Map([
        [allowedSocket.id, allowedSocket],
        [blockedSocket.id, blockedSocket],
      ])
    );

    emitLiveRoomsChangedFiltered({
      ioServer,
      accountRepo,
      roomId: room,
      publisherId: publisher.account.id,
      payloadForAllowed: { type: "invalidate" },
    });

    expect(allowedSocket.emit).toHaveBeenCalledTimes(1);
    expect(allowedSocket.emit).toHaveBeenCalledWith("live_rooms_changed", {
      type: "invalidate",
    });
    expect(blockedSocket.emit).toHaveBeenCalledTimes(1);
    expect(blockedSocket.emit).toHaveBeenCalledWith("live_rooms_changed", {
      type: "invalidate",
    });
  });

  it("does not send live_status_change to blocked viewers in the room", () => {
    const publisher = createAccount({
      id: "publisher",
      token: "pub-token",
      socketId: "pub-socket",
      room,
      ip: "1.1.1.1",
    });
    const allowedViewer = createAccount({
      id: "viewer-allowed",
      token: "allowed-token",
      socketId: "allowed-socket",
      room,
      ip: "2.2.2.2",
    });
    const blockedViewer = createAccount({
      id: "viewer-blocked",
      token: "blocked-token",
      socketId: "blocked-socket",
      room,
      ip: "3.3.3.3",
    });

    accountRepo.updateIgnore(blockedViewer.account.id, publisher.ihash, true);

    const allowedSocket: FakeSocket = {
      id: "allowed-socket",
      rooms: new Set([room]),
      emit: vi.fn(),
    };
    const blockedSocket: FakeSocket = {
      id: "blocked-socket",
      rooms: new Set([room]),
      emit: vi.fn(),
    };
    const otherRoomSocket: FakeSocket = {
      id: "other-room",
      rooms: new Set(["/other"]),
      emit: vi.fn(),
    };

    const ioServer = createFakeServer(
      new Map([
        [allowedSocket.id, allowedSocket],
        [blockedSocket.id, blockedSocket],
        [otherRoomSocket.id, otherRoomSocket],
      ])
    );

    emitLiveStatusChangeFiltered({
      ioServer,
      accountRepo,
      roomId: room,
      publisherId: publisher.account.id,
      payloadForAllowed: { room, isLive: true, publisherId: publisher.account.id },
    });

    expect(allowedSocket.emit).toHaveBeenCalledTimes(1);
    expect(allowedSocket.emit).toHaveBeenCalledWith("live_status_change", {
      room,
      isLive: true,
      publisherId: publisher.account.id,
    });
    expect(blockedSocket.emit).toHaveBeenCalledWith("live_status_change", {
      room,
    });
    expect(otherRoomSocket.emit).not.toHaveBeenCalled();
  });
});
