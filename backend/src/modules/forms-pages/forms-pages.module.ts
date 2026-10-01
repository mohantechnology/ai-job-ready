import { Module } from "@nestjs/common";
import { FormsPagesController } from "./forms-pages.controller";

@Module({
  controllers: [FormsPagesController],
})
export class FormsPagesModule {}
