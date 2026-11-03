import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ContentService } from './content';
import { LanguageService } from './language';

const BASE = `${environment.apiUrl}content`;
const LISTS: [string, (s: ContentService) => Observable<unknown>][] = [
  ['reading', (s) => s.reading()],
  ['listening', (s) => s.listening()],
  ['writing', (s) => s.writing()],
];

describe('ContentService', () => {
  let service: ContentService;
  let language: LanguageService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ContentService);
    language = TestBed.inject(LanguageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it.each(LISTS)('%s() requests English content by default', (skill, list) => {
    list(service).subscribe();

    const req = http.expectOne(`${BASE}/${skill}?lang=en`);
    expect(req.request.method).toBe('GET');
    req.flush({ total: 0, items: [] });
  });

  it.each(LISTS)('%s() requests Spanish content when Spanish is selected', (skill, list) => {
    language.setLanguage('es');

    list(service).subscribe();

    http.expectOne(`${BASE}/${skill}?lang=es`).flush({ total: 0, items: [] });
  });

  it('reads the language when the call is made, not when the service is created', () => {
    service.reading().subscribe();
    http.expectOne(`${BASE}/reading?lang=en`).flush({ total: 0, items: [] });

    language.setLanguage('es');
    service.reading().subscribe();

    http.expectOne(`${BASE}/reading?lang=es`).flush({ total: 0, items: [] });
  });
});
