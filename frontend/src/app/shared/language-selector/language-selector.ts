import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { LucideAngularModule } from 'lucide-angular';

import { LANGUAGE_OPTIONS, LanguageOption, LanguageService } from '../../services/language';

/**
 * Icon button that opens a menu to choose the content language. The shell renders it in the
 * rail footer and in the compact top app bar, so both share one control.
 *
 * Choosing a language calls {@link LanguageService.setLanguage} and announces the change politely.
 * Choosing the current one only closes the menu. MatMenu returns focus to the trigger on close and
 * handles arrow keys, Enter, Space and Esc.
 */
@Component({
  selector: 'app-language-selector',
  imports: [MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger, LucideAngularModule],
  templateUrl: './language-selector.html',
  styleUrl: './language-selector.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSelectorComponent {
  private readonly languageService = inject(LanguageService);
  private readonly announcer = inject(LiveAnnouncer);

  protected readonly options = LANGUAGE_OPTIONS;
  protected readonly language = this.languageService.language;

  /** Names the control by what it sets and its current value, since the icon alone says neither. */
  protected readonly triggerLabel = computed(() => {
    const current = this.options.find((option) => option.value === this.language());
    return `Content language, current: ${current?.label ?? this.language()}`;
  });

  protected select(option: LanguageOption): void {
    if (option.value === this.language()) {
      return;
    }
    this.languageService.setLanguage(option.value);
    this.announcer.announce(`Content language changed to ${option.label}`, 'polite');
  }
}
