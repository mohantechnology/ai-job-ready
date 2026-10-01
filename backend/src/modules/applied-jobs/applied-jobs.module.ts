import { Module } from "@nestjs/common";
import { AppliedJobsController } from "./applied-jobs.controller";

@Module({
  controllers: [AppliedJobsController],
})
export class AppliedJobsModule {}