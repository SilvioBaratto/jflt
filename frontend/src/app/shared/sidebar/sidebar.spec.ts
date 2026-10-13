import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatNavListHarness } from '@angular/material/list/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, Routes, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { LucideIconConfig } from 'lucide-angular';

import { ICON_PROVIDER } from '../../icons';
import { NAV_ITEMS } from '../nav-item';
import { RAIL_ACTIONS_SHEET, SidebarComponent, SidebarMode } from './sidebar';

@Component({ selector: 'app-route-stub', template: '' })
class RouteStubComponent {}

const NAV_ROUTES: Routes = NAV_ITEMS.map((item) => ({ path: item.route.slice(1), component: RouteStubComponent }));

/** The sidebar's own stylesheet (component styles land in <head> while the fixture lives). */
function sidebarStyleText(): string {
  return Array.from(document.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .filter((text) => text.includes('.sidebar-footer'))
    .join('\n');
}

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;
  let loader: HarnessLoader;

  async function render(mode?: SidebarMode, routes: Routes = [], url?: string): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [
        provideRouter(routes),
        ICON_PROVIDER,
        LucideIconConfig,
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();

    if (url) {
      await TestBed.inject(Router).navigateByUrl(url);
    }
    fixture = TestBed.createComponent(SidebarComponent);
    if (mode) {
      fixture.componentRef.setInput('mode', mode);
    }
    loader = TestbedHarnessEnvironment.loader(fixture);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  describe('expanded rail (default mode)', () => {
    it('when the rail renders, destinations sit in a mat-nav-list labelled Primary', async () => {
      const el = await render();
      const list = el.querySelector('mat-nav-list');
      expect(list?.getAttribute('role')).toBe('navigation');
      // The same name as the compact navigation bar: one primary navigation, whatever its form.
      expect(list?.getAttribute('aria-label')).toBe('Primary');

      const navList = await loader.getHarness(MatNavListHarness);
      const items = await navList.getItems();
      expect(await Promise.all(items.map((i) => i.getTitle()))).toEqual(NAV_ITEMS.map((i) => i.name));
      expect(await Promise.all(items.map((i) => i.getHref()))).toEqual(NAV_ITEMS.map((i) => i.route));
    });

    it('when a destination is current, its item is activated with aria-current="page"', async () => {
      const el = await render('expanded', NAV_ROUTES, '/writing');

      const items = await (await loader.getHarness(MatNavListHarness)).getItems();
      expect(await Promise.all(items.map((i) => i.isActivated()))).toEqual(
        NAV_ITEMS.map((i) => i.route === '/writing'),
      );
      const current = el.querySelectorAll('a[aria-current="page"]');
      expect(current.length).toBe(1);
      expect(current[0].textContent).toContain('Writing');
    });

    it('when the rail renders, each item carries a decorative lucide-icon', async () => {
      const el = await render();
      const icons = el.querySelectorAll('mat-nav-list lucide-icon');
      expect(icons.length).toBe(NAV_ITEMS.length);
      icons.forEach((icon) => expect(icon.getAttribute('aria-hidden')).toBe('true'));
    });

    it('when a destination is clicked, closeSidebar is emitted', async () => {
      await render('expanded', NAV_ROUTES);
      const emitted = vi.fn();
      fixture.componentInstance.closeSidebar.subscribe(emitted);
      const [home] = await (await loader.getHarness(MatNavListHarness)).getItems();
      await home.click();
      expect(emitted).toHaveBeenCalledTimes(1);
    });

    it('when the rail renders without a session, it offers no actions: no theme control, account row or Sign out', async () => {
      const el = await render();
      expect(el.querySelector('mat-action-list')).toBeNull();
      expect(el.querySelector('.sidebar-footer')).toBeNull();
      expect(fixture.componentInstance.accountName()).toBeNull();
      expect(fixture.componentInstance.canSignOut()).toBe(false);
      expect(el.querySelector('.sidebar-account')).toBeNull();
      expect(el.querySelector('.sidebar-logout')).toBeNull();
      expect(el.textContent).not.toContain('Sign out');
    });
  });

  describe('light-only theme', () => {
    it('when the rail renders in any mode, it has no theme control: the app is light only', async () => {
      for (const mode of ['expanded', 'collapsed', 'modal'] as const) {
        TestBed.resetTestingModule();
        const el = await render(mode);
        expect(el.querySelector('.sidebar-theme-toggle')).toBeNull();
        expect(el.querySelector('[aria-haspopup="menu"]')).toBeNull();
        expect(el.querySelector('mat-selection-list')).toBeNull();
        expect(el.textContent).not.toMatch(/theme|dark/i);
      }
    });

    it('when a list item is clicked, it shows no focus state layer: that overlay is for keyboard focus only', async () => {
      await render();
      expect(sidebarStyleText()).toMatch(
        /\.mat-mdc-list-item(?:\[[^\]]+\])*:not\(:focus-visible\)[^{}]*\{[^}]*--mat-list-list-item-focus-state-layer-opacity:\s*0/,
      );
    });
  });

  describe('enlarged text', () => {
    it('when text is enlarged, the wider rails wrap their list text and grow instead of truncating it', async () => {
      await render();
      const css = sidebarStyleText();
      expect(css).toMatch(/--mat-list-list-item-one-line-container-height:\s*auto/);
      expect(css).toMatch(/\.mat-mdc-list-item(?:\[[^\]]+\])*\s*\{[^}]*min-block-size:\s*56px/);
      expect(css).toMatch(/\.mat-mdc-list-item-title[^{}]*\{[^}]*white-space:\s*normal/);
    });

    it('when text is enlarged, collapsed rail labels never break inside a word (the shell widens the rail instead)', async () => {
      await render('collapsed');
      const css = sidebarStyleText();
      expect(css).toMatch(/\.rail-label(?:\[[^\]]+\])*\s*\{[^}]*overflow-wrap:\s*normal/);
      expect(css).toMatch(/\.rail-label(?:\[[^\]]+\])*\s*\{[^}]*hyphens:\s*manual/);
      expect(css).not.toMatch(/\.rail-label(?:\[[^\]]+\])*\s*\{[^}]*(?:overflow-wrap:\s*anywhere|word-break:\s*break-all|hyphens:\s*auto)/);
    });
  });

  describe('current destination cue', () => {
    it('when a destination is current in the expanded rail, its label turns bold, not only its fill color', async () => {
      await render('expanded', NAV_ROUTES, '/writing');
      expect(sidebarStyleText()).toMatch(
        /\.mdc-list-item--activated[^{}]*\{[^}]*--mat-list-list-item-label-text-weight:\s*var\(--mat-sys-label-large-weight-prominent\)/,
      );
      // The rule's selector matches the rendered current item (the harness waits for routerLinkActive).
      await (await loader.getHarness(MatNavListHarness)).getItems();
      const current = fixture.nativeElement.querySelector('a[aria-current="page"]');
      expect(current?.classList.contains('mdc-list-item--activated')).toBe(true);
    });
  });

  describe('right-to-left', () => {
    it('when the layout is RTL, directional rail icons (Sign out) mirror', async () => {
      await render('collapsed');
      expect(sidebarStyleText()).toMatch(
        /\[dir=['"]?rtl['"]?\][^{}]*\.sidebar-icon-directional[^{}]*\{[^}]*transform:\s*scaleX\(-1\)/,
      );
    });
  });

  describe('collapsed rail', () => {
    it('when collapsed, destinations are icon-over-label links in a nav labelled Primary', async () => {
      const el = await render('collapsed');
      expect(el.querySelector('mat-nav-list')).toBeNull();
      const nav = el.querySelector('nav');
      expect(nav?.getAttribute('aria-label')).toBe('Primary');

      const links = Array.from(nav!.querySelectorAll<HTMLAnchorElement>('a.rail-item'));
      expect(links.map((a) => a.textContent?.trim())).toEqual(NAV_ITEMS.map((i) => i.name));
      for (const link of links) {
        expect(link.hasAttribute('aria-label')).toBe(false);
        expect(link.querySelector('.rail-indicator lucide-icon')?.getAttribute('aria-hidden')).toBe('true');
      }
    });

    it('when collapsed and a destination is current, that link has aria-current="page"', async () => {
      const el = await render('collapsed', NAV_ROUTES, '/reading');
      const current = el.querySelectorAll('a.rail-item[aria-current="page"]');
      expect(current.length).toBe(1);
      expect(current[0].textContent?.trim()).toBe('Reading');
    });

    it('when collapsed without a session, no action button renders', async () => {
      const el = await render('collapsed');
      expect(el.querySelector('button')).toBeNull();
      expect(el.querySelector('.sidebar-logout')).toBeNull();
    });
  });

  describe('modal form (compact bottom sheet)', () => {
    it('when modal, no destination is repeated from the navigation bar', async () => {
      const el = await render('modal');
      expect(el.querySelector('nav')).toBeNull();
      expect(el.querySelector('mat-nav-list')).toBeNull();
      expect(el.querySelectorAll('a').length).toBe(0);
    });

    it('when modal, nothing renders: the base scaffold has no actions to hold', async () => {
      const el = await render('modal');
      expect(el.querySelector('.sidebar-account')).toBeNull();
      expect(el.querySelector('mat-action-list')).toBeNull();
      expect(el.querySelector('mat-selection-list')).toBeNull();
      expect(el.querySelector('button')).toBeNull();
      expect(el.textContent?.trim()).toBe('');
    });
  });

  describe('compact sheet names', () => {
    it('when the base scaffold names the sheet, the names describe its generic actions', () => {
      expect(RAIL_ACTIONS_SHEET).toEqual({
        triggerLabel: 'Open actions',
        sheetLabel: 'Actions',
        triggerIcon: 'Settings2',
      });
    });
  });
});
