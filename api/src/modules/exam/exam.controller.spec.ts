import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';

const mockExam = { listSessions: jest.fn() };

describe('ExamController', () => {
  let controller: ExamController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExamController],
      providers: [{ provide: ExamService, useValue: mockExam }],
    }).compile();
    controller = module.get(ExamController);
  });

  describe('list()', () => {
    it('when lang is absent, lists English sessions', async () => {
      await controller.list(undefined);

      expect(mockExam.listSessions).toHaveBeenCalledWith('en');
    });

    it('when lang is es, lists Spanish sessions', async () => {
      await controller.list('es');

      expect(mockExam.listSessions).toHaveBeenCalledWith('es');
    });

    it.each(['', 'ES', 'fr'])('when lang is %j, rejects with 400 and does not query', (lang) => {
      expect(() => controller.list(lang)).toThrow(BadRequestException);
      expect(mockExam.listSessions).not.toHaveBeenCalled();
    });
  });
});
