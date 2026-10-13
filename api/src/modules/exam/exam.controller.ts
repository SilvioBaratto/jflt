import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ExamService } from './exam.service';
import {
  CreateSessionSchema,
  SubmitAnswerSchema,
  CreateSessionDto,
  SubmitAnswerDto,
} from './dto/exam.dto';

/** Session endpoints: create/list/get sessions, submit answers, and complete a session. */
@ApiTags('Exam')
@Controller('sessions')
export class ExamController {
  constructor(private readonly exam: ExamService) {}

  /** Create a practice set or timed mock exam and return it with items (keys stripped). */
  @Post()
  @ApiOperation({ summary: 'Create a practice set or mock exam' })
  create(@Body({ schema: CreateSessionSchema }) dto: CreateSessionDto): Promise<unknown> {
    return this.exam.createSession(dto);
  }

  /** List past sessions, most recent first. */
  @Get()
  @ApiOperation({ summary: 'List sessions' })
  list(): Promise<unknown> {
    return this.exam.listSessions();
  }

  /** Get one session with its items and submitted answers. */
  @Get(':id')
  @ApiOperation({ summary: 'Get a session' })
  get(@Param('id') id: string): Promise<unknown> {
    return this.exam.getSession(id);
  }

  /** Submit and score one answer within the session. */
  @Post(':id/answers')
  @ApiOperation({ summary: 'Submit an answer' })
  submit(
    @Param('id') id: string,
    @Body({ schema: SubmitAnswerSchema }) dto: SubmitAnswerDto,
  ): Promise<unknown> {
    return this.exam.submitAnswer(id, dto);
  }

  /** Complete the session and return the SLP-style result. */
  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete a session' })
  complete(@Param('id') id: string): Promise<unknown> {
    return this.exam.completeSession(id);
  }
}
