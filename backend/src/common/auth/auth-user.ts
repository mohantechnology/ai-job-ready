import type { AccountRole } from "./account-role";

export type AuthUser = {
  id: string;
  email?: string;
  role: AccountRole;
};
