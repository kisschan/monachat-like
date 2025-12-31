export type RoomsLiveInfoStatePayload = {
  room: string;
  isLive: boolean;
  publisherName: string | null;
};

export class RoomsLiveInfo {
  private static instance: RoomsLiveInfo;
  private state: Record<string, RoomsLiveInfoStatePayload> = {};

  static getInstance(): RoomsLiveInfo {
    if (!RoomsLiveInfo.instance) {
      RoomsLiveInfo.instance = new RoomsLiveInfo();
    }
    return RoomsLiveInfo.instance;
  }

  private key(room: string): string {
    return room.trim();
  }

  get(room: string): RoomsLiveInfoStatePayload | null {
    return this.state[this.key(room)] || null;
  }

  /**
   * 「誰が配信しているか」用の最小API（生データ）
   * - isLive=true なら publisherName をそのまま返す（整形しない）
   * - それ以外は null
   */
  getLivePublisherName(room: string): string | null {
    const v = this.get(room);
    if (!v) return null;
    if (!v.isLive) return null;
    return v.publisherName;
  }

  set(payload: RoomsLiveInfoStatePayload): void {
    this.state[this.key(payload.room)] = payload;
  }

  clear(room: string): void {
    delete this.state[this.key(room)];
  }

  clearAll(): void {
    this.state = {};
  }

  getAll(): RoomsLiveInfoStatePayload[] {
    return Object.values(this.state);
  }
}
