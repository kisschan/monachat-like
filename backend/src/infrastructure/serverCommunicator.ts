import { Server } from "socket.io";
import {
  IServerCommunicator,
  ISystemSendLogger,
  LiveStatusChangePayload,
} from "../presenter/userPresenterInterfaces";
import { AWAKE, AWAKEResponse } from "../protocol/awake";
import { COM, COMResponse } from "../protocol/com";
import { COUNT, COUNTResponse } from "../protocol/count";
import { ENTER, ENTERResponse } from "../protocol/enter";
import { EXIT, EXITResponse } from "../protocol/exit";
import { IG, IGResponse } from "../protocol/ig";
import { SET, SETResponse } from "../protocol/set";
import { SLEEP, SLEEPResponse } from "../protocol/sleep";
import { USER } from "../protocol/user";
import { AccountRepository } from "./accountRepository";
import {
  emitLiveRoomsChangedFiltered,
  emitLiveStatusChangeFiltered,
} from "../live/socketVisibility";

export interface IServerNotificator {}

export type ServerCommunicatorOptions = {
  server: Server;
  systemLogger: ISystemSendLogger;
  accountRepo: AccountRepository;
};

export class ServerCommunicator implements IServerCommunicator {
  notificator?: IServerNotificator;
  private server: Server;
  private systemLogger: ISystemSendLogger;
  private accountRepo: AccountRepository;

  constructor({
    server,
    systemLogger,
    accountRepo,
  }: ServerCommunicatorOptions) {
    this.server = server;
    this.systemLogger = systemLogger;
    this.accountRepo = accountRepo;
  }
  sendCOM(param: COMResponse, to: string): void {
    this.systemLogger.logSendCOM(param, to);
    this.server.in(to).emit(COM, param);
  }

  sendENTER(param: ENTERResponse, to: string | undefined): void {
    this.systemLogger.logSendENTER(param, to);
    if (to !== undefined) {
      this.server.in(to).emit(ENTER, param);
    }
  }

  sendSET(param: SETResponse, to: string): void {
    this.systemLogger.logSendSET(param, to);
    this.server.in(to).emit(SET, param);
  }

  sendIG(param: IGResponse, to: string): void {
    this.systemLogger.logSendIG(param, to);
    this.server.in(to).emit(IG, param);
  }

  sendEXIT(param: EXITResponse, to: string | undefined): void {
    this.systemLogger.logSendEXIT(param, to);
    if (to !== undefined) {
      this.server.in(to).emit(EXIT, param);
    }
  }

  sendSLEEP(param: SLEEPResponse, to: string | null): void {
    this.systemLogger.logSendSLEEP(param, to);
    if (to !== null) {
      this.server.in(to).emit(SLEEP, param);
    }
  }

  sendAWAKE(param: AWAKEResponse, to: string | null): void {
    this.systemLogger.logSendAWAKE(param, to);
    if (to !== null) {
      this.server.in(to).emit(AWAKE, param);
    }
  }

  sendCOUNT(param: COUNTResponse): void {
    this.systemLogger.logSendCOUNT(param);
    this.server.in("/MONA8094").emit(COUNT, param);
  }

  sendUsers(users: USER[], to: string | null): void {
    this.systemLogger.logSendUsers();
    if (to !== null) {
      this.server.in(to).emit("USER", users);
    }
  }

  sendLiveStatusChange(param: LiveStatusChangePayload, to: string): void {
    this.server.in(to).emit("live_status_change", param);
  }

  sendLiveStatusChangeToSocket(
    param: LiveStatusChangePayload,
    socketId: string
  ): void {
    this.server.to(socketId).emit("live_status_change", param); //個別socket宛
  }

  sendLiveRoomsChanged(param: any, to: string | null): void {
    if (to !== null) {
      this.server.in(to).emit("live_rooms_changed", param);
    } else {
      this.server.emit("live_rooms_changed", param);
    }
  }

  sendLiveRoomsChangedFiltered(
    roomId: string,
    publisherId: string,
    payload: any
  ): void {
    emitLiveRoomsChangedFiltered({
      ioServer: this.server,
      accountRepo: this.accountRepo,
      roomId,
      publisherId,
      payloadForAllowed: payload,
    });
  }

  sendLiveStatusChangeFiltered(
    roomId: string,
    publisherId: string,
    payload: LiveStatusChangePayload
  ): void {
    emitLiveStatusChangeFiltered({
      ioServer: this.server,
      accountRepo: this.accountRepo,
      roomId,
      publisherId,
      payloadForAllowed: payload,
    });
  }
}
