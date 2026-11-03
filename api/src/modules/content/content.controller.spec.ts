import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

const mockContent = {
  reading: jest.fn(),
  listening: jest.fn(),
  writing: jest.fn(),
};

describe('ContentController', () => {
  let controller: ContentController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [{ provide: ContentService, useValue: mockContent }],
    }).compile();
    controller = module.get(ContentController);
  });

  describe.each(['reading', 'listening', 'writing'] as const)('%s()', (method) => {
    it('when lang is absent, lists English content', async () => {
      await controller[method](undefined);

      expect(mockContent[method]).toHaveBeenCalledWith('en', undefined, undefined);
    });

    it('when lang is es, lists Spanish content and forwards the paging', async () => {
      await controller[method]('es', '25', '5');

      expect(mockContent[method]).toHaveBeenCalledWith('es', 25, 5);
    });

    it.each(['', 'ES', 'fr'])('when lang is %j, rejects with 400 and does not query', (lang) => {
      expect(() => controller[method](lang)).toThrow(BadRequestException);
      expect(mockContent[method]).not.toHaveBeenCalled();
    });
  });
});
