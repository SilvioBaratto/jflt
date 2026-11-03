import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { CreateSessionBody } from '../models/exam';
import { ExamService } from './exam';
import { LanguageService } from './language';

const BASE = `${environment.apiUrl}sessions`;

describe('ExamService', () => {
  let service: ExamService;
  let language: LanguageService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExamService);
    language = TestBed.inject(LanguageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  describe('create', () => {
    it('starts a session in English by default', () => {
      service.create({ mode: 'practice' }).subscribe();

      const req = http.expectOne(BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ mode: 'practice', language: 'en' });
    });

    it('starts a session in the selected language and keeps the rest of the body', () => {
      language.setLanguage('es');
      const body: CreateSessionBody = { mode: 'exam', skill: 'reading', levels: [2, 3] };

      service.create(body).subscribe();

      expect(http.expectOne(BASE).request.body).toEqual({
        mode: 'exam',
        skill: 'reading',
        levels: [2, 3],
        language: 'es',
      });
    });

    it('lets an explicit language override the selected one', () => {
      language.setLanguage('es');

      service.create({ mode: 'practice', language: 'en' }).subscribe();

      expect(http.expectOne(BASE).request.body).toEqual({ mode: 'practice', language: 'en' });
    });

    it('does not mutate the caller body', () => {
      language.setLanguage('es');
      const body: CreateSessionBody = { mode: 'practice' };

      service.create(body).subscribe();
      http.expectOne(BASE);

      expect(body).toEqual({ mode: 'practice' });
    });
  });

  describe('list', () => {
    it('requests English sessions by default', () => {
      service.list().subscribe();

      const req = http.expectOne(`${BASE}?lang=en`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('requests Spanish sessions when Spanish is selected', () => {
      language.setLanguage('es');

      service.list().subscribe();

      http.expectOne(`${BASE}?lang=es`).flush([]);
    });
  });

  describe('calls on one session', () => {
    it('get() does not add a language, because the session already has one', () => {
      language.setLanguage('es');

      service.get('abc').subscribe();

      http.expectOne(`${BASE}/abc`).flush({});
    });
  });
});
