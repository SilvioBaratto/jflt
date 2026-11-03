import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Dashboard } from '../models/progress';
import { LanguageService } from './language';

/** Client for the learner dashboard/progress endpoint. */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);

  /** Fetch the dashboard aggregate for the selected content language. */
  dashboard(): Observable<Dashboard> {
    return this.http.get<Dashboard>(`${environment.apiUrl}progress`, {
      params: { lang: this.language.language() },
    });
  }
}
