export type LiveStatusChangePayload = {
  room: string;
  isLive: boolean;
  publisherId: string | null;
  publisherName: string | null;
};
