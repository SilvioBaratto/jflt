import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  controllers: [ContentController],
  providers: [ContentService],
})
/** Read-only question-bank browsing (reading/listening/writing listings). */
export class ContentModule {}
