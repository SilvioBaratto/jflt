import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MediaMatcher } from '@angular/cdk/layout';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatBottomSheetHarness } from '@angular/material/bottom-sheet/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Router, Routes, provideRouter } from '@angular/router';
import { LucideIconConfig } from 'lucide-angular';

import { ICON_PROVIDER } from '../../icons';
import { WINDOW_SIZE_QUERIES, WindowSizeClass } from '../../services/window-size-class';
import { RAIL_ACTIONS_SHEET } from '../sidebar/sidebar';
import { LayoutComponent } from './layout';

@Component({ selector: 'app-route-stub', template: '' })
class RouteStubComponent {}

/** jsdom has no matchMedia: a MediaMatcher that matches exactly one M3 window size class. */
function mediaMatcherFor(active: WindowSizeClass): Partial<MediaMatcher> {
  return {
    matchMedia: (query: string) =>
      ({
        matches: query === WINDOW_SIZE_QUERIES[active],
        media: query,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  };
}

/** ThemeService (rendered by the rail) reads window.matchMedia directly. */
function defineWindowMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  });
}

/** Lets overlays (the bottom sheet) finish opening or closing, then renders. */
async function flush(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('LayoutComponent', () => {
  let fixture: ComponentFixture<LayoutComponent>;
  let host: HTMLElement;

  const routes: Routes = [
    { path: '', pathMatch: 'full', component: RouteStubComponent, title: 'Question bank' },
    { path: 'home', component: RouteStubComponent, title: 'Home' },
    { path: 'dashboard', component: RouteStubComponent, title: 'Dashboard' },
  ];

  async function render(size: WindowSizeClass = 'compact'): Promise<void> {
    defineWindowMatchMedia();
    await TestBed.configureTestingModule({
      imports: [LayoutComponent],
      providers: [
        provideRouter(routes),
        // SpyLocation: back() emits a popstate the router handles like the browser's.
        provideLocationMocks(),
        ICON_PROVIDER,
        LucideIconConfig,
        { provide: MediaMatcher, useValue: mediaMatcherFor(size) },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LayoutComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function navigate(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    document.documentElement.classList.remove('dark', 'light', 'theme-transitioning');
    localStorage.clear();
    // jsdom has no matchMedia and every spec shares one window: a stub left behind reaches unrelated
    // specs, where its missing listener methods surface as unhandled errors.
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('when the shell renders from 600px, app-sidebar is hosted in the docked mat-sidenav rail', async () => {
    await render('medium');
    expect(host.querySelector('mat-sidenav-container mat-sidenav#app-rail app-sidebar')).toBeTruthy();
  });

  it('when the shell renders at compact, no rail renders and the navigation bar closes mat-sidenav-content', async () => {
    await render();
    expect(host.querySelector('mat-sidenav')).toBeNull();
    const content = host.querySelector('mat-sidenav-content')!;
    expect(content.lastElementChild?.tagName.toLowerCase()).toBe('app-bottom-tab-bar');
  });

  it('when the shell renders, main is the single, unlabelled main landmark and the skip-link target', async () => {
    await render();
    const main = host.querySelector('mat-sidenav-content main');
    expect(host.querySelectorAll('main').length).toBe(1);
    expect(main?.id).toBe('main-content');
    expect(main?.getAttribute('tabindex')).toBe('-1');
    // One main landmark needs no label; "Main content" would only repeat the role.
    expect(main?.hasAttribute('aria-label')).toBe(false);
  });

  it('when the shell renders, a skip link to main-content is the first element', async () => {
    await render();
    const skipLink = host.firstElementChild;
    expect(skipLink?.matches('a.skip-link[href="#main-content"]')).toBe(true);
    expect(skipLink?.textContent?.trim()).toBe('Skip to content');
  });

  it('when the skip link is activated, focus moves to main in code instead of following the hash', async () => {
    await render();
    const skipLink = host.querySelector<HTMLAnchorElement>('a.skip-link')!;
    const main = host.querySelector<HTMLElement>('#main-content')!;

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    skipLink.dispatchEvent(click);

    // <base href="/"> would turn the hash into a full navigation to /#main-content.
    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(main);
  });

  it('when the shell renders, a visually hidden aria-live route announcer is present', async () => {
    await render();
    const announcer = host.querySelector('.cdk-visually-hidden[aria-live="polite"]');
    expect(announcer).toBeTruthy();
    expect(announcer?.getAttribute('aria-atomic')).toBe('true');
  });

  it('when navigation ends, the announcer reads the new page title', async () => {
    await render();
    await navigate('/dashboard');
    expect(host.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('Dashboard');
  });

  it('when the shell renders, no toast outlet exists (toasts open as MatSnackBar overlays)', async () => {
    await render();
    expect(host.querySelector('#toast-outlet')).toBeNull();
    expect(host.querySelector('app-toast')).toBeNull();
  });

  it('when the top app bar renders at compact, it holds the brand and the language selector but no actions-sheet button', async () => {
    await render();
    const navbar = host.querySelector('app-navbar')!;
    expect(navbar.querySelector('header')).toBeTruthy();
    expect(navbar.querySelector('[navbarBrand]')?.textContent?.trim()).toBe('JFLT');
    expect(navbar.querySelector('.navbar-actions app-language-selector')).toBeTruthy();
    // The base scaffold's sheet is empty (no theme or account controls), so nothing may promise it.
    const buttons = Array.from(navbar.querySelectorAll('button'));
    expect(buttons.length).toBe(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Content language, current: English');
    expect(navbar.querySelector('.shell-actions-toggle')).toBeNull();
  });

  it('when the shell renders at compact, the language selector is in the top app bar only', async () => {
    await render();
    expect(host.querySelectorAll('app-language-selector').length).toBe(1);
    expect(host.querySelector('app-bottom-tab-bar app-language-selector')).toBeNull();
  });

  it('when the shell renders from 600px, the language selector is in the rail footer only', async () => {
    await render('medium');
    expect(host.querySelectorAll('app-language-selector').length).toBe(1);
    expect(host.querySelector('mat-sidenav#app-rail .sidebar-footer app-language-selector')).toBeTruthy();
  });

  it('when the language selector is in the shell, it does not add a landmark: one banner and one Primary navigation remain', async () => {
    await render('medium');
    expect(host.querySelectorAll('[role="banner"]').length).toBe(1);
    expect(host.querySelectorAll('nav, [role="navigation"]').length).toBe(1);
  });

  it('when the actions sheet opens, a modal bottom sheet holds app-sidebar in its modal form', async () => {
    await render();
    fixture.componentInstance.openActionsSheet();
    await flush(fixture);

    const sheet = await TestbedHarnessEnvironment.documentRootLoader(fixture).getHarness(MatBottomSheetHarness);
    expect(await sheet.getAriaLabel()).toBe(RAIL_ACTIONS_SHEET.sheetLabel);
    // The panel class the global overlay partial can select the sheet by.
    const pane = document.querySelector('.cdk-overlay-pane.app-shell-actions-sheet');
    expect(pane?.querySelector('.mat-bottom-sheet-container[role="dialog"] app-shell-actions-sheet app-sidebar')).toBeTruthy();
    expect(pane?.querySelectorAll('a').length).toBe(0);
  });

  it('when the shell is destroyed with the actions sheet open, the sheet closes with it', async () => {
    await render();
    fixture.componentInstance.openActionsSheet();
    await flush(fixture);
    expect(document.querySelector('app-shell-actions-sheet')).toBeTruthy();

    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve));
    await new Promise((resolve) => setTimeout(resolve));
    expect(document.querySelector('app-shell-actions-sheet')).toBeNull();
  });

  it('when the first navigation ends, focus stays off main so the skip link stays reachable', async () => {
    await render();
    await navigate('/home');
    expect(document.activeElement).not.toBe(host.querySelector('#main-content'));
  });

  it('when a later navigation ends, focus moves to main-content', async () => {
    await render();
    const main = host.querySelector<HTMLElement>('#main-content')!;
    await navigate('/home');
    await navigate('/dashboard');
    expect(document.activeElement).toBe(main);
  });

  it('when the shell is compact, the top app bar brand links to the question bank', async () => {
    await render();
    const brand = host.querySelector<HTMLAnchorElement>('app-navbar a.brand-link')!;
    expect(brand.getAttribute('href')).toBe('/');
    await navigate('/home');
    expect(brand.hasAttribute('aria-current')).toBe(false);
    await navigate('/');
    expect(brand.getAttribute('aria-current')).toBe('page');
  });

  it('when the rail is collapsed, the brand link to the question bank is still in the rail header', async () => {
    await render('medium');
    const brand = host.querySelector<HTMLAnchorElement>('.rail-header a.rail-brand')!;
    expect(brand.getAttribute('href')).toBe('/');
    expect(host.querySelector('.rail-header app-hamburger')).toBeNull();
    await navigate('/home');
    expect(brand.hasAttribute('aria-current')).toBe(false);
    await navigate('/');
    expect(brand.getAttribute('aria-current')).toBe('page');
  });

  it('when a navigation ends, main (the only scroll container) starts the new page at the top', async () => {
    await render();
    await navigate('/home');
    const main = host.querySelector<HTMLElement>('#main-content')!;
    main.scrollTop = 240;

    await navigate('/dashboard');
    expect(main.scrollTop).toBe(0);
  });

  it('when the browser goes back, main restores the offset the previous page was left at', async () => {
    await render();
    // TestBed never bootstraps, so the router's popstate listener has to be attached by hand.
    TestBed.inject(Router).setUpLocationChangeListener();
    await navigate('/home');
    const main = host.querySelector<HTMLElement>('#main-content')!;
    main.scrollTop = 240;
    await navigate('/dashboard');
    main.scrollTop = 60;

    TestBed.inject(Location).back();
    // The router schedules a popstate navigation in a timeout, which whenStable() can't see yet.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/home');
    expect(main.scrollTop).toBe(240);
    expect(document.activeElement).toBe(main);
  });

  it('when the window is medium or wider, neither the top app bar nor the navigation bar renders', async () => {
    await render('medium');
    expect(host.querySelector('app-navbar')).toBeNull();
    expect(host.querySelector('app-bottom-tab-bar')).toBeNull();
    expect(host.querySelector('mat-sidenav-content main#main-content')).toBeTruthy();
  });
});
