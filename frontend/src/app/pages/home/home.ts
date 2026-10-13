import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ContentService } from '../../services/content';
import { ContentList, ReadingSummary, ListeningSummary, WritingSummary } from '../../models/content';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatCardModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
/** The question bank: counts and browsable lists of the reading/listening/writing material. */
export class HomeComponent implements OnInit {
  private readonly content = inject(ContentService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reading = signal<ContentList<ReadingSummary> | null>(null);
  readonly listening = signal<ContentList<ListeningSummary> | null>(null);
  readonly writing = signal<ContentList<WritingSummary> | null>(null);

  ngOnInit(): void {
    this.content.reading().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (r) => this.reading.set(r) });
    this.content.listening().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (r) => this.listening.set(r) });
    this.content.writing().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (r) => this.writing.set(r) });
  }
}
