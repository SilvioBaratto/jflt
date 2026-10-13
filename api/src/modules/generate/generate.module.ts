import { Module } from '@nestjs/common';
import { GenerateController } from './generate.controller';
import { GenerateService } from './generate.service';
import { TtsService } from './tts.service';
import { ClaudeModule } from '../../claude/claude.module';

@Module({
  imports: [ClaudeModule],
  controllers: [GenerateController],
  providers: [GenerateService, TtsService],
})
/** On-demand generation of fresh reading/listening/writing items (with TTS for listening). */
export class GenerateModule {}
