import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatCardHarness } from '@angular/material/card/testing';
import { Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ContentService } from '../../services/content';
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
