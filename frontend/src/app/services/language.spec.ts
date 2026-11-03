import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { LANGUAGE_OPTIONS, LanguageService } from './language';

const STORAGE_KEY = 'app-content-language';

describe('LanguageService', () => {
  function createService(): LanguageService {
    TestBed.configureTestingModule({});
    return TestBed.inject(LanguageService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('options', () => {
    it('offers English and Spanish with their display labels and compact codes', () => {
      expect(LANGUAGE_OPTIONS).toEqual([
        { value: 'en', label: 'English', code: 'EN' },
        { value: 'es', label: 'Español', code: 'ES' },
      ]);
    });
  });

  describe('initialization', () => {
    it('when storage is empty, English is the language', () => {
      expect(createService().language()).toBe('en');
    });

    it('when es is stored, Spanish is the language', () => {
      localStorage.setItem(STORAGE_KEY, 'es');
      expect(createService().language()).toBe('es');
    });

    it.each(['fr', '', 'ES'])(
      'when %j is stored, English is the language',
      (stored) => {
        localStorage.setItem(STORAGE_KEY, stored);
        expect(createService().language()).toBe('en');
      },
    );
  });

  describe('setLanguage', () => {
    it('updates the signal and writes the choice to localStorage', () => {
      const service = createService();

      service.setLanguage('es');

      expect(service.language()).toBe('es');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('es');
    });

    it('when switching back to English, the stored choice follows', () => {
      localStorage.setItem(STORAGE_KEY, 'es');
      const service = createService();

      service.setLanguage('en');

      expect(service.language()).toBe('en');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
    });
  });

  // A browser that blocks site data throws a SecurityError from storage. The service starts in an
  // app initializer, so a throw there would fail bootstrap and leave every route blank.
  describe('blocked storage', () => {
    afterEach(() => vi.restoreAllMocks());

    function blockStorage(method: 'getItem' | 'setItem'): void {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });
    }

    it('when reading localStorage throws, the service starts in English', () => {
      blockStorage('getItem');
      // Guards against a vacuous pass: storage really throws in this test.
      expect(() => localStorage.getItem(STORAGE_KEY)).toThrow();

      let service: LanguageService | undefined;
      expect(() => (service = createService())).not.toThrow();
      expect(service?.language()).toBe('en');
    });

    it('when writing localStorage throws, setLanguage still updates the signal', () => {
      const service = createService();
      blockStorage('setItem');
      expect(() => localStorage.setItem(STORAGE_KEY, 'es')).toThrow();

      expect(() => service.setLanguage('es')).not.toThrow();
      expect(service.language()).toBe('es');
    });
  });
});
