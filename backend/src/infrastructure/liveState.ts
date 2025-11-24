export type LiveRoomState = {
  publisherId: string | null;
  publisherIhash: string | null;
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
      this.state[room] = { publisherId: null, publisherIhash: null };
    }
    return this.state[room];
  }

  set(
    room: string,
    publisherId: string | null,
    publisherIhash: string | null
  ): void {
    this.state[room] = { publisherId, publisherIhash };
  }

  clear(room: string): void {
    this.state[room] = { publisherId: null, publisherIhash: null };
  }
}
