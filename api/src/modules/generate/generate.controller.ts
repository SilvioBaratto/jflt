import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GenerateService } from './generate.service';
import {
  GenReadingSchema,
  GenWritingSchema,
  GenListeningSchema,
  GenReadingDto,
  GenWritingDto,
  GenListeningDto,
} from './dto/generate.dto';

/**
 * On-demand content generation endpoints (grow the bank with fresh items).
 *
 * Each body carries the content `language` (`en` default) the item is written and stored in.
 */
@ApiTags('Generate')
@Controller('generate')
export class GenerateController {
  constructor(private readonly gen: GenerateService) {}

  /** Generate and store a fresh reading item. */
  @Post('reading')
  @ApiOperation({ summary: 'Generate a reading item' })
  reading(@Body({ schema: GenReadingSchema }) dto: GenReadingDto): Promise<unknown> {
    return this.gen.reading(dto.level, dto.topic, dto.language);
  }

  /** Generate and store a fresh writing task. */
  @Post('writing')
  @ApiOperation({ summary: 'Generate a writing task' })
  writing(@Body({ schema: GenWritingSchema }) dto: GenWritingDto): Promise<unknown> {
    return this.gen.writing(dto.taskType, dto.language);
  }

  /** Generate and store a fresh listening conversation with audio. */
  @Post('listening')
  @ApiOperation({ summary: 'Generate a listening item' })
  listening(@Body({ schema: GenListeningSchema }) dto: GenListeningDto): Promise<unknown> {
    return this.gen.listening(dto.topic, dto.genre, dto.speakers ?? 2, dto.language);
  }
}
