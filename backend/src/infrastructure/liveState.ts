export type LiveRoomState = {
  publisherId: string | null;
  audioOnly: boolean;
  streamKey: string | null;
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
      };
    }
    return this.state[room];
  }

  set(
    room: string,
    publisherId: string,
    audioOnly: boolean,
    streamKey: string
  ): void {
    this.state[room] = { publisherId, audioOnly, streamKey };
  }

  clear(room: string): void {
    this.state[room] = {
      publisherId: null,
      audioOnly: false,
      streamKey: null,
    };
  }

  findByStreamKey(
    streamKey: string
  ): { roomId: string; state: LiveRoomState } | null {
    for (const [roomId, state] of Object.entries(this.state)) {
      if (state.streamKey === streamKey) {
        return { roomId, state };
      }
    }
    return null;
  }
}
