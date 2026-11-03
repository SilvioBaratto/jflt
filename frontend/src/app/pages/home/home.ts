import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  DestroyRef,
  WritableSignal,
  effect,
  untracked,
} from '@angular/core';
import { I18nPluralPipe } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ContentService } from '../../services/content';
import { LanguageService } from '../../services/language';
import { ContentList, ReadingSummary, ListeningSummary, WritingSummary } from '../../models/content';

type LoadState = 'loading' | 'error' | 'ready';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatCardModule, MatButtonModule, MatProgressSpinnerModule, I18nPluralPipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
/** The question bank: counts and browsable lists of the reading/listening/writing material. */
export class HomeComponent {
  private readonly content = inject(ContentService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inFlight = new Map<string, Subscription>();

  // The ICU plural syntax needs the $localize polyfill, which the app does not load; the pipe
  // gives the same CLDR plural handling without it. '#' is replaced by the count.
  protected readonly itemsPlural = { '=1': 'item', other: 'items' };
  protected readonly questionsPlural = { '=1': '# question', other: '# questions' };

  readonly reading = signal<ContentList<ReadingSummary> | null>(null);
  readonly listening = signal<ContentList<ListeningSummary> | null>(null);
  readonly writing = signal<ContentList<WritingSummary> | null>(null);

  // A null list cannot tell loading from failure, so each section tracks its own state.
  readonly readingState = signal<LoadState>('loading');
  readonly listeningState = signal<LoadState>('loading');
  readonly writingState = signal<LoadState>('loading');

  constructor() {
    // Runs once on creation (the first load) and again on every language switch. The loads are
    // untracked so the effect depends on the language alone, not on whatever the services read.
    effect(() => {
      this.language.language();
      untracked(() => {
        this.loadReading();
        this.loadListening();
        this.loadWriting();
      });
    });
  }

  loadReading(): void {
    this.load('reading', this.content.reading(), this.reading, this.readingState);
  }

  loadListening(): void {
    this.load('listening', this.content.listening(), this.listening, this.listeningState);
  }

  loadWriting(): void {
    this.load('writing', this.content.writing(), this.writing, this.writingState);
  }

  private load<T>(
    key: string,
    source: Observable<T>,
    data: WritableSignal<T | null>,
    state: WritableSignal<LoadState>,
  ): void {
    // A response for the previous language must not land over the new one, so a reload cancels
    // the request still in flight for the same section.
    this.inFlight.get(key)?.unsubscribe();
    // Clearing the data also hides the previous language's total in the section heading, which would
    // otherwise label the new list while it loads.
    data.set(null);
    state.set('loading');
    this.inFlight.set(
      key,
      source.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (v) => {
          data.set(v);
          state.set('ready');
        },
        error: () => state.set('error'),
      }),
    );
  }
}
