import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ContentService } from './content.service';

/** Read-only question-bank browsing endpoints. */
@ApiTags('Content')
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /** List reading items in the bank. */
  @Get('reading')
  @ApiOperation({ summary: 'List reading items' })
  reading(@Query('limit') limit?: string, @Query('offset') offset?: string): Promise<unknown> {
    return this.content.reading(limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  }

  /** List listening items in the bank. */
  @Get('listening')
  @ApiOperation({ summary: 'List listening items' })
  listening(@Query('limit') limit?: string, @Query('offset') offset?: string): Promise<unknown> {
    return this.content.listening(limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  }

  /** List writing tasks in the bank. */
  @Get('writing')
  @ApiOperation({ summary: 'List writing tasks' })
  writing(@Query('limit') limit?: string, @Query('offset') offset?: string): Promise<unknown> {
    return this.content.writing(limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  }
}
