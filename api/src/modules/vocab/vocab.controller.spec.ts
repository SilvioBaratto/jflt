import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VocabController } from './vocab.controller';
import { VocabService } from './vocab.service';

const mockVocab = {
  list: jest.fn(),
  sections: jest.fn(),
  flashcards: jest.fn(),
  review: jest.fn(),
};

describe('VocabController', () => {
  let controller: VocabController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VocabController],
      providers: [{ provide: VocabService, useValue: mockVocab }],
    }).compile();
    controller = module.get(VocabController);
  });

  describe('list()', () => {
    it('when lang is absent, searches English entries', async () => {
      await controller.list(undefined);

      expect(mockVocab.list).toHaveBeenCalledWith({
        language: 'en',
        part: undefined,
        section: undefined,
        q: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    it('when lang is es, forwards it with the filters and paging', async () => {
      await controller.list('es', 'A', 'Air', 'ali', '10', '30');

      expect(mockVocab.list).toHaveBeenCalledWith({
        language: 'es',
        part: 'A',
        section: 'Air',
        q: 'ali',
        limit: 10,
        offset: 30,
      });
    });

    it.each(['', 'ES', 'fr'])('when lang is %j, rejects with 400 and does not query', (lang) => {
      expect(() => controller.list(lang)).toThrow(BadRequestException);
      expect(mockVocab.list).not.toHaveBeenCalled();
    });
  });

  describe('sections()', () => {
    it('when lang is absent, groups English sections', async () => {
      await controller.sections(undefined);

      expect(mockVocab.sections).toHaveBeenCalledWith('en');
    });

    it('when lang is es, groups Spanish sections', async () => {
      await controller.sections('es');

      expect(mockVocab.sections).toHaveBeenCalledWith('es');
    });

    it.each(['', 'ES', 'fr'])('when lang is %j, rejects with 400 and does not query', (lang) => {
      expect(() => controller.sections(lang)).toThrow(BadRequestException);
      expect(mockVocab.sections).not.toHaveBeenCalled();
    });
  });

  describe('flashcards()', () => {
    it('when lang is absent, drills English cards with the default limit', async () => {
      await controller.flashcards(undefined);

      expect(mockVocab.flashcards).toHaveBeenCalledWith('en', undefined);
    });

    it('when lang is es, drills Spanish cards with the requested limit', async () => {
      await controller.flashcards('es', '5');

      expect(mockVocab.flashcards).toHaveBeenCalledWith('es', 5);
    });

    it.each(['', 'ES', 'fr'])('when lang is %j, rejects with 400 and does not query', (lang) => {
      expect(() => controller.flashcards(lang)).toThrow(BadRequestException);
      expect(mockVocab.flashcards).not.toHaveBeenCalled();
    });
  });
});
