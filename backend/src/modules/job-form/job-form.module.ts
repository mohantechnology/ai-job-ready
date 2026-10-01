import { Module } from "@nestjs/common";
import { JobFormController } from "./job-form.controller";

@Module({
  controllers: [JobFormController],
})
export class JobFormModule {}
