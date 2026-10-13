import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { environment } from '../../../environments/environment';
import { ExamService } from '../../services/exam';
import {
  Session,
  ReadingItem,
  ListeningItem,
  WritingTask,
  McqResult,
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
  ],
  templateUrl: './session.html',
  styleUrl: './session.css',
})
/** Runs one session: renders reading/listening/writing items, scores answers, and finishes to a result. */
export class SessionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly examApi = inject(ExamService);
  private readonly destroyRef = inject(DestroyRef);

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
  readonly finishing = signal(false);
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
    const chosen = this.readingChoice()[item.id];
    if (!chosen) return;
    const id = this.session()?.id;
    if (!id) return;
    this.examApi
      .submit(id, { itemType: 'reading', itemId: item.id, chosenLabel: chosen })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.readingResult.update((m) => ({ ...m, [item.id]: res as McqResult })),
      });
  }

  /** Record the chosen label for a listening question. */
  pickListening(itemId: string, qi: number, label: string): void {
    this.listeningChoice.update((m) => ({ ...m, [this.lkey(itemId, qi)]: label }));
  }

  /** Submit one listening question for scoring. */
  submitListening(item: ListeningItem, qi: number): void {
    const key = this.lkey(item.id, qi);
    const chosen = this.listeningChoice()[key];
    if (!chosen) return;
    const id = this.session()?.id;
    if (!id) return;
    this.examApi
      .submit(id, { itemType: 'listening', itemId: item.id, questionIndex: qi, chosenLabel: chosen })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.listeningResult.update((m) => ({ ...m, [key]: res as McqResult })),
      });
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
    const text = this.writingText()[task.id];
    if (!text?.trim()) return;
    const id = this.session()?.id;
    if (!id) return;
    this.grading.update((m) => ({ ...m, [task.id]: true }));
    this.examApi
      .submit(id, {
        itemType: 'writing',
        itemId: task.id,
        optionKey: this.writingOption()[task.id],
        responseText: text,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.writingResult.update((m) => ({ ...m, [task.id]: res as WritingResult }));
          this.grading.update((m) => ({ ...m, [task.id]: false }));
        },
        error: () => this.grading.update((m) => ({ ...m, [task.id]: false })),
      });
  }

  /** Finish the session and load the SLP-style result. */
  finish(): void {
    const id = this.session()?.id;
    if (!id || this.finishing()) return;
    this.finishing.set(true);
    this.examApi
      .complete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.finalResult.set(res);
          this.finishing.set(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        error: () => this.finishing.set(false),
      });
  }
}
