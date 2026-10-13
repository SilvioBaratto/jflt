import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ExamService } from '../../services/exam';
import { CreateSessionBody } from '../../models/exam';

@Component({
  selector: 'app-launch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="launch">
      <mat-spinner diameter="40" />
      <p>{{ label() }}</p>
    </div>
  `,
  styles: `
    .launch {
      display: grid;
      place-items: center;
      gap: 1rem;
      min-height: 60vh;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
/** Thin launcher for a sidebar mode: creates the session, then redirects to the runner. */
export class LaunchComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly exam = inject(ExamService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly label = signal('Starting…');

  ngOnInit(): void {
    const data = this.route.snapshot.data as {
      mode: 'practice' | 'exam';
      skill?: 'reading' | 'listening' | 'writing';
      label?: string;
    };
    this.label.set(data.label ?? 'Starting…');
    const body: CreateSessionBody = { mode: data.mode, skill: data.skill, adaptive: true };
    this.exam
      .create(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => this.router.navigate(['/session', s.id], { replaceUrl: true }),
        error: () => this.label.set('Could not start. Please go back and try again.'),
      });
  }
}
