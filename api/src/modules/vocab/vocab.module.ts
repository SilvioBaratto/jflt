import { Module } from '@nestjs/common';
import { VocabController } from './vocab.controller';
import { VocabService } from './vocab.service';

@Module({
  controllers: [VocabController],
  providers: [VocabService],
})
/** Vocabulary study: browsing/search and spaced-repetition flashcards. */
export class VocabModule {}
