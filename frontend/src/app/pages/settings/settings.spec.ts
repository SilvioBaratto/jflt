import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsComponent } from './settings';

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SettingsComponent] }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  it('when the settings page renders, it has one h1 and an Appearance h2', async () => {
    const el = await render();
    const h1s = el.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent?.trim()).toBe('Settings');
    expect(el.querySelector('h2')?.textContent?.trim()).toBe('Appearance');
  });

  it('when the settings page renders, the appearance section is a region named by its heading', async () => {
    const el = await render();
    const section = el.querySelector('section')!;
    const headingId = section.getAttribute('aria-labelledby');
    expect(headingId).toBeTruthy();
    expect(el.querySelector(`#${headingId}`)?.textContent?.trim()).toBe('Appearance');
  });

  it('when the settings page renders, no theme choice is offered because the app is light-only', async () => {
    const el = await render();
    const controls = el.querySelectorAll(
      'button, a[href], input, select, mat-select, mat-slide-toggle, mat-button-toggle, ' +
        '[role="radio"], [role="radiogroup"], [role="switch"], [role="menuitemradio"], [aria-haspopup]',
    );
    expect(controls.length).toBe(0);
    expect(el.querySelector('.settings-card-subtitle')?.textContent?.trim()).toBe(
      'The interface uses a light theme',
    );
  });
});
