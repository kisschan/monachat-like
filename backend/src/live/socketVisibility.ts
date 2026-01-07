import type { Server, Socket } from "socket.io";
import type { Account } from "../entity/account";
import { AccountRepository } from "../infrastructure/accountRepository";
import type { LiveStatusChangePayload } from "../protocol/livestatus";

export type LiveRoomsChangedParams = {
  ioServer: Server;
  accountRepo: AccountRepository;
  roomId: string;
  publisherId: string;
  payloadForAllowed: any;
};

export type LiveStatusChangeParams = {
  ioServer: Server;
  accountRepo: AccountRepository;
  roomId: string;
  publisherId: string;
  payloadForAllowed: LiveStatusChangePayload;
};

export function canViewerSeePublisherAccounts(
  viewerAccount: Account | undefined,
  publisherAccount: Account | undefined,
  accountRepo: AccountRepository
): boolean {
  if (!viewerAccount || !publisherAccount) return false;
  if (viewerAccount.id === publisherAccount.id) return true;

  const viewerIhash = viewerAccount.character.avatar.whiteTrip?.value ?? null;
  const publisherIhash = publisherAccount.character.avatar.whiteTrip?.value ?? null;

  if (!viewerIhash || !publisherIhash) return false;

  const viewerIgnoresPublisher = accountRepo.isIgnored(
    viewerAccount.id,
    publisherIhash
  );
  const publisherIgnoresViewer = accountRepo.isIgnored(
    publisherAccount.id,
    viewerIhash
  );

  return !(viewerIgnoresPublisher || publisherIgnoresViewer);
}

export function emitLiveRoomsChangedFiltered({
  ioServer,
  accountRepo,
  roomId: _roomId,
  publisherId: _publisherId,
  payloadForAllowed,
}: LiveRoomsChangedParams): void {
  void accountRepo;
  void _roomId;
  void _publisherId;
  for (const [socketId, socket] of ioServer.sockets.sockets) {
    void socketId;
    socket.emit("live_rooms_changed", payloadForAllowed);
  }
}

export function emitLiveStatusChangeFiltered({
  ioServer,
  accountRepo,
  roomId,
  publisherId,
  payloadForAllowed,
}: LiveStatusChangeParams): void {
  const publisherAccount = accountRepo.getAccountByID(publisherId);
  if (!publisherAccount) return;

  for (const [socketId, socket] of ioServer.sockets.sockets) {
    if (!socket.rooms.has(roomId)) continue;
    sendIfVisible({
      socket,
      socketId,
      accountRepo,
      publisherAccount,
      event: "live_status_change",
      payload: payloadForAllowed,
      payloadForBlocked: { room: roomId },
    });
  }
}

function sendIfVisible({
  socket,
  socketId,
  accountRepo,
  publisherAccount,
  event,
  payload,
  payloadForBlocked,
}: {
  socket: Socket;
  socketId: string;
  accountRepo: AccountRepository;
  publisherAccount: Account;
  event: "live_rooms_changed" | "live_status_change";
  payload: any;
  payloadForBlocked?: any;
}): void {
  const viewerAccount = accountRepo.getAccountBySocketId(socketId);
  if (
    !canViewerSeePublisherAccounts(viewerAccount, publisherAccount, accountRepo)
  ) {
    if (payloadForBlocked !== undefined) {
      socket.emit(event, payloadForBlocked);
    }
    return;
  }
  socket.emit(event, payload);
}
