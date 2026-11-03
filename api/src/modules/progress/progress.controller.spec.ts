import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

const mockProgress = { dashboard: jest.fn() };

describe('ProgressController', () => {
  let controller: ProgressController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProgressController],
      providers: [{ provide: ProgressService, useValue: mockProgress }],
    }).compile();
    controller = module.get(ProgressController);
  });

  it('when lang is absent, builds the English dashboard', async () => {
    await controller.dashboard(undefined);

    expect(mockProgress.dashboard).toHaveBeenCalledWith('en');
  });

  it('when lang is es, builds the Spanish dashboard', async () => {
    await controller.dashboard('es');

    expect(mockProgress.dashboard).toHaveBeenCalledWith('es');
  });

  it.each(['', 'ES', 'fr'])('when lang is %j, rejects with 400 and does not query', (lang) => {
    expect(() => controller.dashboard(lang)).toThrow(BadRequestException);
    expect(mockProgress.dashboard).not.toHaveBeenCalled();
  });
});
