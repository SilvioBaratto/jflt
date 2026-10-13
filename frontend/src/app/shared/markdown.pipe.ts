import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

/**
 * Render a Markdown string to an HTML string for binding through `[innerHTML]`.
 *
 * The output is meant to be bound with Angular's default `[innerHTML]` sanitiser left in place —
 * this pipe never calls `bypassSecurityTrust*` — so model-generated passages are stripped of
 * scripts and event handlers before they reach the DOM. Nullish or empty input yields `''`.
 *
 * @example
 * ```html
 * <div class="md" [innerHTML]="item.passage | markdown"></div>
 * ```
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  /** Convert `value` from Markdown to sanitisable HTML; returns `''` when there is nothing to render. */
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return marked.parse(value, { async: false, gfm: true });
  }
}
