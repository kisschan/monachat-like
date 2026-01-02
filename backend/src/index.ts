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
import {
  LiveStateRepository,
  RoomLiveStateInfo,
} from "./infrastructure/liveState";
import { isLiveConfigured, getWhipBase } from "./config/liveConfig";
import * as crypto from "crypto";
import {
  signStreamTokenV1,
  verifyStreamTokenV1,
  type StreamTokenScope,
} from "./live/streamTokenV1";

import { liveAuthAnyRoom } from "./middleware/liveAuthAnyRoom";

const RAW_WHIP_TOKEN_SECRET = process.env.WHIP_TOKEN_SECRET ?? "";
const WHIP_TOKEN_SECRET_MIN_LENGTH = 32; // 32文字未満は弱すぎとみなす

const isWhipTokenSecretValid =
  typeof RAW_WHIP_TOKEN_SECRET === "string" &&
  RAW_WHIP_TOKEN_SECRET.length >= WHIP_TOKEN_SECRET_MIN_LENGTH;

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
    //TODO:config に依存なので、要リファクタリング
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

type StreamTokenCheckResult =
  | {
      ok: true;
      roomId: string;
      publisherId: string;
      reason: null;
    }
  | {
      ok: false;
      reason:
        | "missing-params"
        | "bad-format"
        | "expired"
        | "invalid-signature"
        | "unknown-streamKey";
    };

function checkWhipToken(
  streamParam: string | null,
  tokenParam: string | null
): StreamTokenCheckResult {
  return checkStreamToken(streamParam, tokenParam, "whip");
}

function checkWhepToken(
  streamParam: string | null,
  tokenParam: string | null
): StreamTokenCheckResult {
  return checkStreamToken(streamParam, tokenParam, "whep");
}

function checkStreamToken(
  streamParam: string | null,
  tokenParam: string | null,
  scope: StreamTokenScope
): StreamTokenCheckResult {
  if (!streamParam || !tokenParam || !scope) {
    return { ok: false, reason: "missing-params" };
  }
  if (!isWhipTokenSecretValid) {
    return { ok: false, reason: "invalid-signature" };
  }

  const now = Math.floor(Date.now() / 1000);

  const v = verifyStreamTokenV1({
    secret: RAW_WHIP_TOKEN_SECRET,
    streamParam,
    tokenParam,
    scope,
    nowSec: now,
  });

  if (!v.ok) return { ok: false, reason: v.reason };

  const found = liveStateRepo.findByStreamKey(streamParam);
  if (!found || !found.state.publisherId) {
    return { ok: false, reason: "unknown-streamKey" };
  }

  return {
    ok: true,
    roomId: found.roomId,
    publisherId: found.state.publisherId,
    reason: null,
  };
}

