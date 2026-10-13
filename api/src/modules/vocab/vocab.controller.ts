import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { VocabService } from './vocab.service';
import { VocabReviewSchema, VocabReviewDto } from './dto/vocab.dto';

/** Vocabulary browser, sections, and flashcard review endpoints. */
@ApiTags('Vocab')
@Controller('vocab')
export class VocabController {
  constructor(private readonly vocab: VocabService) {}

  /** List/search vocab entries. */
  @Get()
  @ApiOperation({ summary: 'List or search vocab entries' })
  list(
    @Query('part') part?: string,
    @Query('section') section?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<unknown> {
    return this.vocab.list({
      part,
      section,
      q,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /** List the distinct vocab sections with counts. */
  @Get('sections')
  @ApiOperation({ summary: 'List vocab sections' })
  sections(): Promise<unknown> {
    return this.vocab.sections();
  }

  /** Fetch a set of flashcards (due items first). */
  @Get('flashcards')
  @ApiOperation({ summary: 'Get flashcards to drill' })
  flashcards(@Query('limit') limit?: string): Promise<unknown> {
    return this.vocab.flashcards(limit ? Number(limit) : undefined);
  }

  /** Record a flashcard review outcome. */
  @Post('review')
  @ApiOperation({ summary: 'Record a flashcard outcome' })
  review(@Body({ schema: VocabReviewSchema }) dto: VocabReviewDto): Promise<{ ok: true }> {
    return this.vocab.review(dto);
  }
}
