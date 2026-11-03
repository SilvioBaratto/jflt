import { ChangeDetectionStrategy, Component, Signal, computed, inject, input, output, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatRipple } from '@angular/material/core';
import {
  MatActionList,
  MatListItem,
  MatListItemIcon,
  MatListItemTitle,
  MatNavList,
} from '@angular/material/list';
import { MatTooltip } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { LanguageSelectorComponent } from '../language-selector/language-selector';
import { NavItem, NAV_ITEMS, RailActionsSheet, SidebarMode } from '../nav-item';
import { NavSectionService } from '../nav-section';

/** Re-exported for consumers that import the rail modes next to the component. */
export type { SidebarMode } from '../nav-item';

/**
 * Names of the compact bottom sheet that holds this rail's actions. The base scaffold has no
 * account and no theme control, so the sheet is effectively empty and its trigger is not shown.
 */
export const RAIL_ACTIONS_SHEET: RailActionsSheet = {
  triggerLabel: 'Open actions',
  sheetLabel: 'Actions',
  triggerIcon: 'Settings2',
};

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatRipple,
    MatIconButton,
    MatTooltip,
    MatNavList,
    MatActionList,
    MatListItem,
    MatListItemIcon,
    MatListItemTitle,
    LucideAngularModule,
    LanguageSelectorComponent,
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Navigation rail contents: destinations, the content language selector and (in the auth variants)
 * account actions. Light mode only — no theme choice.
 */
export class SidebarComponent {
  /** Rail form to render; see {@link SidebarMode}. */
  readonly mode = input<SidebarMode>('expanded');

  /** Asks the host to close the surface: the compact sheet dismisses after a destination or sign out. */
  readonly closeSidebar = output<void>();

  navItems: NavItem[] = NAV_ITEMS;

  /** Destination a session page belongs to, since its URL no longer names it. */
  protected readonly navSection = inject(NavSectionService).current;

  /** Name shown in the account row; null in the base scaffold (no session), so the row is omitted. */
  readonly accountName: Signal<string | null> = signal(null);

  /** Whether Sign out shows; false in the base scaffold (no session). */
  readonly canSignOut: Signal<boolean> = signal(false);

  /** Destinations show in the docked rails only; the compact bar already lists them. */
  readonly showDestinations = computed(() => this.mode() !== 'modal');
  readonly collapsed = computed(() => this.mode() === 'collapsed');
  readonly modal = computed(() => this.mode() === 'modal');

  onNavClick(): void {
    this.closeSidebar.emit();
  }

  /** No session to end in the base scaffold (Sign out doesn't render). Auth overlays sign out here. */
  onLogout(): void {
    this.closeSidebar.emit();
  }
}
