import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { vi } from 'vitest';
import { LucideIconConfig } from 'lucide-angular';

import { ICON_PROVIDER } from '../../icons';
import { LanguageService } from '../../services/language';
import { LanguageSelectorComponent } from './language-selector';

/** Material's menu reads the legacy keyCode, which jsdom's KeyboardEvent init does not set. */
function pressEscape(target: HTMLElement): void {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { get: () => 27 });
  target.dispatchEvent(event);
}

describe('LanguageSelectorComponent', () => {
  let fixture: ComponentFixture<LanguageSelectorComponent>;
  let service: LanguageService;
  let menu: MatMenuHarness;

  async function render(stored?: string): Promise<void> {
    if (stored) {
      localStorage.setItem('app-content-language', stored);
    }
    await TestBed.configureTestingModule({
      imports: [LanguageSelectorComponent],
      providers: [
        ICON_PROVIDER,
        LucideIconConfig,
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();

    service = TestBed.inject(LanguageService);
    fixture = TestBed.createComponent(LanguageSelectorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    menu = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatMenuHarness);
  }

  function trigger(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  /** Menu items render in the body-level overlay container, outside the fixture. */
  function items(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>('.cdk-overlay-container [role="menuitemradio"]'),
    );
  }

  /** The menu panel detaches in a timeout after it closes, so a task must pass before the overlay is empty. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => {
    localStorage.clear();
  });

  describe('trigger', () => {
    it('when rendered, it is one icon button named for the content language and its current value', async () => {
      await render();
      expect(fixture.nativeElement.querySelectorAll('button').length).toBe(1);
      expect(trigger().getAttribute('aria-label')).toBe('Content language, current: English');
      expect(trigger().textContent?.trim()).toBe('');
    });

    it('when rendered, its Languages icon is decorative: the control is named by aria-label', async () => {
      await render();
      const icon = trigger().querySelector('lucide-icon');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(icon?.querySelector('svg')).toBeTruthy();
    });

    it('when rendered, it announces a closed menu to assistive technology', async () => {
      await render();
      expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
    });

    it('when rendered, it keeps the 48px touch target of Material icon buttons', async () => {
      await render();
      expect(trigger().querySelector('.mat-mdc-button-touch-target')).toBeTruthy();
    });

    it('when the stored language is Spanish, the name says Español', async () => {
      await render('es');
      expect(trigger().getAttribute('aria-label')).toBe('Content language, current: Español');
    });
  });

  describe('menu', () => {
    it('when opened, it lists English and Español as menuitemradio items with the current one checked', async () => {
      await render();
      await menu.open();

      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      expect(items().map((item) => item.textContent?.trim())).toEqual(['English', 'Español']);
      expect(items().map((item) => item.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    });

    it('when the stored language is Spanish, Español is the checked item', async () => {
      await render('es');
      await menu.open();
      expect(items().map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    });

    it('when opened, each label carries the lang of its own language', async () => {
      await render();
      await menu.open();
      const langs = items().map((item) => item.querySelector('[lang]')?.getAttribute('lang'));
      expect(langs).toEqual(['en', 'es']);
    });

    it('when opened, the menu is named Content language', async () => {
      await render();
      await menu.open();
      const panel = document.querySelector('.cdk-overlay-container [role="menu"]');
      expect(panel?.getAttribute('aria-label')).toBe('Content language');
    });

    it('when opened, only the checked item shows a check mark: selection is not color alone', async () => {
      await render();
      await menu.open();
      expect(items().map((item) => item.querySelector('lucide-icon') !== null)).toEqual([
        true,
        false,
      ]);
      // Every item keeps the same decorative leading slot, so the labels stay aligned.
      for (const item of items()) {
        expect(item.querySelector('.language-option-mark')?.getAttribute('aria-hidden')).toBe(
          'true',
        );
      }
    });
  });

  describe('choosing a language', () => {
    it('when Español is chosen, setLanguage("es") is called and the name follows', async () => {
      await render();
      const setLanguage = vi.spyOn(service, 'setLanguage');
      await menu.open();
      await menu.clickItem({ text: 'Español' });
      await settle();

      expect(setLanguage).toHaveBeenCalledTimes(1);
      expect(setLanguage).toHaveBeenCalledWith('es');
      expect(service.language()).toBe('es');
      expect(trigger().getAttribute('aria-label')).toBe('Content language, current: Español');
    });

    it('when a language is chosen, the menu closes and focus returns to the trigger', async () => {
      await render();
      await menu.open();
      await menu.clickItem({ text: 'Español' });
      await settle();

      expect(await menu.isOpen()).toBe(false);
      expect(items().length).toBe(0);
      expect(document.activeElement).toBe(trigger());
    });

    it('when the language changes, it is announced politely', async () => {
      await render();
      const announce = vi.spyOn(TestBed.inject(LiveAnnouncer), 'announce');
      await menu.open();
      await menu.clickItem({ text: 'Español' });

      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith('Content language changed to Español', 'polite');
    });

    it('when the current language is chosen again, nothing changes or is announced, and the menu closes', async () => {
      await render();
      const setLanguage = vi.spyOn(service, 'setLanguage');
      const announce = vi.spyOn(TestBed.inject(LiveAnnouncer), 'announce');
      await menu.open();
      await menu.clickItem({ text: 'English' });
      await settle();

      expect(setLanguage).not.toHaveBeenCalled();
      expect(announce).not.toHaveBeenCalled();
      expect(await menu.isOpen()).toBe(false);
      expect(document.activeElement).toBe(trigger());
    });

    it('when the language changes elsewhere, the name and the checked item follow the service', async () => {
      await render();
      service.setLanguage('es');
      await settle();

      expect(trigger().getAttribute('aria-label')).toBe('Content language, current: Español');
      await menu.open();
      expect(items().map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    });
  });

  describe('keyboard', () => {
    it('when Esc is pressed in the open menu, it closes and focus returns to the trigger', async () => {
      await render();
      const setLanguage = vi.spyOn(service, 'setLanguage');
      await menu.open();

      const panel = document.querySelector<HTMLElement>('.cdk-overlay-container [role="menu"]')!;
      pressEscape(panel);
      await settle();

      expect(await menu.isOpen()).toBe(false);
      expect(setLanguage).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(trigger());
    });

    it('when the menu opens, its items are native buttons that can take focus', async () => {
      await render();
      await menu.open();
      for (const item of items()) {
        expect(item.tagName).toBe('BUTTON');
        item.focus();
        expect(document.activeElement).toBe(item);
      }
    });
  });
});
