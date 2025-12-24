import { Request, Response, NextFunction } from "express";
import { AccountRepository } from "../infrastructure/accountRepository";
import { Account } from "../entity/account";

declare module "express-serve-static-core" {
  interface Request {
    account?: Account;
  }
}

const accountRepo = AccountRepository.getInstance();

function extractAccountToken(req: Request): string | undefined {
  const t = req.header("x-monachat-token");
  if (typeof t === "string" && t.length > 0) return t;
  return undefined;
}

export function liveAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = extractAccountToken(req);
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const account = accountRepo.getAccountByToken(token);
  if (!account) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const requestedRoom = req.params.room;
  const currentRoom = account.character?.currentRoom;
  const alive = account.alive;

  if (!currentRoom) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  if (!alive) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  if (!requestedRoom || currentRoom !== requestedRoom) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  req.account = account;
  next();
}
