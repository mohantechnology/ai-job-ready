import { env } from "../../config/env";

export const AccountRole = {
  User: "user",
  Admin: "admin",
} as const;

export type AccountRole = (typeof AccountRole)[keyof typeof AccountRole];

// Admin access is an account role, separate from interview seniority
// (junior/mid/senior). Today the allow-list is ADMIN_EMAILS. When a
// users.role column is added, resolve it here and every admin route
// picks it up through RolesGuard.
export function resolveAccountRole(email?: string | null): AccountRole {
  if (email && env.adminEmails.includes(email.toLowerCase())) {
    return AccountRole.Admin;
  }
  return AccountRole.User;
}
