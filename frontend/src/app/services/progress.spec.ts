import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { Dashboard } from '../models/progress';
import { LanguageService } from './language';
import { ProgressService } from './progress';

const URL = `${environment.apiUrl}progress`;
const DASHBOARD: Dashboard = {
  weakAreas: [],
  reviewDue: [],
  recentSessions: [],
  totalCompleted: 0,
  bank: { reading: 0, listening: 0, writing: 0, vocab: 0 },
};

describe('ProgressService', () => {
  let service: ProgressService;
  let language: LanguageService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProgressService);
    language = TestBed.inject(LanguageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('dashboard() requests English progress by default', () => {
    service.dashboard().subscribe();

    const req = http.expectOne(`${URL}?lang=en`);
    expect(req.request.method).toBe('GET');
    req.flush(DASHBOARD);
  });

  it('dashboard() requests Spanish progress when Spanish is selected', () => {
    language.setLanguage('es');

    service.dashboard().subscribe();

    http.expectOne(`${URL}?lang=es`).flush(DASHBOARD);
  });
});
