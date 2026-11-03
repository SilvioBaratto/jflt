import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ExamService } from '../../services/exam';
import { Language, LanguageService } from '../../services/language';
import { LaunchComponent } from './launch';

function setup(
  data: Record<string, unknown>,
  create: ReturnType<typeof vi.fn>,
  language?: Language,
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ExamService, useValue: { create } },
      { provide: ActivatedRoute, useValue: { snapshot: { data } } },
    ],
  });
  const languageService = TestBed.inject(LanguageService);
  if (language) languageService.setLanguage(language);
  const router = TestBed.inject(Router);
  const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(LaunchComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, nav, languageService };
}

describe('LaunchComponent', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it.each([
    [{ mode: 'practice', skill: 'reading' }, 'Reading practice'],
    [{ mode: 'practice', skill: 'listening' }, 'Listening practice'],
    [{ mode: 'practice', skill: 'writing' }, 'Writing practice'],
    [{ mode: 'practice' }, 'Full practice'],
    [{ mode: 'exam' }, 'Mock exam'],
  ])('renders h1 for %j', (data, title) => {
    const { el } = setup(data, vi.fn().mockReturnValue(new Subject()));
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('h1')?.textContent?.trim()).toBe(title);
  });

  it('names the spinner and exposes a status while loading', () => {
    const { el } = setup(
      { mode: 'exam', label: 'Starting mock exam…' },
      vi.fn().mockReturnValue(new Subject()),
    );
    expect(el.querySelector('mat-spinner')?.getAttribute('aria-label')).toBe('Starting mock exam…');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Starting mock exam…');
  });

  it('navigates to the session on success', () => {
    const s = new Subject<{ id: string }>();
    const { nav } = setup({ mode: 'exam' }, vi.fn().mockReturnValue(s));
    s.next({ id: 'abc' });
    expect(nav).toHaveBeenCalledWith(['/session', 'abc'], { replaceUrl: true });
  });

  it('shows an alert, retry and back link on failure, and focuses the h1', () => {
    const create = vi.fn().mockReturnValue(throwError(() => new Error('x')));
    const { fixture, el } = setup({ mode: 'practice', skill: 'reading' }, create);
    fixture.detectChanges();
    expect(el.querySelector('mat-spinner')).toBeNull();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Reading practice');
    expect(document.activeElement).toBe(el.querySelector('h1'));
    const link = el.querySelector('a[href="/"]');
    expect(link?.textContent?.trim()).toBe('Back to question bank');
  });

  it('re-runs session creation on Try again', () => {
    const ok = new Subject<{ id: string }>();
    const create = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('x')))
      .mockReturnValueOnce(ok);
    const { fixture, el, nav } = setup({ mode: 'exam' }, create);
    fixture.detectChanges();
    const retry = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Try again',
    ) as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    expect(create).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector('mat-spinner')).not.toBeNull();
    ok.next({ id: 'z' });
    expect(nav).toHaveBeenCalledWith(['/session', 'z'], { replaceUrl: true });
  });

  describe('content language', () => {
    it('when English is selected, the session is created in English', () => {
      const create = vi.fn().mockReturnValue(new Subject());
      setup({ mode: 'practice', skill: 'reading' }, create);
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        mode: 'practice',
        skill: 'reading',
        adaptive: true,
        language: 'en',
      });
    });

    it('when Spanish is selected, the session is created in Spanish', () => {
      const create = vi.fn().mockReturnValue(new Subject());
      setup({ mode: 'exam' }, create, 'es');
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        mode: 'exam',
        skill: undefined,
        adaptive: true,
        language: 'es',
      });
    });

    it('when the language changes before a retry, Try again uses the new language', () => {
      const create = vi
        .fn()
        .mockReturnValueOnce(throwError(() => new Error('x')))
        .mockReturnValueOnce(new Subject());
      const { fixture, el, languageService } = setup({ mode: 'practice' }, create);
      languageService.setLanguage('es');
      const retry = Array.from(el.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Try again',
      ) as HTMLButtonElement;
      retry.click();
      fixture.detectChanges();
      expect(create).toHaveBeenNthCalledWith(1, expect.objectContaining({ language: 'en' }));
      expect(create).toHaveBeenNthCalledWith(2, expect.objectContaining({ language: 'es' }));
    });
  });
});
