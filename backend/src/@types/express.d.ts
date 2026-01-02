import type { Account } from "../entity/account";

declare module "express-serve-static-core" {
  interface Request {
    account?: Account;
  }
}
