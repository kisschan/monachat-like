import "dotenv/config";
import express, { Application, Request, Response } from "express";
import * as http from "http";
import { Server, Socket } from "socket.io";
import Log4js, { Logger } from "log4js";
import { UserPresenter } from "./presenter/userPresenter";
import { ServerCommunicator as ServerCommunicator } from "./infrastructure/serverCommunicator";
import { ClientCommunicator } from "./infrastructure/clientCommunicator";
import path from "path";
import { AccountRepository } from "./infrastructure/accountRepository";
import { readFile, readFileSync } from "fs";
import cors from "cors";
import { SystemLogger } from "./infrastructure/systemLogger";
import { FourChanTripper, HashTripper } from "./domain/tripper";
import moment from "moment";
import { liveAuth } from "./middleware/liveAuth";
import { Account } from "./entity/account";
import { LiveStateRepository } from "./infrastructure/liveState";

const app: Application = express();
const server: http.Server = http.createServer(app);
const liveStateRepo = LiveStateRepository.getInstance();

type RoomConfig = {
  id: string;
  name: string;
  img_url: string;
  liveEnabled?: boolean; // room.json に追加したフラグ
};

function isLiveEnabledRoom(roomId: string): boolean {
  try {
    const jsonText = readFileSync(
      path.join(__dirname, "/config/room.json"),
      "utf-8"
    );
    const parsed = JSON.parse(jsonText);

    // /api/rooms が返しているのと同じ構造: { rooms: [...] } 前提
    const rooms: RoomConfig[] = Array.isArray(parsed.rooms) ? parsed.rooms : [];

    const room = rooms.find((r) => r.id === roomId);
    return room?.liveEnabled === true;
  } catch (e) {
    logger.error("failed to read room.json for liveEnabled check", e);
    // 何かおかしかったら配信禁止にしておく
    return false;
  }
}

const ioServer: Server = new Server(server, {
  path: "/monachatchat/",
  cors: {
    origin: process.env.FRONTEND_HOST,
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
});
const logger: Logger = Log4js.getLogger();
logger.level = "debug";

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "/dist")));
app.get("/api/rooms", (_: Request, res: Response) => {
  readFile(path.join(__dirname, "/config/room.json"), (err, data) => {
    if (err) {
      res.statusCode = 404;
    }
    return res.json(JSON.parse(data.toString("utf-8")));
  });
});
app.get("/api/colors", (_: Request, res: Response) => {
  readFile(path.join(__dirname, "/config/colors.json"), (err, data) => {
    if (err) {
      res.statusCode = 404;
    }
    return res.json(JSON.parse(data.toString("utf-8")));
  });
});
app.get("/api/characters", (_: Request, res: Response) => {
  readFile(path.join(__dirname, "/config/characters.json"), (err, data) => {
    if (err) {
      res.statusCode = 404;
    }
    return res.json(JSON.parse(data.toString("utf-8")));
  });
});
app.get("/api/character/random", (_: Request, res: Response) => {
  readFile(path.join(__dirname, "/config/characters.json"), (err, data) => {
    if (err) {
      res.statusCode = 404;
    }
    let obj = JSON.parse(data.toString("utf-8"));
    let characterSequence: Array<string> = obj.characters
      .map((e: { characters: any }) => e.characters)
      .flat();
    let randomChar =
      characterSequence[Math.floor(Math.random() * characterSequence.length)];
    return res.json({ randomChar });
  });
});
app.get("/api/news", (_: Request, res: Response) => {
  readFile(path.join(__dirname, "/config/news.json"), (err, data) => {
    if (err) {
      res.statusCode = 404;
    }
    let obj = JSON.parse(data.toString("utf-8"));
    obj.news.forEach((e: any) => {
      if (e.day == null) {
        e.isNew = false;
        return;
      }
      const isoNewsDay = new Date(e.day).toISOString();
      const newsDay = moment(isoNewsDay);
      const dayThresholdNewNews = moment().subtract(1, "week");
      e.isNew = newsDay > dayThresholdNewNews;
    });
    return res.json(obj);
  });
});

