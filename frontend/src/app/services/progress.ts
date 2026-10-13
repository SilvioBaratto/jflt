import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Dashboard } from '../models/progress';

/** Client for the learner dashboard/progress endpoint. */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly http = inject(HttpClient);

  /** Fetch the dashboard aggregate. */
  dashboard(): Observable<Dashboard> {
    return this.http.get<Dashboard>(`${environment.apiUrl}progress`);
  }
}
