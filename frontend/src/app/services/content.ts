import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ContentList, ReadingSummary, ListeningSummary, WritingSummary } from '../models/content';
import { LanguageService } from './language';

/** Client for read-only question-bank browsing, scoped to the selected content language. */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);
  private readonly base = `${environment.apiUrl}content`;

  /** List reading items in the bank. */
  reading(): Observable<ContentList<ReadingSummary>> {
    return this.http.get<ContentList<ReadingSummary>>(`${this.base}/reading`, this.langParams());
  }

  /** List listening items in the bank. */
  listening(): Observable<ContentList<ListeningSummary>> {
    return this.http.get<ContentList<ListeningSummary>>(
      `${this.base}/listening`,
      this.langParams(),
    );
  }

  /** List writing tasks in the bank. */
  writing(): Observable<ContentList<WritingSummary>> {
    return this.http.get<ContentList<WritingSummary>>(`${this.base}/writing`, this.langParams());
  }

  /** Read per call, not at construction, so a switch applies to the next request. */
  private langParams(): { params: { lang: string } } {
    return { params: { lang: this.language.language() } };
  }
}
