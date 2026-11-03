import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatCardHarness } from '@angular/material/card/testing';
import { Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { ContentService } from '../../services/content';
import { LanguageService } from '../../services/language';
import {
  ContentList,
  ListeningSummary,
  ReadingSummary,
  WritingSummary,
} from '../../models/content';
import { HomeComponent } from './home';

const READING: ContentList<ReadingSummary> = {
  total: 60,
  items: [
    {
      id: 'r1',
      level: 3,
      topic: 'Sanctions',
      passage: 'p',
      question: 'q',
      source: 'seed',
      language: 'en',
    },
    {
      id: 'r2',
      level: 4,
      topic: 'Deterrence',
      passage: 'p',
      question: 'q',
      source: 'seed',
      language: 'en',
    },
  ],
};
const LISTENING: ContentList<ListeningSummary> = {
  total: 12,
  items: [
    {
      id: 'l1',
      level: 3,
      topic: 'Burden-sharing',
      conversationType: 'radio interview',
      questionCount: 3,
      source: 'seed',
      language: 'en',
    },
  ],
};
const WRITING: ContentList<WritingSummary> = {
  total: 16,
  items: [
    {
      id: 'w1',
      taskType: 'essay',
      stanagLevel: 4,
      title: 'Task 10 — Nuclear deterrence',
      instructions: 'Write.',
      wordCountMin: 350,
      wordCountMax: 700,
      source: 'seed',
      language: 'en',
    },
  ],
};

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let host: HTMLElement;
  let loader: HarnessLoader;
  let reading$: Subject<ContentList<ReadingSummary>>;
  let listening$: Subject<ContentList<ListeningSummary>>;
  let writing$: Subject<ContentList<WritingSummary>>;

  beforeEach(async () => {
    localStorage.clear();
    reading$ = new Subject();
    listening$ = new Subject();
    writing$ = new Subject();
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        {
          provide: ContentService,
          useValue: {
            reading: () => reading$,
            listening: () => listening$,
            writing: () => writing$,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    host = fixture.nativeElement;
    loader = TestbedHarnessEnvironment.loader(fixture);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  async function loadAll(): Promise<void> {
    reading$.next(READING);
    listening$.next(LISTENING);
    writing$.next(WRITING);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('when the home page renders, exactly one h1 names the view', () => {
    const headings = host.querySelectorAll('h1');
    expect(headings.length).toBe(1);
    expect(headings[0].textContent?.trim()).toBe('Question bank');
  });

  it('when the home page renders, no heading level is skipped', async () => {
    await loadAll();
    const levels = Array.from(host.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) =>
      Number(h.tagName.slice(1)),
    );
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeLessThanOrEqual(levels[i - 1] + 1);
    }
  });

  it('when the bank is still loading, each section shows a spinner instead of its list', () => {
    expect(host.querySelectorAll('mat-spinner').length).toBe(3);
    expect(host.querySelectorAll('ul.items').length).toBe(0);
  });

  it('when the bank loads, one outlined card per skill shows its total and items', async () => {
    await loadAll();
    const cards = await loader.getAllHarnesses(MatCardHarness);
    expect(cards.length).toBe(3);
    for (const card of cards) {
      expect(await (await card.host()).hasClass('mat-mdc-card-outlined')).toBe(true);
    }

    const [reading, listening, writing] = await Promise.all(cards.map((c) => c.getText()));
    expect(reading).toContain('Reading');
    expect(reading).toContain('60');
    expect(reading).toContain('Deterrence');
    expect(listening).toContain('12');
    expect(listening).toContain('radio interview · 3 questions');
    expect(writing).toContain('16');
    expect(writing).toContain('350–700 words');
    expect(host.querySelectorAll('mat-spinner').length).toBe(0);
  });

  it('when the home page renders, each section links to its practice route with a specific name', () => {
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('a[href]'));
    expect(links.map((a) => [a.getAttribute('href'), a.getAttribute('aria-label')])).toEqual([
      ['/reading', 'Practise reading'],
      ['/listening', 'Practise listening'],
      ['/writing', 'Practise writing'],
    ]);
  });

  it('when the bank is loading, each spinner is named and its region is busy', () => {
    const labels = Array.from(host.querySelectorAll('mat-spinner')).map((s) => s.getAttribute('aria-label'));
    expect(labels).toEqual(['Loading reading items', 'Loading listening items', 'Loading writing tasks']);
    expect(host.querySelectorAll('[aria-busy="true"]').length).toBe(3);
  });

  it('when the bank loads, lists keep list semantics and levels read in full', async () => {
    await loadAll();
    const lists = host.querySelectorAll('ul.items');
    expect(lists.length).toBe(3);
    lists.forEach((ul) => expect(ul.getAttribute('role')).toBe('list'));
    expect(host.querySelector('.lvl .cdk-visually-hidden')?.textContent).toBe('Level 3');
    expect(host.querySelector('.lvl [aria-hidden="true"]')?.textContent).toBe('L3');
    expect(host.querySelectorAll('[aria-busy="true"]').length).toBe(0);
  });

  it('when a request fails, the section shows an alert with a retry that reloads it', async () => {
    reading$.error(new Error('boom'));
    fixture.detectChanges();
    await fixture.whenStable();

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Couldn't load reading items");
    expect(host.querySelectorAll('mat-spinner').length).toBe(2);

    const next$ = new Subject<ContentList<ReadingSummary>>();
    const spy = vi.spyOn(fixture.componentInstance['content'], 'reading').mockReturnValue(next$);
    alert!.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    // The focused button is gone, so focus must have moved to the section heading, not the body.
    expect(document.activeElement?.tagName).toBe('H2');
    expect(document.activeElement?.textContent).toContain('Reading');

    next$.next(READING);
    fixture.detectChanges();
    expect(host.textContent).toContain('Deterrence');
  });

  it('when a listening request fails, its own retry reloads only that section', async () => {
    listening$.error(new Error('boom'));
    fixture.detectChanges();
    await fixture.whenStable();

    const next$ = new Subject<ContentList<ListeningSummary>>();
    const c = fixture.componentInstance;
    const listening = vi.spyOn(c['content'], 'listening').mockReturnValue(next$);
    const reading = vi.spyOn(c['content'], 'reading');
    host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    fixture.detectChanges();

    expect(listening).toHaveBeenCalledTimes(1);
    expect(reading).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toContain('Listening');
    next$.next(LISTENING);
    fixture.detectChanges();
    expect(host.textContent).toContain('Burden-sharing');
  });

  it('when a count is one, the singular forms are used', async () => {
    reading$.next(READING);
    listening$.next({ total: 1, items: [{ ...LISTENING.items[0], questionCount: 1 }] });
    writing$.next(WRITING);
    fixture.detectChanges();
    await fixture.whenStable();

    const listeningCard = host.querySelectorAll('mat-card')[1];
    expect(listeningCard.textContent).toContain('1 question');
    expect(listeningCard.textContent).not.toContain('1 questions');
    expect(listeningCard.querySelector('h2 .cdk-visually-hidden')?.textContent?.trim()).toBe('item');
    expect(host.querySelectorAll('mat-card')[0].querySelector('h2 .cdk-visually-hidden')?.textContent?.trim()).toBe(
      'items',
    );
  });

  it('when a request errors synchronously, the error state is shown', () => {
    const c = fixture.componentInstance;
    vi.spyOn(c['content'], 'writing').mockReturnValue(throwError(() => new Error('x')));
    c.loadWriting();
    fixture.detectChanges();
    expect(c.writingState()).toBe('error');
  });
});

describe('HomeComponent content language', () => {
  const BASE = `${environment.apiUrl}content`;
  const EMPTY = { total: 0, items: [] };
  const ES_READING: ContentList<ReadingSummary> = {
    total: 2,
    items: [
      { ...READING.items[0], id: 'r-es-1', topic: 'Sanciones', language: 'es' },
      { ...READING.items[1], id: 'r-es-2', topic: 'Disuasión', language: 'es' },
    ],
  };
  const ES_LISTENING: ContentList<ListeningSummary> = {
    total: 1,
    items: [{ ...LISTENING.items[0], id: 'l-es-1', topic: 'Reparto de cargas', language: 'es' }],
  };
  const ES_WRITING: ContentList<WritingSummary> = {
    total: 1,
    items: [
      { ...WRITING.items[0], id: 'w-es-1', title: 'Tarea 10 — Disuasión nuclear', language: 'es' },
    ],
  };

  let fixture: ComponentFixture<HomeComponent>;
  let host: HTMLElement;
  let http: HttpTestingController;
  let language: LanguageService;

  function lists(lang: string): {
    reading: TestRequest;
    listening: TestRequest;
    writing: TestRequest;
  } {
    return {
      reading: http.expectOne(`${BASE}/reading?lang=${lang}`),
      listening: http.expectOne(`${BASE}/listening?lang=${lang}`),
      writing: http.expectOne(`${BASE}/writing?lang=${lang}`),
    };
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function switchTo(lang: 'en' | 'es'): Promise<void> {
    language.setLanguage(lang);
    await settle();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    language = TestBed.inject(LanguageService);
  });

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(HomeComponent);
    host = fixture.nativeElement;
    await settle();
  }

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('when the page opens, each list is requested once in English', async () => {
    await open();
    const r = lists('en');
    r.reading.flush(READING);
    r.listening.flush(LISTENING);
    r.writing.flush(WRITING);
    await settle();

    expect(host.textContent).toContain('Deterrence');
    expect(host.textContent).toContain('Burden-sharing');
  });

  it('when Spanish was chosen earlier, the first requests are already in Spanish', async () => {
    language.setLanguage('es');
    await open();

    lists('es');
  });

  it('when the language changes, every list is requested once more in the new language', async () => {
    await open();
    const en = lists('en');
    en.reading.flush(READING);
    en.listening.flush(LISTENING);
    en.writing.flush(WRITING);
    await settle();

    await switchTo('es');

    const es = lists('es');
    es.reading.flush(ES_READING);
    es.listening.flush(ES_LISTENING);
    es.writing.flush(ES_WRITING);
    await settle();

    expect(host.textContent).toContain('Disuasión');
    expect(host.textContent).toContain('Reparto de cargas');
    expect(host.textContent).toContain('Tarea 10 — Disuasión nuclear');
    expect(host.textContent).not.toContain('Deterrence');
    expect(host.querySelectorAll('mat-spinner').length).toBe(0);
  });

  it('when the language changes, the sections show spinners and drop the old items until the new ones arrive', async () => {
    await open();
    const en = lists('en');
    en.reading.flush(READING);
    en.listening.flush(LISTENING);
    en.writing.flush(WRITING);
    await settle();

    await switchTo('es');

    expect(host.querySelectorAll('mat-spinner').length).toBe(3);
    expect(host.querySelectorAll('[aria-busy="true"]').length).toBe(3);
    expect(host.querySelectorAll('ul.items').length).toBe(0);
    expect(host.querySelector('.n')).toBeNull();
    lists('es');
  });

  it('when the language changes before the answers arrive, the superseded requests are cancelled', async () => {
    await open();
    const en = lists('en');

    await switchTo('es');

    expect(en.reading.cancelled).toBe(true);
    expect(en.listening.cancelled).toBe(true);
    expect(en.writing.cancelled).toBe(true);
    const es = lists('es');
    es.reading.flush(ES_READING);
    es.listening.flush(ES_LISTENING);
    es.writing.flush(ES_WRITING);
    await settle();
    expect(host.textContent).toContain('Sanciones');
  });

  it('when the selected language is chosen again, nothing is requested', async () => {
    await open();
    const en = lists('en');
    en.reading.flush(READING);
    en.listening.flush(LISTENING);
    en.writing.flush(WRITING);
    await settle();

    await switchTo('en');

    http.expectNone(() => true);
  });

  it('when a list comes back empty, its section says there are no items in this language yet', async () => {
    await open();
    const r = lists('en');
    r.reading.flush(EMPTY);
    r.listening.flush(LISTENING);
    r.writing.flush(EMPTY);
    await settle();

    const cards = Array.from(host.querySelectorAll('mat-card'));
    const empty = (card: Element) => card.querySelector('.empty')?.textContent?.trim();
    expect(empty(cards[0])).toBe('No items in this language yet');
    expect(cards[0].querySelector('ul.items')).toBeNull();
    expect(empty(cards[1])).toBeUndefined();
    expect(cards[1].querySelector('ul.items')).not.toBeNull();
    expect(empty(cards[2])).toBe('No items in this language yet');
  });

  it('when a language has no items, switching to one that has them replaces the empty state', async () => {
    await open();
    const en = lists('en');
    en.reading.flush(EMPTY);
    en.listening.flush(EMPTY);
    en.writing.flush(EMPTY);
    await settle();
    expect(host.querySelectorAll('.empty').length).toBe(3);

    await switchTo('es');
    const es = lists('es');
    es.reading.flush(ES_READING);
    es.listening.flush(ES_LISTENING);
    es.writing.flush(ES_WRITING);
    await settle();

    expect(host.querySelectorAll('.empty').length).toBe(0);
    expect(host.querySelectorAll('ul.items').length).toBe(3);
  });

  it('when a reload fails, the section shows its alert and Try again requests it in the new language', async () => {
    await open();
    const en = lists('en');
    en.reading.flush(READING);
    en.listening.flush(LISTENING);
    en.writing.flush(WRITING);
    await settle();

    await switchTo('es');
    const es = lists('es');
    es.reading.flush('boom', { status: 500, statusText: 'Server Error' });
    es.listening.flush(ES_LISTENING);
    es.writing.flush(ES_WRITING);
    await settle();

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Couldn't load reading items");
    expect(host.textContent).not.toContain('Deterrence');
    expect(host.textContent).toContain('Reparto de cargas');

    alert!.querySelector<HTMLButtonElement>('button')!.click();
    await settle();
    http.expectNone(`${BASE}/listening?lang=es`);
    http.expectOne(`${BASE}/reading?lang=es`).flush(ES_READING);
    await settle();

    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain('Disuasión');
  });
});
