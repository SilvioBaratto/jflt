import { Injectable, signal } from '@angular/core';

/** Content languages the question bank is served in; matches the API's lowercase `lang` values. */
export type Language = 'en' | 'es';

/** One content language: the API value, its name in its own language and a compact display code. */
export interface LanguageOption {
  value: Language;
  label: string;
  code: string;
}

/** The content languages in display order, shared by every language picker so names can't drift. */
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { value: 'en', label: 'English', code: 'EN' },
  { value: 'es', label: 'Español', code: 'ES' },
];

const STORAGE_KEY = 'app-content-language';
const DEFAULT_LANGUAGE: Language = 'en';

/**
 * The language of the question bank the learner practises in, persisted across reloads. Callers
 * read it when they load content or start a session; an open session keeps the language it began with.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly _language = signal<Language>(this._readStorage());

  readonly language = this._language.asReadonly();

  /** Switches the content language and remembers it; storage that is blocked or full only costs persistence. */
  setLanguage(language: Language): void {
    this._language.set(language);
    this._persist(language);
  }

  /**
   * The localStorage getter throws a SecurityError when the browser blocks site data. This runs
   * during app initialization, so a throw here would fail bootstrap: fall back to English.
   */
  private _readStorage(): Language {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return LANGUAGE_OPTIONS.find((option) => option.value === value)?.value ?? DEFAULT_LANGUAGE;
    } catch {
      return DEFAULT_LANGUAGE;
    }
  }

  private _persist(language: Language): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Storage is blocked or full: the choice lasts for this session only.
    }
  }
}