function requireInternalSecret(req: Request, res: Response): boolean {
  const expected = process.env.INTERNAL_AUTH_SECRET ?? "";
  if (expected.length < 32) {
    logger.error("INTERNAL_AUTH_SECRET is not configured");
    res.setHeader("X-Auth-Reason", "internal-secret-misconfigured");
    res.status(403).end(); // 503 ではなく 403 に寄せる
    return false;
  }

  const got = req.header("x-internal-secret") ?? "";
  if (got.length !== expected.length) {
    res.status(403).end();
    return false;
  }

  // timing safe compare
  const aBuf = Buffer.from(got);
  const bBuf = Buffer.from(expected);

  if (aBuf.length !== bBuf.length) {
    res.status(403).end();
    return false;
  }

  const aView = new Uint8Array(aBuf.buffer, aBuf.byteOffset, aBuf.byteLength);
  const bView = new Uint8Array(bBuf.buffer, bBuf.byteOffset, bBuf.byteLength);

  if (!crypto.timingSafeEqual(aView, bView)) {
    res.status(403).end();
    return false;
  }
  return true;
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

const FRONTEND_HOST = process.env.FRONTEND_HOST;
if (!FRONTEND_HOST) throw new Error("FRONTEND_HOST is not set");

const corsOptions = {
  origin: FRONTEND_HOST,
  credentials: true,
  allowedHeaders: ["X-Monachat-Token", "Content-Type"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());
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
  if (!isLiveConfigured || !isWhipTokenSecretValid) {
    res.status(503).json({ error: "live-not-configured" });
    return;
  }

  const room = req.params.room;
  const state = liveStateRepo.get(room);
  const repo = AccountRepository.getInstance();

  if (state.phase !== "live" || !state.publisherId) {
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

const STARTING_TTL_MS = 90_000;

app.post("/api/live/:room/start", liveAuth, (req, res) => {
  if (!isLiveConfigured || !isWhipTokenSecretValid) {
    res.status(503).json({ error: "live-not-configured" });
    return;
  }

  const room = req.params.room;

  // ★ stale starting を除去してから判定に入る
  liveStateRepo.clearIfExpiredStarting(room, STARTING_TTL_MS);

  const account = (req as any).account as Account;
  const state = liveStateRepo.get(room);

  const isSameAccount = state.publisherId === account.id;

  if (!isLiveEnabledRoom(room)) {
    return res.status(403).json({ error: "live-disabled" });
  }

  // ★ starting/live で他者ロック中なら拒否
  const lockedByOther =
    state.phase !== "idle" && state.publisherId != null && !isSameAccount;

  if (lockedByOther) {
    return res.status(409).json({ error: "already-live" });
  }

  const audioOnly = !!req.body?.audioOnly;

  const streamKey =
    isSameAccount && state.streamKey
      ? state.streamKey
      : crypto.randomBytes(16).toString("hex");

  liveStateRepo.setStarting(room, account.id, audioOnly, streamKey);

  return res.json({ ok: true });
});

app.get("/api/live/:room/webrtc-config", liveAuth, (req, res) => {
  if (!isLiveConfigured || !isWhipTokenSecretValid) {
    return res.status(503).json({ error: "live-not-configured" });
  }

  const room = req.params.room;
  const account = (req as any).account as Account;

  if (!isLiveEnabledRoom(room)) {
    return res.status(403).json({ error: "live-disabled" });
  }

  const state = liveStateRepo.get(room); // { publisherId, audioOnly, ... } 想定

  // ロックなし：配信開始手続きが踏まれていない
  if (!state.publisherId || !state.streamKey) {
    return res.status(409).json({ error: "no-live-lock" });
  }
  const whipBase = getWhipBase();
  const stream = encodeURIComponent(state.streamKey);

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 300;

  const whipToken = signStreamTokenV1({
    secret: RAW_WHIP_TOKEN_SECRET,
    streamKey: state.streamKey,
    expiresAt,
    scope: "whip",
  });
  const whepToken = signStreamTokenV1({
    secret: RAW_WHIP_TOKEN_SECRET,
    streamKey: state.streamKey,
    expiresAt,
    scope: "whep",
  });

  const whepUrl = `${whipBase}/whep/?app=live&stream=${stream}&auth=${encodeURIComponent(
    whepToken
  )}`;

  if (state.publisherId === account.id) {
    const whipUrl = `${whipBase}/whip/?app=live&stream=${stream}&auth=${encodeURIComponent(
      whipToken
    )}`;
    return res.json({
      role: "publisher",
      whipUrl,
      whepUrl,
      expiresAt,
    });
  }

  // 他人が配信中：視聴者として WHEP のみ
  return res.json({
    role: "viewer",
    whepUrl,
    expiresAt,
  });
});

app.post("/api/live/:room/stop", liveAuth, (req, res) => {
  if (!isLiveConfigured || !isWhipTokenSecretValid) {
    res.status(503).json({ error: "live-not-configured" });
    return;
  }

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

  ioServer.emit("live_rooms_changed", {
    room: room,
    isLive: false,
    publisherName: null,
    audioOnly: false, // ★ 配信終了時は false にしておく
  });

  return res.json({ ok: true });
});

const accountRepo = AccountRepository.getInstance();

app.get("/internal/live/whip-auth", (req, res) => {
  if (!requireInternalSecret(req, res)) return;

  const originalUri = req.header("X-Original-URI") ?? "";

  let url: URL;
  try {
    url = new URL(originalUri, "https://dummy");
  } catch (e) {
    res.setHeader("X-Auth-Reason", "malformed-original-uri");
    return res.status(403).end();
  }

  const stream = url.searchParams.get("stream");
  const token = url.searchParams.get("auth") ?? url.searchParams.get("token");
  const result = checkWhipToken(stream, token);

  if (!result.ok) {
    res.setHeader("X-Auth-Reason", result.reason);
    return res.status(403).end();
  }

  const changed = liveStateRepo.markLive(result.roomId);

  if (changed) {
    const publisher = accountRepo.fetchUser(result.publisherId, result.roomId);

    ioServer.to(result.roomId).emit("live_status_change", {
      room: result.roomId,
      isLive: true,
      publisherId: result.publisherId,
      publisherName: publisher?.name ?? null,
      audioOnly: liveStateRepo.get(result.roomId).audioOnly,
    });

    ioServer.emit("live_rooms_changed", {
      room: result.roomId,
      isLive: true,
      publisherName: publisher?.name ?? null,
      audioOnly: liveStateRepo.get(result.roomId).audioOnly,
    });
  }

  return res.status(200).end();
});

app.get("/internal/live/whep-auth", (req, res) => {
  if (!requireInternalSecret(req, res)) return;

  const originalUri = req.header("X-Original-URI") ?? "";

  let url: URL;
  try {
    url = new URL(originalUri, "https://dummy");
  } catch (e) {
    res.setHeader("X-Auth-Reason", "malformed-original-uri");
    return res.status(403).end();
  }

  const stream = url.searchParams.get("stream");

  const token = url.searchParams.get("auth") ?? url.searchParams.get("token");

  const result = checkWhepToken(stream, token);

  if (!result.ok) {
    res.setHeader("X-Auth-Reason", result.reason);
    return res.status(403).end();
  }

  return res.status(200).end();
});

app.get("/api/live/rooms", liveAuthAnyRoom, (req, res) => {
  const account = (req as any).account as Account | undefined;
  if (!account) {
    return res.status(401).json({ error: "unauthorized" });
  }

  let liveEntries: { roomId: string; state: any }[];
  try {
    liveEntries = liveStateRepo.listLiveEntries();
  } catch (e) {
    logger.error("listLiveEntries failed", e);
    return res.status(500).json({ error: "internal" });
  }

  const result = liveEntries.map(({ roomId, state }) => {
    const isLive = state.phase === "live"; // ★ ここ重要（starting を live 扱いしない）

    const publisher =
      isLive && state.publisherId
        ? accountRepo.fetchUser(state.publisherId, roomId)
        : null;

    return {
      room: roomId, // ★ roomName → room
      isLive, // ★ phase で判定
      publisherName: publisher?.name ?? null,
      audioOnly: isLive ? !!state.audioOnly : false,
    };
  });

  return res.status(200).json(result);
});

setInterval(() => {
  const clearedRooms = liveStateRepo.sweepExpiredStarting(90_000);
  for (const roomId of clearedRooms) {
    ioServer.to(roomId).emit("live_status_change", {
      room: roomId,
      isLive: false,
      publisherId: null,
      publisherName: null,
      audioOnly: false,
    });
    ioServer.emit("live_rooms_changed", {
      room: roomId,
      isLive: false,
      publisherName: null,
      audioOnly: false,
    });
  }
}, 10_000);

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
