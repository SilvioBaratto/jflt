import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ExamService } from '../../services/exam';
import { Language, LanguageService } from '../../services/language';
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
    language: 'en',
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

const ES_AUDIO_PATH = '/static/listening/es/listening-01.mp3';

/** A session whose content is in `language`, with a topic on every item so a leak would be visible. */
function makeLanguageSession(language: Language): Session {
  const s = makeSession({ language });
  s.items.reading[0] = {
    id: 'r1',
    level: 3,
    topic: 'Algo',
    passage: 'Un pasaje.',
    question: 'Una pregunta?',
    options: [
      { label: 'A', text: 'primera' },
      { label: 'B', text: 'segunda' },
    ],
  };
  s.items.reading.length = 1;
  s.items.listening[0] = {
    id: 'l1',
    level: 3,
    topic: 'Otro tema',
    conversationType: 'entrevista radiofonica',
    audioPath: ES_AUDIO_PATH,
    lines: [],
    questions: [{ question: 'Otra pregunta?', options: { A: 'a', B: 'b', C: 'c', D: 'd' } }],
  };
  s.items.writing[0].title = 'Ensayo';
  s.items.writing[0].instructions = 'Escribe.';
  s.items.writing[0].options = [
    { key: 'A', label: '', prompt: 'Primera opcion' },
    { key: 'B', label: '', prompt: 'Segunda opcion' },
  ];
  return s;
}

