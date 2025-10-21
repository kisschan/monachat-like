import { createTrip } from "2ch-trip";

export default function tripcode(key: string): string {
  return createTrip("#" + String(key)).slice(2);
}
