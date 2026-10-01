import { Controller, Get } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AccountRole } from "../../common/auth/account-role";
import type { AuthUser } from "../../common/auth/auth-user";

// Future admin routes belong on this controller. The class-level role
// check applies to every handler added here.
@Controller("api/admin")
@Roles(AccountRole.Admin)
export class AdminController {
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return {
      user: {
        id: user.id,
        email: user.email ?? null,
        role: user.role,
      },
    };
  }
}
