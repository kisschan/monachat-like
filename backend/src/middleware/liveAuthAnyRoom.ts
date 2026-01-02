import { Request, Response, NextFunction } from "express";
import { AccountRepository } from "../infrastructure/accountRepository";

function extractAccountToken(req: Request): string | undefined {
  const t = req.header("x-monachat-token");
  if (typeof t === "string" && t.length > 0) return t;
  return undefined;
}

const accountRepo = AccountRepository.getInstance();

export function liveAuthAnyRoom(
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

  const currentRoom = account.character?.currentRoom;
  const alive = account.alive;

  // 現在のポリシーを踏襲（＝部屋に属していて alive であること）
  if (!currentRoom) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  if (!alive) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  req.account = account;
  next();
}
