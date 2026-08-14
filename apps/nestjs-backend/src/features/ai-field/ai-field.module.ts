import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FieldModule } from '../field/field.module';
import { RecordModule } from '../record/record.module';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { AiFieldController } from './ai-field.controller';
import { AiFieldService } from './ai-field.service';

@Module({
  imports: [ConfigModule, FieldModule, RecordModule, RecordOpenApiModule],
  controllers: [AiFieldController],
  providers: [AiFieldService],
  exports: [AiFieldService],
})
export class AiFieldModule {}
