import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { HealthController } from "./modules/health/health.controller";
import { AuthModule } from "./modules/auth/auth.module";
import { InterviewsModule } from "./modules/interviews/interviews.module";
import { ProgressModule } from "./modules/progress/progress.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { WebhookModule } from "./modules/webhook/webhook.module";
import { AppliedJobsModule } from "./modules/applied-jobs/applied-jobs.module";
import { ProfileModule } from "./modules/profile/profile.module";
import { JobFormModule } from "./modules/job-form/job-form.module";
import { FormsPagesModule } from "./modules/forms-pages/forms-pages.module";
import { AdminModule } from "./modules/admin/admin.module";

@Module({
  imports: [
    AuthModule,
    InterviewsModule,
    ProgressModule,
    DashboardModule,
    RealtimeModule,
    WebhookModule,
    AppliedJobsModule,
    ProfileModule,
    JobFormModule,
    FormsPagesModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
