import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { LucideIconConfig } from 'lucide-angular';

import { ICON_PROVIDER } from '../../icons';
import { ThemeService } from '../../services/theme';
import { SidebarComponent, SidebarMode } from './sidebar';

/**
 * Cross-component integration: the app is light-only, so no sidebar variant offers a theme
 * choice and the real ThemeService keeps exactly one `.light` class on <html> whatever is stored
 * or preferred by the OS. jsdom has no window.matchMedia, so it is defined.
 */
describe('Theme menu (integration)', () => {
  let fixture: ComponentFixture<SidebarComponent>;

  function schemeClasses(): string[] {
    return ['light', 'dark'].filter((name) => document.documentElement.classList.contains(name));
  }

  async function setup(mode: SidebarMode): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter([]),
        ICON_PROVIDER,
        LucideIconConfig,
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();

    TestBed.inject(ThemeService);
    fixture = TestBed.createComponent(SidebarComponent);
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
  }

  function stubMatchMedia(prefersDark: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          matches: prefersDark,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
        }) as unknown as MediaQueryList,
    });
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light', 'theme-transitioning');
    stubMatchMedia(false);
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark', 'light', 'theme-transitioning');
    localStorage.clear();
  });

  describe.each(['expanded', 'collapsed', 'modal'] as const)('%s sidebar', (mode) => {
    it('when the sidebar renders, no theme control is offered', async () => {
      await setup(mode);
      const el: HTMLElement = fixture.nativeElement;
      expect(
        el.querySelectorAll(
          'mat-selection-list, mat-button-toggle, mat-slide-toggle, [role="menuitemradio"], ' +
            '[role="radio"], [role="switch"]',
        ).length,
      ).toBe(0);
      // Destinations stay; what must not come back is any control named for a scheme.
      const named = Array.from(el.querySelectorAll('button, a[href], [role="menuitem"]')).filter((c) =>
        /theme|dark|system/i.test(`${c.getAttribute('aria-label') ?? ''} ${c.textContent ?? ''}`),
      );
      expect(named).toEqual([]);
    });
  });

  it('when the OS prefers light and nothing is stored, the light scheme is applied', async () => {
    await setup('expanded');
    expect(schemeClasses()).toEqual(['light']);
  });

  it('when Dark is stored and the OS prefers dark, the light scheme is still applied', async () => {
    localStorage.setItem('app-theme', 'dark');
    stubMatchMedia(true);
    await setup('expanded');
    expect(schemeClasses()).toEqual(['light']);
  });
});
