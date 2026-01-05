import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import type http from "http";
import { AccountRepository } from "./infrastructure/accountRepository";
import { LiveStateRepository } from "./infrastructure/liveState";
import { IDGeneratable } from "./domain/idGenerator";
import { Avatar } from "./domain/avatar";
import { Name } from "./domain/name";
import { CharType } from "./domain/charType";
import { Color } from "./domain/color";
import { WhiteTrip } from "./domain/trip";
import { IP } from "./domain/ip";
import { HashTripper } from "./domain/tripper";
import type { Application } from "express";

const accountRepo = AccountRepository.getInstance();
const liveStateRepo = LiveStateRepository.getInstance();

type TestAccount = {
  id: string;
  token: string;
  ihash: string;
};

class FixedIdGenerator implements IDGeneratable {
  private values: string[];

  constructor(...values: string[]) {
    this.values = values;
  }

  generate(): string {
    return this.values.shift() ?? "unknown";
  }
}

async function startServer(
  serverInstance: http.Server
): Promise<{ baseUrl: string; listener: http.Server }> {
  return new Promise((resolve) => {
    const listener = serverInstance.listen(0, () => {
      const address = listener.address();
      if (address && typeof address !== "string") {
        resolve({ baseUrl: `http://127.0.0.1:${address.port}`, listener });
      }
    });
  });
}

function createAccount({
  id,
  token,
  room,
  name,
  ip,
}: {
  id: string;
  token: string;
  room: string;
  name: string;
  ip: string;
}): TestAccount {
  const generator = new FixedIdGenerator(id, token);
  const account = accountRepo.create("socket", generator);
  const avatar = new Avatar({
    name: new Name(name),
    charType: new CharType("mona"),
    charColor: Color.white(),
    whiteTrip: new WhiteTrip(new IP(ip), new HashTripper("seed")),
  });

  accountRepo.updateCharacter(
    account.id,
    account.character.copy().updateAvatar(avatar).moveRoom(room)
  );

  return {
    id: account.id,
    token: account.token,
    ihash: avatar.whiteTrip?.value ?? "",
  };
}

describe("live endpoints visibility", () => {
  let baseUrl: string;
  let listener: http.Server;
  let app: Application;
  let server: http.Server;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.FRONTEND_HOST = "http://localhost";
    process.env.WHIP_TOKEN_SECRET = "a".repeat(32);
    process.env.SRS_WHIP_BASE = "https://example.com";

    const mod = await import("./index");
    app = mod.app;
    server = mod.server;

    const started = await startServer(server);
    baseUrl = started.baseUrl;
    listener = started.listener;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  });

  beforeEach(() => {
    accountRepo.deleteAll();
    liveStateRepo.clearAll();
  });

  const room = "/live";

  it("hides blocked publisher from /api/live/rooms", async () => {
    const publisher = createAccount({
      id: "publisher",
      token: "publisher-token",
      room,
      name: "pub",
      ip: "1.1.1.1",
    });
    const viewer = createAccount({
      id: "viewer",
      token: "viewer-token",
      room,
      name: "view",
      ip: "2.2.2.2",
    });

    liveStateRepo.setStarting(room, publisher.id, false, "stream-key");
    liveStateRepo.markLive(room);

    accountRepo.updateIgnore(publisher.id, viewer.ihash, true);

    const res = await fetch(`${baseUrl}/api/live/rooms`, {
      headers: { "x-monachat-token": viewer.token },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it("returns 404 webrtc-config when viewer is blocked", async () => {
    const publisher = createAccount({
      id: "publisher",
      token: "publisher-token",
      room,
      name: "pub",
      ip: "1.1.1.1",
    });
    const viewer = createAccount({
      id: "viewer",
      token: "viewer-token",
      room,
      name: "view",
      ip: "2.2.2.2",
    });

    liveStateRepo.setStarting(room, publisher.id, false, "stream-key");
    liveStateRepo.markLive(room);
    accountRepo.updateIgnore(publisher.id, viewer.ihash, true);

    const res = await fetch(
      `${baseUrl}/api/live/${encodeURIComponent(room)}/webrtc-config`,
      {
        headers: { "x-monachat-token": viewer.token },
      }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 404 status when viewer is blocked", async () => {
    const publisher = createAccount({
      id: "publisher",
      token: "publisher-token",
      room,
      name: "pub",
      ip: "1.1.1.1",
    });
    const viewer = createAccount({
      id: "viewer",
      token: "viewer-token",
      room,
      name: "view",
      ip: "2.2.2.2",
    });

    liveStateRepo.setStarting(room, publisher.id, false, "stream-key");
    liveStateRepo.markLive(room);
    accountRepo.updateIgnore(publisher.id, viewer.ihash, true);

    const res = await fetch(
      `${baseUrl}/api/live/${encodeURIComponent(room)}/status`,
      {
        headers: { "x-monachat-token": viewer.token },
      }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("returns live status when viewer is allowed", async () => {
    const publisher = createAccount({
      id: "publisher",
      token: "publisher-token",
      room,
      name: "pub",
      ip: "1.1.1.1",
    });
    const viewer = createAccount({
      id: "viewer",
      token: "viewer-token",
      room,
      name: "view",
      ip: "2.2.2.2",
    });

    liveStateRepo.setStarting(room, publisher.id, false, "stream-key");
    liveStateRepo.markLive(room);

    const res = await fetch(
      `${baseUrl}/api/live/${encodeURIComponent(room)}/status`,
      {
        headers: { "x-monachat-token": viewer.token },
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isLive).toBe(true);
    expect(body.publisherId).toBe(publisher.id);
    expect(body.publisherName).toBe("pub");
    expect(body.audioOnly).toBe(false);
  });

  it("allows viewers when there is no block", async () => {
    const publisher = createAccount({
      id: "publisher",
      token: "publisher-token",
      room,
      name: "pub",
      ip: "1.1.1.1",
    });
    const viewer = createAccount({
      id: "viewer",
      token: "viewer-token",
      room,
      name: "view",
      ip: "2.2.2.2",
    });

    liveStateRepo.setStarting(room, publisher.id, false, "stream-key");
    liveStateRepo.markLive(room);

    const res = await fetch(
      `${baseUrl}/api/live/${encodeURIComponent(room)}/webrtc-config`,
      {
        headers: { "x-monachat-token": viewer.token },
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("viewer");
    expect(typeof body.whepUrl).toBe("string");
    expect(body.whepUrl.length).toBeGreaterThan(0);
  });
});
