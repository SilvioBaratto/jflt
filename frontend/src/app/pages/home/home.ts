import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  DestroyRef,
  WritableSignal,
} from '@angular/core';
import { I18nPluralPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ContentService } from '../../services/content';
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
export class HomeComponent implements OnInit {
  private readonly content = inject(ContentService);
  private readonly destroyRef = inject(DestroyRef);

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

  ngOnInit(): void {
    this.loadReading();
    this.loadListening();
    this.loadWriting();
  }

  loadReading(): void {
    this.load(this.content.reading(), this.reading, this.readingState);
  }

  loadListening(): void {
    this.load(this.content.listening(), this.listening, this.listeningState);
  }

  loadWriting(): void {
    this.load(this.content.writing(), this.writing, this.writingState);
  }

  private load<T>(source: Observable<T>, data: WritableSignal<T | null>, state: WritableSignal<LoadState>): void {
    state.set('loading');
    source.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (v) => {
        data.set(v);
        state.set('ready');
      },
      error: () => state.set('error'),
    });
  }
}
