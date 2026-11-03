import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { parseLanguage } from '../../common/language';
import { ProgressService } from './progress.service';

/** Dashboard/progress endpoints. */
@ApiTags('Progress')
@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /** Return the learner dashboard (weak areas, due reviews, recent results, bank sizes) for one language. */
  @Get()
  @ApiOperation({ summary: 'Learner dashboard' })
  dashboard(@Query('lang') lang?: string): Promise<unknown> {
    return this.progress.dashboard(parseLanguage(lang));
  }
}
