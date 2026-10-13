import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Session,
  CreateSessionBody,
  SubmitAnswerBody,
  McqResult,
  WritingResult,
  SessionResult,
} from '../models/exam';

/** Client for the session/exam API (create, fetch, submit answers, complete). */
@Injectable({ providedIn: 'root' })
export class ExamService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}sessions`;

  /** Create a practice set or mock exam. */
  create(body: CreateSessionBody): Observable<Session> {
    return this.http.post<Session>(this.base, body);
  }

  /** Fetch one session with its items and answers. */
  get(id: string): Observable<Session> {
    return this.http.get<Session>(`${this.base}/${id}`);
  }

  /** Submit and score one answer. */
  submit(id: string, body: SubmitAnswerBody): Observable<McqResult | WritingResult> {
    return this.http.post<McqResult | WritingResult>(`${this.base}/${id}/answers`, body);
  }

  /** Complete the session and return the SLP-style result. */
  complete(id: string): Observable<SessionResult> {
    return this.http.post<SessionResult>(`${this.base}/${id}/complete`, {});
  }

  /** List past sessions. */
  list(): Observable<Session[]> {
    return this.http.get<Session[]>(this.base);
  }
}
