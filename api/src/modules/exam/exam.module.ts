import { Module } from '@nestjs/common';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';
import { ClaudeModule } from '../../claude/claude.module';

@Module({
  imports: [ClaudeModule],
  controllers: [ExamController],
  providers: [ExamService],
})
/** Study/exam engine: session assembly, scoring, adaptive selection, and review scheduling. */
export class ExamModule {}