describe('SessionComponent', () => {
  let calls: string[];
  let api: {
    get: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
  };

  let harness: RouterTestingHarness;

  async function open(session: Session): Promise<SessionComponent> {
    api.get.mockReturnValue(of(session));
    harness = await RouterTestingHarness.create();
    return harness.navigateByUrl('/session/s1', SessionComponent);
  }

  function el(): HTMLElement {
    return harness.routeNativeElement as HTMLElement;
  }

  beforeEach(() => {
    localStorage.clear();
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

  afterEach(() => localStorage.clear());

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

  it('labels each radio group with its question and names the audio player', async () => {
    const withAudio = makeSession();
    withAudio.items.listening[0].audioPath = '/a.mp3';
    await open(withAudio);
    harness.detectChanges();

    const groups = el().querySelectorAll('mat-radio-group');
    expect(groups.length).toBe(3);
    for (const g of Array.from(groups)) {
      const id = g.getAttribute('aria-labelledby')!;
      expect(el().querySelector(`[id="${id}"]`)?.textContent).toContain('q?');
    }
    expect(el().querySelector('audio')?.getAttribute('aria-label')).toBe('Audio for conversation 1');
  });

  it('gives the response field a label and hides button spinners from assistive tech', async () => {
    const c = await open(makeSession());
    harness.detectChanges();
    expect(el().querySelector('mat-form-field mat-label')?.textContent).toBe('Your response');
    expect(el().querySelector('mat-form-field mat-hint')?.textContent).toContain('0 words');

    c.setWritingText('w1', 'Draft.');
    api.submit.mockReturnValueOnce(new Subject());
    c.submitWriting(c.session()!.items.writing[0]);
    harness.detectChanges();
    const btn = Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes('Grading'))!;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.querySelector('mat-spinner')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses a button toggle group for prompt options when there are several', async () => {
    const s = makeSession();
    s.items.writing[0].options = [
      { key: 'A', label: '', prompt: 'pa' },
      { key: 'B', label: '', prompt: 'pb' },
    ];
    const c = await open(s);
    harness.detectChanges();
    const group = el().querySelector('mat-button-toggle-group')!;
    expect(group.getAttribute('aria-label')).toBe('Choose a prompt option');
    expect(group.querySelectorAll('mat-button-toggle').length).toBe(2);

    (group.querySelectorAll('mat-button-toggle')[1].querySelector('button') as HTMLElement).click();
    expect(c.writingOption()['w1']).toBe('B');
  });

  it('after a Check result renders, moves focus to the feedback container', async () => {
    const c = await open(makeSession());
    c.pickReading('r1', 'B');
    harness.detectChanges();
    const check = el().querySelector('button') as HTMLButtonElement;
    expect(check.textContent).toContain('Check');
    expect(check.hasAttribute('disabled')).toBe(false);

    c.submitReading(c.session()!.items.reading[0]);
    harness.detectChanges();
    await harness.fixture.whenStable();

    const fb = el().querySelector('[data-fb="reading:r1"]') as HTMLElement;
    expect(fb.getAttribute('tabindex')).toBe('-1');
    expect(fb.getAttribute('role')).toBeNull();
    expect(document.activeElement).toBe(fb);
  });

  it('keeps the Check button focusable while the request is in flight', async () => {
    const c = await open(makeSession());
    c.pickReading('r1', 'B');
    api.submit.mockReturnValueOnce(new Subject());
    c.submitReading(c.session()!.items.reading[0]);
    harness.detectChanges();

    const check = el().querySelector('button') as HTMLButtonElement;
    expect(check.getAttribute('aria-disabled')).toBe('true');
    expect(check.hasAttribute('disabled')).toBe(false);
  });

  it('shows a not-found heading for a 404', async () => {
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    harness = await RouterTestingHarness.create();
    const c = await harness.navigateByUrl('/session/s1', SessionComponent);
    harness.detectChanges();

    expect(c.loadError()).toBe(false);
    expect(el().querySelectorAll('h1').length).toBe(1);
    expect(el().querySelector('h1')?.textContent).toBe('Session not found');
  });

  it('offers a retry for other load failures and recovers on success', async () => {
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    harness = await RouterTestingHarness.create();
    const c = await harness.navigateByUrl('/session/s1', SessionComponent);
    harness.detectChanges();

    expect(c.loadError()).toBe(true);
    expect(el().querySelector('h1')?.textContent).toBe('Could not load the session');

    api.get.mockReturnValue(of(makeSession()));
    (el().querySelector('button') as HTMLButtonElement).click();
    harness.detectChanges();

    expect(c.loadError()).toBe(false);
    expect(c.session()).toBeTruthy();
  });

  it('while a retry is in flight, the error view and its focused button stay in place', async () => {
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    harness = await RouterTestingHarness.create();
    const c = await harness.navigateByUrl('/session/s1', SessionComponent);
    harness.detectChanges();

    const pending = new Subject<Session>();
    api.get.mockReturnValue(pending);
    const button = el().querySelector('button') as HTMLButtonElement;
    button.focus();
    button.click();
    harness.detectChanges();

    expect(c.retrying()).toBe(true);
    expect(el().querySelector('h1')?.textContent).toBe('Could not load the session');
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');

    pending.next(makeSession());
    pending.complete();
    harness.detectChanges();
    await harness.fixture.whenStable();

    expect(c.retrying()).toBe(false);
    expect(document.activeElement?.tagName).toBe('H1');
    expect(document.activeElement?.textContent).toBe('Mock exam');
  });

  it('when a retry finds the session gone, focus moves to the not-found heading', async () => {
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/session/s1', SessionComponent);
    harness.detectChanges();

    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    const button = el().querySelector('button') as HTMLButtonElement;
    button.focus();
    button.click();
    harness.detectChanges();
    await harness.fixture.whenStable();

    expect(document.activeElement?.textContent).toBe('Session not found');
  });

  it('renders the skill filter in sentence case', async () => {
    const c = await open(makeSession());
    expect(c.skillLabel(null)).toBe('All skills');
    expect(c.skillLabel('reading')).toBe('Reading');
  });

  describe('content language', () => {
    beforeEach(() => {
      api.submit.mockImplementation((_id: string, body: SubmitAnswerBody): Observable<unknown> =>
        of(
          body.itemType === 'writing'
            ? {
                itemType: 'writing',
                grade: {
                  overallScore: 3,
                  estimatedLevel: '3',
                  dimensions: [
                    { dimension: 'Precision gramatical', score: 3, comment: 'Pocos errores.' },
                    { dimension: 'Vocabulario', score: 2, comment: 'Repite palabras.' },
                  ],
                  strengths: ['Buena estructura', 'Ideas claras'],
                  improvements: ['Revisar los acentos'],
                },
                modelAnswer: 'Un **modelo** de respuesta.',
              }
            : {
                itemType: body.itemType,
                correct: false,
                correctLabel: 'A',
                keyRationale: 'La opcion A cita el texto.',
                chosenRationale: 'La opcion B no aparece en el texto.',
              },
        ),
      );
    });

    function cards(): Element[] {
      return Array.from(el().querySelectorAll('.item'));
    }

    /** Every content container of the reading, listening and writing cards, by name. */
    function contentNodes(): [string, Element | null][] {
      const [reading, listening, writing] = cards();
      return [
        ['reading passage', reading.querySelector('.passage')],
        ['reading question', reading.querySelector('.question')],
        ['reading options', reading.querySelector('mat-radio-group')],
        ['listening header', listening.querySelector('.meta')],
        ['listening question', listening.querySelector('.question')],
        ['listening options', listening.querySelector('mat-radio-group')],
        ['writing title', writing.querySelector('h3')],
        ['writing instructions', writing.querySelector('.instr')],
        ['writing prompt', writing.querySelector('.prompt')],
        ['writing response', writing.querySelector('textarea')],
      ];
    }

    /** The feedback text a checked or graded answer adds, by name; only the text, never its English label. */
    function feedbackNodes(): [string, Element | null][] {
      const [reading, listening, writing] = cards();
      const [strengths, improvements] = Array.from(writing.querySelectorAll('.grade > p:not(.score) > span'));
      return [
        ['reading key rationale', reading.querySelector('.fb p:not(.muted)')],
        ['reading chosen rationale', reading.querySelector('.fb .muted span')],
        ['listening key rationale', listening.querySelector('.fb p:not(.muted)')],
        ['listening chosen rationale', listening.querySelector('.fb .muted span')],
        ...Array.from(writing.querySelectorAll('.grade li')).map((li, i): [string, Element] => [`grade dimension ${i}`, li]),
        ['strengths', strengths ?? null],
        ['improvements', improvements ?? null],
        ['model answer', writing.querySelector('.model')],
      ];
    }

    function expectLang(nodes: [string, Element | null][], language: Language): void {
      for (const [name, node] of nodes) {
        expect(node, name).not.toBeNull();
        expect(node!.getAttribute('lang'), name).toBe(language);
      }
    }

    async function openWithFeedback(language: Language): Promise<SessionComponent> {
      const c = await open(makeLanguageSession(language));
      const { reading, listening, writing } = c.session()!.items;
      c.pickReading('r1', 'B');
      c.submitReading(reading[0]);
      c.pickListening('l1', 0, 'B');
      c.submitListening(listening[0], 0);
      c.setWritingText('w1', 'Mi ensayo.');
      c.submitWriting(writing[0]);
      harness.detectChanges();
      return c;
    }

    it('shows the level alone in a reading header and the conversation type alone in a listening header', async () => {
      await open(makeLanguageSession('es'));
      harness.detectChanges();

      const [reading, listening] = cards().map((card) => card.querySelector('.meta')!);
      expect(reading.textContent!.trim()).toBe('L3');
      expect(listening.textContent!.trim()).toBe('entrevista radiofonica');
      for (const topic of ['Algo', 'Otro tema']) {
        expect(el().textContent).not.toContain(topic);
        expect(el().innerHTML).not.toContain(topic);
      }
    });

    it('keeps the topic out of the audio name that a screen reader announces', async () => {
      await open(makeLanguageSession('es'));
      harness.detectChanges();

      const label = el().querySelector('audio')!.getAttribute('aria-label')!;
      expect(label).toBe('Audio for conversation 1');
      expect(label).not.toContain('Otro tema');
    });

    it.each<Language>(['es', 'en'])('marks the content containers of a %s session with its language', async (language) => {
      await open(makeLanguageSession(language));
      harness.detectChanges();

      expectLang(contentNodes(), language);
    });

    it('leaves the English interface labels without a lang attribute', async () => {
      await open(makeLanguageSession('es'));
      harness.detectChanges();

      for (const selector of ['.session', '.shead', '.shead h1', 'h2.sec', 'mat-label', 'button']) {
        expect(el().querySelector(selector)?.hasAttribute('lang'), selector).toBe(false);
      }
      expect(cards()[0].querySelector('.meta')?.hasAttribute('lang')).toBe(false);
    });

    it('plays the audio path the API returned, whatever the language', async () => {
      const c = await open(makeLanguageSession('es'));
      harness.detectChanges();

      expect(el().querySelector('audio')!.getAttribute('src')).toBe(`${c.audioBase}${ES_AUDIO_PATH}`);
    });

    it.each<Language>(['es', 'en'])('marks the feedback text of a %s session with its language', async (language) => {
      await openWithFeedback(language);

      expectLang(feedbackNodes(), language);
      const [reading] = cards();
      expect(reading.querySelector('.fb .muted span')!.textContent).toBe('La opcion B no aparece en el texto.');
      expect(reading.querySelector('.fb p:not(.muted)')!.textContent).toBe('La opcion A cita el texto.');
    });

    it('keeps the English labels around the feedback text outside any lang element', async () => {
      await openWithFeedback('es');

      const [reading, listening, writing] = cards();
      const labels = [
        ...[reading, listening].flatMap((card) => [card.querySelector('.fb strong'), card.querySelector('.fb .muted')]),
        writing.querySelector('.grade .score'),
        ...Array.from(writing.querySelectorAll('.grade > p:not(.score) > strong')),
        writing.querySelector('.grade summary'),
      ];
      expect(labels).toHaveLength(8);
      for (const label of labels) {
        expect(label, label?.outerHTML).not.toBeNull();
        expect(label!.closest('[lang]'), label!.outerHTML).toBeNull();
      }
      expect(reading.querySelector('.fb .muted')!.textContent).toContain('Your choice:');
      expect(writing.querySelectorAll('.grade > p:not(.score) > strong')[0].textContent).toBe('Strengths:');
    });

    it('keeps a space between each feedback label and the text after it', async () => {
      await openWithFeedback('es');

      const [reading, listening, writing] = cards();
      // Angular drops a whitespace-only text node between two elements, so a label followed directly by a lang span would run together.
      for (const card of [reading, listening]) {
        expect(card.querySelector('.fb .muted')!.textContent).toBe('Your choice: La opcion B no aparece en el texto.');
      }
      const [strengths, improvements] = Array.from(writing.querySelectorAll('.grade > p:not(.score)'));
      expect(strengths.textContent).toBe('Strengths: Buena estructura; Ideas claras');
      expect(improvements.textContent).toBe('Improve: Revisar los acentos');
    });

    it.each<[Language, Language]>([
      ['es', 'en'],
      ['en', 'es'],
    ])('keeps a %s session unchanged when the content language preference becomes %s', async (sessionLanguage, preference) => {
      const c = await openWithFeedback(sessionLanguage);
      const before = el().innerHTML;
      const loaded = c.session();

      TestBed.inject(LanguageService).setLanguage(preference);
      harness.detectChanges();
      await harness.fixture.whenStable();

      expect(c.session()).toBe(loaded);
      expect(c.session()!.language).toBe(sessionLanguage);
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(el().innerHTML).toBe(before);
      expectLang(contentNodes(), sessionLanguage);
      expectLang(feedbackNodes(), sessionLanguage);
      expect(el().querySelector('audio')!.getAttribute('src')).toBe(`${c.audioBase}${ES_AUDIO_PATH}`);
    });
  });
});
