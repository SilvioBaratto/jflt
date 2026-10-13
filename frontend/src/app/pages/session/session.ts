import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  DestroyRef,
  WritableSignal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Observable,
  catchError,
  defer,
  finalize,
  forkJoin,
  map,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { environment } from '../../../environments/environment';
import { MarkdownPipe } from '../../shared/markdown.pipe';
import { ExamService } from '../../services/exam';
import {
  Session,
  ReadingItem,
  ListeningItem,
  WritingTask,
  McqResult,
  McqSkillResult,
  WritingResult,
  SessionResult,
} from '../../models/exam';

@Component({
  selector: 'app-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatRadioModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MarkdownPipe,
  ],
  templateUrl: './session.html',
  styleUrl: './session.css',
})
/** Runs one session: renders reading/listening/writing items, scores answers, and finishes to a result. */
export class SessionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly examApi = inject(ExamService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly resultsHeading = viewChild<ElementRef<HTMLElement>>('resultsHeading');

  readonly session = signal<Session | null>(null);
  readonly loading = signal(true);
  readonly audioBase = environment.apiUrl.replace(/\/api\/v1\/$/, '');

  readonly readingChoice = signal<Record<string, string>>({});
  readonly readingResult = signal<Record<string, McqResult>>({});
  readonly listeningChoice = signal<Record<string, string>>({});
  readonly listeningResult = signal<Record<string, McqResult>>({});
  readonly writingOption = signal<Record<string, string>>({});
  readonly writingText = signal<Record<string, string>>({});
  readonly writingResult = signal<Record<string, WritingResult>>({});
  readonly grading = signal<Record<string, boolean>>({});
  readonly checking = signal<Record<string, boolean>>({});
  readonly busy = computed(
    () =>
      Object.values(this.grading()).some(Boolean) || Object.values(this.checking()).some(Boolean),
  );
  readonly finishing = signal(false);
  readonly finishStatus = signal('');
  readonly finishError = signal<string | null>(null);
  readonly finalResult = signal<SessionResult | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.examApi
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.session.set(s);
          if (s.status === 'completed' && s.result) this.finalResult.set(s.result);
          const opt: Record<string, string> = {};
          for (const t of s.items.writing) opt[t.id] = t.options[0]?.key ?? 'main';
          this.writingOption.set(opt);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private lkey(itemId: string, qi: number): string {
    return `${itemId}:${qi}`;
  }

  listeningKey(itemId: string, qi: number): string {
    return this.lkey(itemId, qi);
  }

  /** Record the chosen label for a reading item. */
  pickReading(itemId: string, label: string): void {
    this.readingChoice.update((m) => ({ ...m, [itemId]: label }));
  }

  /** Submit a reading item for scoring. */
  submitReading(item: ReadingItem): void {
    this.fire(this.readingSubmission(item));
  }

  /** Record the chosen label for a listening question. */
  pickListening(itemId: string, qi: number, label: string): void {
    this.listeningChoice.update((m) => ({ ...m, [this.lkey(itemId, qi)]: label }));
  }

  /** Submit one listening question for scoring. */
  submitListening(item: ListeningItem, qi: number): void {
    this.fire(this.listeningSubmission(item, qi));
  }

  /** Choose which essay prompt option to answer. */
  pickWritingOption(taskId: string, key: string): void {
    this.writingOption.update((m) => ({ ...m, [taskId]: key }));
  }

  /** Update the candidate's writing response text. */
  setWritingText(taskId: string, text: string): void {
    this.writingText.update((m) => ({ ...m, [taskId]: text }));
  }

  /** Count words in a writing response. */
  wordCount(text: string | undefined): number {
    const t = (text ?? '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  /** Submit a writing response for live grading. */
  submitWriting(task: WritingTask): void {
    this.fire(this.writingSubmission(task));
  }

  /** Render a level label for display; "<3" (below the lowest tested level) reads as "below 3". */
  levelLabel(level: string | number): string {
    const l = String(level);
    return l.startsWith('<') ? `below ${l.slice(1)}` : l;
  }

  /** Number of keyed questions in a skill result that were never answered. */
  unanswered(r: McqSkillResult): number {
    return r.answered == null ? 0 : r.total - r.answered;
  }

  /**
   * Finish the session and load the SLP-style result.
   *
   * Choices that were never checked and writing that was never submitted are submitted first, so
   * finishing does not silently drop work the candidate did. A no-op while any check or grading
   * request is in flight, because completing before it lands would leave that answer out of the
   * result. Every pending submission runs to the end even if another fails, so a retry does not
   * re-grade writing that was already graded.
   */
  finish(): void {
    const s = this.session();
    if (!s || this.finishing() || this.busy()) return;

    const reading = s.items.reading
      .filter((item) => !this.readingResult()[item.id])
      .map((item) => this.readingSubmission(item));
    const listening = s.items.listening.flatMap((item) =>
      item.questions.map((_, qi) =>
        this.listeningResult()[this.lkey(item.id, qi)] ? null : this.listeningSubmission(item, qi),
      ),
    );
    const writing = s.items.writing
      .filter((task) => !this.writingResult()[task.id])
      .map((task) => this.writingSubmission(task))
      .filter((o) => o !== null);
    const pending = [...reading, ...listening, ...writing]
      .filter((o) => o !== null)
      .map((o) =>
        o.pipe(
          map(() => true),
          catchError(() => of(false)),
        ),
      );

    const n = writing.length;
    this.finishStatus.set(
      n ? `Grading ${n} writing ${n === 1 ? 'response' : 'responses'}…` : 'Scoring…',
    );
    this.finishError.set(null);
    this.finishing.set(true);
    let submitted = true;
    (pending.length ? forkJoin(pending) : of([]))
      .pipe(
        switchMap((oks) => {
          submitted = oks.every(Boolean);
          return submitted ? this.examApi.complete(s.id) : throwError(() => new Error('submit'));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res) => {
          this.finalResult.set(res);
          this.finishing.set(false);
          this.finishStatus.set('');
          // <main> is the shell's scroll container, not the window, so move focus to the result
          // heading: that scrolls it into view here and announces the outcome to a screen reader.
          afterNextRender(() => this.resultsHeading()?.nativeElement.focus(), {
            injector: this.injector,
          });
        },
        error: () => {
          this.finishing.set(false);
          this.finishStatus.set('');
          this.finishError.set(
            submitted
              ? 'The session could not be finished. Try again.'
              : 'Some answers could not be submitted, so the session was not finished. Try again.',
          );
        },
      });
  }

  // The error interceptor has already reported a failed request; a manual check or submit just
  // leaves the item unscored so the candidate can retry, rather than rethrowing unhandled.
  private fire(submission: Observable<unknown> | null): void {
    submission?.pipe(catchError(() => EMPTY), takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  private readingSubmission(item: ReadingItem): Observable<unknown> | null {
    const chosen = this.readingChoice()[item.id];
    const id = this.session()?.id;
    if (!chosen || !id) return null;
    return this.tracked(
      this.checking,
      item.id,
      this.examApi
        .submit(id, { itemType: 'reading', itemId: item.id, chosenLabel: chosen })
        .pipe(
          tap((res) => this.readingResult.update((m) => ({ ...m, [item.id]: res as McqResult }))),
        ),
    );
  }

  private listeningSubmission(item: ListeningItem, qi: number): Observable<unknown> | null {
    const key = this.lkey(item.id, qi);
    const chosen = this.listeningChoice()[key];
    const id = this.session()?.id;
    if (!chosen || !id) return null;
    return this.tracked(
      this.checking,
      key,
      this.examApi
        .submit(id, {
          itemType: 'listening',
          itemId: item.id,
          questionIndex: qi,
          chosenLabel: chosen,
        })
        .pipe(
          tap((res) => this.listeningResult.update((m) => ({ ...m, [key]: res as McqResult }))),
        ),
    );
  }

  private writingSubmission(task: WritingTask): Observable<unknown> | null {
    const text = this.writingText()[task.id];
    const id = this.session()?.id;
    if (!text?.trim() || !id) return null;
    return this.tracked(
      this.grading,
      task.id,
      this.examApi
        .submit(id, {
          itemType: 'writing',
          itemId: task.id,
          optionKey: this.writingOption()[task.id],
          responseText: text,
        })
        .pipe(
          tap((res) =>
            this.writingResult.update((m) => ({ ...m, [task.id]: res as WritingResult })),
          ),
        ),
    );
  }

  /** Flag `key` in `flags` from subscription until the request settles or is cancelled. */
  private tracked(
    flags: WritableSignal<Record<string, boolean>>,
    key: string,
    request: Observable<unknown>,
  ): Observable<unknown> {
    return defer(() => {
      flags.update((m) => ({ ...m, [key]: true }));
      return request.pipe(finalize(() => flags.update((m) => ({ ...m, [key]: false }))));
    });
  }
}
