import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProgressService } from './progress.service';

/** Dashboard/progress endpoints. */
@ApiTags('Progress')
@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /** Return the learner dashboard (weak areas, due reviews, recent results, bank sizes). */
  @Get()
  @ApiOperation({ summary: 'Learner dashboard' })
  dashboard(): Promise<unknown> {
    return this.progress.dashboard();
  }
}
