import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { parseLanguage } from '../../common/language';
import { ContentService } from './content.service';

/** Read-only question-bank browsing endpoints; every route takes an optional `lang` (`en` default). */
@ApiTags('Content')
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /** List reading items in the bank. */
  @Get('reading')
  @ApiOperation({ summary: 'List reading items' })
  reading(
    @Query('lang') lang?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<unknown> {
    const language = parseLanguage(lang);
    return this.content.reading(language, limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  }

  /** List listening items in the bank. */
  @Get('listening')
  @ApiOperation({ summary: 'List listening items' })
  listening(
    @Query('lang') lang?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<unknown> {
    const language = parseLanguage(lang);
    return this.content.listening(language, limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  }

  /** List writing tasks in the bank. */
  @Get('writing')
  @ApiOperation({ summary: 'List writing tasks' })
  writing(
    @Query('lang') lang?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<unknown> {
    const language = parseLanguage(lang);
    return this.content.writing(language, limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  }
}
