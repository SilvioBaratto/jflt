import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ExamService } from '../../services/exam';
import { Session, SessionResult, SubmitAnswerBody } from '../../models/exam';
import { SessionComponent } from './session';

const RESULT: SessionResult = {
  reading: { correct: 1, answered: 2, total: 2, pct: 50, estimatedLevel: '<3' },
  listening: { correct: 1, answered: 1, total: 1, pct: 100, estimatedLevel: '3' },
  writing: { avgScore: 3, estimatedLevel: '3', count: 1 },
  profile: { listening: '3', speaking: null, reading: '<3', writing: '3' },
  slp: '3/–/<3/3',
};

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    mode: 'exam',
    skill: null,
    status: 'in_progress',
    startedAt: '2026-10-13T00:00:00Z',
    answers: [],
    items: {
      reading: [
        { id: 'r1', level: 3, topic: 't', passage: 'p', question: 'q?', options: [] },
        { id: 'r2', level: 4, topic: 't', passage: 'p', question: 'q?', options: [] },
      ],
      listening: [
        {
          id: 'l1',
          level: 3,
          topic: 't',
          conversationType: 'interview',
          lines: [],
          questions: [{ question: 'q?', options: { A: 'a', B: 'b', C: 'c', D: 'd' } }],
        },
      ],
      writing: [
        {
          id: 'w1',
          taskType: 'essay',
          stanagLevel: 3,
          title: 'Essay',
          instructions: 'Write.',
          wordCountMin: 250,
          wordCountMax: 500,
          rubric: [],
          options: [{ key: 'main', label: '', prompt: '' }],
        },
      ],
    },
    ...overrides,
  };
}

describe('SessionComponent', () => {
  let calls: string[];
  let api: {
    get: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
  };

  async function open(session: Session): Promise<SessionComponent> {
    api.get.mockReturnValue(of(session));
    const harness = await RouterTestingHarness.create();
    return harness.navigateByUrl('/session/s1', SessionComponent);
  }

  beforeEach(() => {
    calls = [];
    api = {
      get: vi.fn(),
      submit: vi.fn((_id: string, body: SubmitAnswerBody): Observable<unknown> => {
        calls.push(`submit:${body.itemType}:${body.itemId}`);
        return body.itemType === 'writing'
          ? of({ itemType: 'writing', grade: { overallScore: 3 }, modelAnswer: null })
          : of({ itemType: body.itemType, correct: true, correctLabel: 'A' });
      }),
      complete: vi.fn(() => {
        calls.push('complete');
        return of(RESULT);
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'session/:id', component: SessionComponent }]),
        { provide: ExamService, useValue: api },
      ],
    });
  });

  it('when finishing, submits unchecked choices and ungraded writing before completing', async () => {
    const c = await open(makeSession());
    c.pickReading('r1', 'B');
    c.pickListening('l1', 0, 'C');
    c.setWritingText('w1', 'My essay text.');

    c.finish();

    expect(calls.slice(0, 3).sort()).toEqual([
      'submit:listening:l1',
      'submit:reading:r1',
      'submit:writing:w1',
    ]);
    expect(calls[3]).toBe('complete');
    expect(c.finalResult()).toEqual(RESULT);
    expect(c.writingResult()['w1']).toBeTruthy();
  });

  it('when finishing, does not resubmit an item that was already checked or never answered', async () => {
    const c = await open(makeSession());
    c.pickReading('r1', 'B');
    c.submitReading(c.session()!.items.reading[0]);
    calls = [];

    c.finish();

    expect(calls).toEqual(['complete']);
  });

  it('when a writing response is still grading, finishing is a no-op', async () => {
    const c = await open(makeSession());
    const pending = new Subject<unknown>();
    api.submit.mockReturnValueOnce(pending);
    c.setWritingText('w1', 'Draft.');
    c.submitWriting(c.session()!.items.writing[0]);
    expect(c.busy()).toBe(true);

    c.finish();

    expect(api.complete).not.toHaveBeenCalled();
    pending.next({ itemType: 'writing', grade: { overallScore: 2 }, modelAnswer: null });
    pending.complete();
    expect(c.busy()).toBe(false);
  });

  it('when a pending submission fails, the session is not completed and the failure is shown', async () => {
    const c = await open(makeSession());
    api.submit.mockReturnValueOnce(throwError(() => new Error('down')));
    c.pickReading('r1', 'B');

    c.finish();

    expect(api.complete).not.toHaveBeenCalled();
    expect(c.finishing()).toBe(false);
    expect(c.finishError()).toMatch(/could not be submitted/);
  });

  it('when a Check is still in flight, finishing is a no-op and the item is not resubmitted', async () => {
    const c = await open(makeSession());
    const pending = new Subject<unknown>();
    api.submit.mockReturnValueOnce(pending);
    c.pickReading('r1', 'B');
    c.submitReading(c.session()!.items.reading[0]);
    expect(c.busy()).toBe(true);

    c.finish();

    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(api.complete).not.toHaveBeenCalled();
    pending.next({ itemType: 'reading', correct: true, correctLabel: 'B' });
    pending.complete();
    expect(c.busy()).toBe(false);
  });

  it('when one pending submission fails, the others still complete and keep their results', async () => {
    const c = await open(makeSession());
    api.submit.mockImplementation((_id: string, body: SubmitAnswerBody) =>
      body.itemType === 'reading'
        ? throwError(() => new Error('down'))
        : of({ itemType: 'writing', grade: { overallScore: 3 }, modelAnswer: null }),
    );
    c.pickReading('r1', 'B');
    c.setWritingText('w1', 'My essay text.');

    c.finish();

    expect(c.writingResult()['w1']).toBeTruthy();
    expect(api.complete).not.toHaveBeenCalled();
    expect(c.finishError()).toMatch(/could not be submitted/);
  });

  it('when completing fails after every answer was submitted, says the session was not finished', async () => {
    const c = await open(makeSession());
    api.complete.mockReturnValueOnce(throwError(() => new Error('down')));

    c.finish();

    expect(c.finishError()).toMatch(/could not be finished/);
    expect(c.finishing()).toBe(false);
  });

  it('when reopening a completed session, shows its stored result', async () => {
    const c = await open(makeSession({ status: 'completed', result: RESULT }));
    expect(c.finalResult()).toEqual(RESULT);
  });

  it('renders a below-floor level as "below N"', async () => {
    const c = await open(makeSession());
    expect(c.levelLabel('<3')).toBe('below 3');
    expect(c.levelLabel('3+')).toBe('3+');
    expect(c.levelLabel(2)).toBe('2');
  });
});
