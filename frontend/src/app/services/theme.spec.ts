import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ThemeService } from './theme';

const STORAGE_KEY = 'app-theme';

describe('ThemeService', () => {
  let matchMediaMock: {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  function setupMatchMedia(prefersDark: boolean): void {
    matchMediaMock = {
      matches: prefersDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    // jsdom has no window.matchMedia, so define it rather than spy on it.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue(matchMediaMock as unknown as MediaQueryList),
    });
  }

  function createService(): ThemeService {
    TestBed.configureTestingModule({});
    return TestBed.inject(ThemeService);
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light', 'theme-transitioning');
    document.documentElement.style.removeProperty('color-scheme');
  });

  afterEach(() => {
    localStorage.clear();
    // jsdom has no matchMedia and every spec shares one window: a stub left behind reaches unrelated
    // specs, where its missing listener methods surface as unhandled errors.
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  // The product is light-only: stored or OS dark preferences must never reach the scheme.
  describe('isDark computed', () => {
    it.each([
      ['light', true],
      ['dark', false],
      ['system', true],
      ['system', false],
    ] as const)('when theme is %s and OS prefers dark is %s, false is returned', (stored, osDark) => {
      localStorage.setItem(STORAGE_KEY, stored);
      setupMatchMedia(osDark);
      expect(createService().isDark()).toBe(false);
    });
  });

  describe('initialization', () => {
    it('when no theme is stored, system is returned as the fallback', () => {
      setupMatchMedia(false);
      expect(createService().theme()).toBe('system');
    });
  });

  describe('setTheme persistence', () => {
    it('when setTheme is called, the choice is written to localStorage', () => {
      setupMatchMedia(false);
      const service = createService();
      service.setTheme('dark');
      // Verify via read-back — avoids jsdom localStorage spy quirks
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    });
  });

  describe('scheme class application', () => {
    it.each(['light', 'dark', 'system'] as const)(
      'when theme is %s, only the light class sits on documentElement',
      (stored) => {
        localStorage.setItem(STORAGE_KEY, stored);
        setupMatchMedia(true);
        createService();
        TestBed.tick();
        expect(document.documentElement.classList.contains('light')).toBe(true);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
      },
    );

    it('when a dark class is left on documentElement, the service removes it', () => {
      document.documentElement.classList.add('dark');
      setupMatchMedia(false);
      createService();
      TestBed.tick();
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  // index.html pins a stored choice as an inline color-scheme before Angular boots, because the
  // inlined critical CSS has no .light / .dark rule. The class must take over from it.
  describe('pre-paint color-scheme handover', () => {
    function pinInlineScheme(scheme: 'light' | 'dark'): void {
      document.documentElement.style.setProperty('color-scheme', scheme);
      // Guards against a vacuous pass: the DOM really holds the inline value.
      expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe(scheme);
    }

    it('when the class is applied, the inline color-scheme from index.html is removed', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');
      setupMatchMedia(false);
      pinInlineScheme('dark');

      createService();
      TestBed.tick();

      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('');
    });
  });

  describe('OS preference listener', () => {
    it('when the service initializes, a matchMedia change listener is registered', () => {
      setupMatchMedia(false);
      createService();
      expect(matchMediaMock.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });

  describe('SSR safety', () => {
    it('when the service is constructed, no error is thrown', () => {
      setupMatchMedia(false);
      expect(() => createService()).not.toThrow();
    });
  });

  // A browser that blocks site data throws a SecurityError from storage. ThemeService starts in
  // an app initializer, so a throw there would fail bootstrap and leave every route blank.
  describe('blocked storage', () => {
    afterEach(() => vi.restoreAllMocks());

    function blockStorage(method: 'getItem' | 'setItem'): void {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
    }

    it('when reading localStorage throws, the service is created with the system theme', () => {
      setupMatchMedia(false);
      blockStorage('getItem');
      // Guards against a vacuous pass: storage really throws in this test.
      expect(() => localStorage.getItem(STORAGE_KEY)).toThrow();

      let service: ThemeService | undefined;
      expect(() => (service = createService())).not.toThrow();
      expect(service?.theme()).toBe('system');
    });

    it('when writing localStorage throws, setTheme still updates the theme signal', () => {
      setupMatchMedia(false);
      const service = createService();
      blockStorage('setItem');
      expect(() => localStorage.setItem(STORAGE_KEY, 'dark')).toThrow();

      expect(() => service.setTheme('dark')).not.toThrow();
      expect(service.theme()).toBe('dark');
    });
  });

  // `.theme-transitioning` suppresses CSS transitions for the scheme switch, whichever path
  // changes the theme (the sidebar toggle or the Settings page).
  describe('scheme switch transitions', () => {
    afterEach(() => vi.useRealTimers());

    function transitioning(): boolean {
      return document.documentElement.classList.contains('theme-transitioning');
    }

    it('when setTheme changes the theme, transitions are suppressed until the switch ends', () => {
      vi.useFakeTimers();
      localStorage.setItem(STORAGE_KEY, 'light');
      setupMatchMedia(false);
      const service = createService();

      service.setTheme('dark');
      expect(transitioning()).toBe(true);

      vi.advanceTimersByTime(150);
      expect(transitioning()).toBe(false);
    });

    it('when setTheme is called with the current theme, transitions are not suppressed', () => {
      vi.useFakeTimers();
      localStorage.setItem(STORAGE_KEY, 'dark');
      setupMatchMedia(false);
      const service = createService();

      service.setTheme('dark');
      expect(transitioning()).toBe(false);
    });
  });
});
