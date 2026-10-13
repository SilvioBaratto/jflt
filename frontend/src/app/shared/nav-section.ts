import { Injectable, signal } from '@angular/core';

/**
 * Maps a session to the navigation destination that started it. The launch routes (`/reading`,
 * `/full`, `/exam`, ...) redirect to `/session/:id`, so the URL no longer names the destination.
 *
 * @param session - The loaded session's mode and optional skill.
 * @returns The `NAV_ITEMS` route to show as current.
 */
export function sectionRoute(session: { mode: string; skill?: string | null }): string {
  if (session.mode === 'exam') return '/exam';
  return session.skill ? `/${session.skill}` : '/full';
}

/**
 * The destination the current page belongs to when its URL does not say so. The navigation rail
 * and bar show it as current alongside the router's own match.
 */
@Injectable({ providedIn: 'root' })
export class NavSectionService {
  private readonly route = signal<string | null>(null);

  /** The `NAV_ITEMS` route to treat as current, or null when the URL alone decides. */
  readonly current = this.route.asReadonly();

  /** Set the current destination; pass null to clear it. */
  set(route: string | null): void {
    this.route.set(route);
  }
}
