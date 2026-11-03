import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  OnInit,
  inject,
  signal,
  DestroyRef,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ExamService } from '../../services/exam';
import { CreateSessionBody } from '../../models/exam';
import { LanguageService } from '../../services/language';

type LaunchData = {
  mode: 'practice' | 'exam';
  skill?: 'reading' | 'listening' | 'writing';
  label?: string;
};

@Component({
  selector: 'app-launch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './launch.html',
  styleUrl: './launch.css',
})
/** Thin launcher for a sidebar mode: creates the session, then redirects to the runner. */
export class LaunchComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly exam = inject(ExamService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  readonly title = signal('Starting');
  readonly label = signal('Starting…');
  readonly failed = signal(false);

  private data: LaunchData = { mode: 'practice' };

  ngOnInit(): void {
    this.data = this.route.snapshot.data as LaunchData;
    const { mode, skill } = this.data;
    this.title.set(
      mode === 'exam' ? 'Mock exam' : skill ? `${cap(skill)} practice` : 'Full practice',
    );
    this.label.set(this.data.label ?? 'Starting…');
    this.start(false);
  }

  /** Creates the session; a retry moves focus to the heading so the changed state is read from the top. */
  start(moveFocus = true): void {
    this.failed.set(false);
    if (moveFocus) this.heading().nativeElement.focus();
    const body: CreateSessionBody = {
      mode: this.data.mode,
      skill: this.data.skill,
      adaptive: true,
      language: this.language.language(),
    };
    this.exam
      .create(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => this.router.navigate(['/session', s.id], { replaceUrl: true }),
        error: () => {
          this.failed.set(true);
          // Focus survives on the h1 so the role=alert text is announced without losing position.
          this.heading().nativeElement.focus();
        },
      });
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
