import * as crypto from "crypto";

export type LivePhase = "idle" | "starting" | "live";

export type LiveRoomState = {
  publisherId: string | null;
  audioOnly: boolean;
  streamKey: string | null;
  phase: LivePhase;
  startedAtMs: number | null;
  lastHeartbeatMs: number | null; // starting lock時刻/心拍にも流用
};

export type RoomLiveStateInfo = {
  roomName: string;
  publisherName: string | null;
  isLive: boolean;
  audioOnly: boolean;
};

export class LiveStateRepository {
  private static instance: LiveStateRepository;
  private state: Record<string, LiveRoomState> = {};

  static getInstance(): LiveStateRepository {
    if (!LiveStateRepository.instance) {
      LiveStateRepository.instance = new LiveStateRepository();
    }
    return LiveStateRepository.instance;
  }

  get(room: string): LiveRoomState {
    if (!this.state[room]) {
      this.state[room] = {
        publisherId: null,
        audioOnly: false,
        streamKey: null,
        phase: "idle",
        startedAtMs: null,
        lastHeartbeatMs: null,
      };
    }
    return this.state[room];
  }

  setStarting(
    room: string,
    publisherId: string,
    audioOnly: boolean,
    streamKey: string
  ): void {
    const ensuredStreamKey =
      typeof streamKey === "string" && streamKey.length > 0
        ? streamKey
        : crypto.randomBytes(16).toString("hex");

    const now = Date.now();
    this.state[room] = {
      publisherId,
      audioOnly,
      streamKey: ensuredStreamKey,
      phase: "starting",
      startedAtMs: null, // liveに入ったら入れる
      lastHeartbeatMs: now, // startingのロック時刻として使う
    };
  }

  markLive(room: string): boolean {
    const s = this.get(room);
    if (s.phase === "live") return false;
    if (!s.publisherId || !s.streamKey) return false;

    const now = Date.now();
    s.phase = "live";
    s.startedAtMs = now;
    s.lastHeartbeatMs = now;
    return true;
  }

  heartbeat(room: string): void {
    const s = this.get(room);
    if (s.phase === "idle") return;
    s.lastHeartbeatMs = Date.now();
  }

  clear(room: string): void {
    this.state[room] = {
      publisherId: null,
      audioOnly: false,
      streamKey: null,
      phase: "idle",
      startedAtMs: null,
      lastHeartbeatMs: null,
    };
  }

  clearAll(): void {
    this.state = {};
  }

  findByStreamKey(
    streamKey: string
  ): { roomId: string; state: LiveRoomState } | null {
    for (const [roomId, state] of Object.entries(this.state)) {
      if (state.streamKey === streamKey) return { roomId, state };
    }
    return null;
  }

  listLiveEntries(): Array<{ roomId: string; state: LiveRoomState }> {
    return Object.entries(this.state)
      .filter(
        ([, s]) =>
          s.phase === "live" && s.publisherId != null && s.streamKey != null
      )
      .map(([roomId, state]) => ({ roomId, state }));
  }

  clearIfExpiredStarting(room: string, ttlMs: number): boolean {
    const s = this.get(room);
    if (s.phase !== "starting") return false;

    const t = s.lastHeartbeatMs ?? 0;
    if (t === 0) {
      this.clear(room);
      return true;
    }

    if (Date.now() - t > ttlMs) {
      this.clear(room);
      return true;
    }
    return false;
  }

  sweepExpiredStarting(
    ttlMs: number
  ): Array<{ roomId: string; publisherId: string | null }> {
    const now = Date.now();
    const cleared: Array<{ roomId: string; publisherId: string | null }> = [];

    for (const [roomId, s] of Object.entries(this.state)) {
      if (s.phase !== "starting") continue;

      const t = s.lastHeartbeatMs ?? 0;
      if (t === 0 || now - t > ttlMs) {
        const publisherId = s.publisherId ?? null;
        this.clear(roomId);
        cleared.push({ roomId, publisherId });
      }
    }
    return cleared;
  }
}