app.get("/api/live/:room/status", liveAuth, (req, res) => {
  const room = req.params.room;
  const state = liveStateRepo.get(room);
  const repo = AccountRepository.getInstance();

  if (!state.publisherId) {
    return res.json({
      isLive: false,
      publisherId: null,
      publisherName: null,
      audioOnly: false,
    });
  }

  const user = repo.fetchUser(state.publisherId, room);

  return res.json({
    isLive: true,
    publisherId: state.publisherId,
    publisherName: user?.name ?? null,
    audioOnly: state.audioOnly,
  });
});

app.post("/api/live/:room/start", liveAuth, (req, res) => {
  const room = req.params.room;
  const account = (req as any).account as Account;
  const state = liveStateRepo.get(room);

  const isSameAccount = state.publisherId === account.id;

  if (!isLiveEnabledRoom(room)) {
    return res.status(403).json({ error: "live-disabled" });
  }

  if (state.publisherId && !isSameAccount) {
    return res.status(409).json({ error: "already-live" });
  }

  // ★ ここで配信モードを受け取る（デフォルト false = 映像＋音声）
  const audioOnly = !!req.body?.audioOnly;

  liveStateRepo.set(room, account.id);

  ioServer.to(room).emit("live_status_change", {
    room,
    isLive: true,
    publisherId: account.id,
    publisherName: account.character.avatar.name.value,
    audioOnly, // ★ 追加
  });

  return res.json({ ok: true });
});
app.get("/api/live/:room/webrtc-config", liveAuth, (req, res) => {
  const room = req.params.room;

  if (!isLiveEnabledRoom(room)) {
    return res.status(403).json({ error: "live-disabled" });
  }

  const stream = buildStreamName(room);

  const whipUrl = `${SRS_BASE}/whip/?app=live&stream=${stream}`;
  const whepUrl = `${SRS_BASE}/whep/?app=live&stream=${stream}`;

  return res.json({
    whipUrl,
    whepUrl,
  });
});

app.post("/api/live/:room/stop", liveAuth, (req, res) => {
  const room = req.params.room;
  const account = (req as any).account as Account;
  const state = liveStateRepo.get(room);

  if (!state.publisherId) {
    return res.json({ ok: true });
  }

  if (state.publisherId !== account.id) {
    return res.status(403).json({ error: "not-publisher" });
  }

  liveStateRepo.clear(room);

  ioServer.to(room).emit("live_status_change", {
    room,
    isLive: false,
    publisherId: null,
    publisherName: null,
    audioOnly: false, // ★ 配信終了時は false にしておく
  });

  return res.json({ ok: true });
});

function buildStreamName(roomId: string): string {
  const withoutSlash = roomId.replace(/^\//, "");
  return encodeURIComponent(withoutSlash);
}

const SRS_BASE = process.env.SRS_WHIP_BASE; // 必須にしておくと良い
if (!SRS_BASE) {
  throw new Error("SRS_WHIP_BASE is not set");
}

// サーバーを起動しているときに、もともとつながっているソケットを一旦切断する
ioServer.disconnectSockets();

ioServer.on("connection", (socket: Socket): void => {
  // DI
  const systemLogger = new SystemLogger({ logger: logger });
  const whiteTripper = new HashTripper(process.env.IHASH_SEED ?? "");
  const blackTripper = new FourChanTripper();
  const eventSender = new ServerCommunicator({
    server: ioServer,
    systemLogger: systemLogger,
  });
  const eventReceiver = new ClientCommunicator({ socket: socket });
  const presenter = new UserPresenter({
    client: eventReceiver,
    server: eventSender,
    accountRep: AccountRepository.getInstance(),
    systemLogger,
    whiteTripper,
    blackTripper,
  });
  eventReceiver.eventHandler = presenter;
  eventSender.notificator = presenter;
  eventReceiver.init();
});

try {
  server.listen(3000, () => {
    logger.info(`Start server...`);
  });
} catch (e) {
  if (e instanceof Error) {
    logger.error(e.message);
  }
}
