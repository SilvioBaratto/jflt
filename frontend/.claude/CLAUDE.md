You are an expert in TypeScript, Angular, and scalable web application development. You write maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use `@HostBinding`/`@HostListener`; put host bindings in the `host` object of the decorator
- Use `NgOptimizedImage` for all static images (not for inline base64)

## Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in the `@Component` decorator
- Prefer Reactive forms over Template-driven ones
- Do NOT use `ngClass`/`ngStyle`; use `class`/`style` bindings instead
- Split every component into `<name>.ts`, `<name>.html` and `<name>.css`, wired with `templateUrl` and `styleUrl`; no inline `template` or `styles`. Directives and services without a template stay `.ts` only

## State Management

- Use signals for local component state and `computed()` for derived state
- Do NOT use `mutate` on signals; use `update` or `set`
- `effect()` is for side effects only; never copy signal→signal in an effect — use `computed()`

## Templates

- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables

## Services

- Design services around a single responsibility
- Use `providedIn: 'root'` for singleton services
- Use the `inject()` function instead of constructor injection

## Styling with Angular Material 3

- The UI is built with Angular Material 3 (Angular Material + CDK 21.2). Use the matching Material component first; build only the gaps (such as the navigation bar and rail) on `--mat-sys-*` tokens
- There is no utility-class CSS framework and there are no global utility classes: style with Material components plus each component's own CSS. A component at a screen edge pads itself by `env(safe-area-inset-*)`, which works because `src/index.html` sets `viewport-fit=cover`
- `src/styles.scss` owns the theme: `mat.theme()` on `html` emits every color, typography, shape and elevation value as a `--mat-sys-*` token (density 0). Don't add a second theme or per-component palettes
- Component CSS uses tokens only: colors from `--mat-sys-*` roles (content on a container uses its `on-` role; `--mat-sys-outline` is for borders, never text), type as `font: var(--mat-sys-<role>)` plus `letter-spacing: var(--mat-sys-<role>-tracking)`, shape from `--mat-sys-corner-*`, elevation from `--mat-sys-level0` to `--mat-sys-level5`
- No hex, `rgb()` or `hsl()` color literals, no `!important` and no `::ng-deep` in component CSS
- Success, warning and info have no M3 role: use `--app-success`, `--app-on-success`, `--app-success-container` and `--app-on-success-container` (and the same for `warning` and `info`), defined once in `src/styles.scss`. `success` shares the green palette with the tertiary accent, so `--app-success*` and `--mat-sys-tertiary*` resolve to the same colors: always pair a status color with an icon or text
- Tune a Material component by setting its token custom properties (for example `--mat-button-filled-container-color`) in the component's CSS, not by overriding its internal classes
- Custom interactive elements show state layers with `--mat-sys-hover-state-layer-opacity`, `--mat-sys-focus-state-layer-opacity` and `--mat-sys-pressed-state-layer-opacity`, and a keyboard focus ring outside the element with a gap
- Spacing sits on the 4/8px grid

## Light and dark

- The app is light-only. A script in `src/index.html` pins an inline `color-scheme: light` on `<html>` from the first frame, `src/styles.scss` sets `color-scheme: light`, and `ThemeService` (`src/app/services/theme.ts`, injected at startup by `app.config.ts`) applies `.light` and removes that inline pin. Its `isDark` is constant `false`, so stored `app-theme` values and the OS preference never change the scheme
- No surface offers a theme choice: the rail, the compact shell and the (unrouted) Settings page show none. `setTheme`, the OS listener, `THEME_OPTIONS`, the compact actions sheet and the sidebar's `modal` mode remain from the scaffold but are unreachable
- `.light` and `.dark` only set `color-scheme`, which picks the light or dark value of every `--mat-sys-*` token. There is no dark stylesheet or dark variant to maintain, so re-enabling dark mode means making `isDark` follow the stored choice again and restoring a picker
- A region that forces a scheme (`class="dark"` on a subtree) must paint its own `background` and `color` from `--mat-sys-*` tokens

## Overlay panels

- Dialogs, snackbars, menus and tooltips render in the body-level `.cdk-overlay-container`, which component CSS can't reach
- Style a panel from the owning component's global partial in `src/styles/overlays/` (`@use`d by `src/styles.scss`), selected by the `panelClass` the component passes to `MatDialog`, `MatBottomSheet` or `MatSnackBar`. On `mat-menu`, use a static `class`: its `panelClass` input is an alias of `class`

## Window size classes and navigation

- Layout follows the M3 window size classes: compact below 600px, medium 600–839px, expanded 840–1199px, large 1200–1599px, extra-large from 1600px
- In TypeScript, read `WindowSizeClassService` (`src/app/services/window-size-class.ts`): `current()`, `isCompact()` and `atLeast(sizeClass)`
- In CSS, repeat the same literals: `(max-width: 599.98px)`, `(min-width: 600px)`, `(min-width: 840px)`, `(min-width: 1200px)`, `(min-width: 1600px)`. Prefer CSS when only styles change; use the service when the component tree differs
- Never use the CDK `Breakpoints` presets (600/960/1280/1920) or a 768px breakpoint
- The shell (`src/app/shared/layout/`) follows the M3 navigation pattern strictly. Below 600px: a top app bar plus a navigation bar (`app-bottom-tab-bar`, 64px + `env(safe-area-inset-bottom)` tall); the top app bar holds the brand and the content language selector (`app-language-selector`; with no theme or account actions there is no actions button). From 600px: a collapsed navigation rail docked in `mat-sidenav` whose footer holds the same selector, collapsed or expanded; from 840px a toggle expands it; from 1600px it starts expanded, unless the user has toggled the rail: that choice is stored in localStorage (`app-rail-expanded`, `RAIL_EXPANDED_STORAGE_KEY` in `layout.ts`) and wins at every width from 840px, across reloads. There is no navigation drawer, and the bar and the rail never show the same destinations at one width
- Destinations live in `NAV_ITEMS` (`src/app/shared/nav-item.ts`); the bar and the rail both render that list

## Icons

- Icons come from `lucide-angular`, registered by PascalCase name in `src/app/icons.ts`. Register an icon there before using it: an unregistered name throws `The "<name>" icon has not been provided by any available icon providers.` when the icon's inputs are set
- Icons default to 24px. Inside a text, filled, outlined or tonal Material button, add `matButtonIcon` (plus `iconPositionEnd` when the icon trails) and `[size]="18"`. `matIconButton` sizes its icon to 24px itself
- Material's button icon margins target `.mat-icon` only, so give a `lucide-icon` host inside such a button `display: flex`, `flex-shrink: 0` and `margin-inline: -8px 8px` when it leads (`8px -8px` when it trails; -4px instead of -8px on text buttons)
- Lucide hides icons from assistive technology, so name the action on the control instead (`aria-label` on icon buttons, without role words such as "button")

## Accessibility and copy

- Interactive targets are at least 48×48px; text contrast is at least 4.5:1 (3:1 for large text, icons and component boundaries) in both schemes
- One `h1` per routed view with no skipped heading levels. When a landmark role repeats (for example two `nav` elements, or a `nav` beside a `mat-nav-list`, which renders `role="navigation"`), give each a distinct `aria-label`; a single `main` needs none
- Every pointer interaction has a keyboard path; Esc closes modal surfaces and focus returns to the trigger
- `src/styles.scss` honours `prefers-reduced-motion` for every animation and transition, including the router's view transitions (`::view-transition-*`). Material's indeterminate progress indicators keep their slowed animation
- Screen-reader-only text uses `.cdk-visually-hidden`
- Buttons and menu items use a specific verb ("Delete item", not "OK"), and all UI text uses sentence case
- No trailing period on labels, tooltips, list items, links, dialog body text or any single-sentence message; use periods only when there are several sentences

## Testing

- `ng test` runs Vitest through `@angular/build:unit-test` with zoneless change detection (`src/test-providers.ts`); import `vi` from `vitest`
- Query Material components through their test harnesses (`@angular/material/<component>/testing` with `TestbedHarnessEnvironment`) rather than internal class names
- Dialogs, snackbars and menus render in `document.body`'s `.cdk-overlay-container`, not inside the fixture
- jsdom has no `window.matchMedia`: define it with `Object.defineProperty` (see `theme.spec.ts`) or provide a fake `MediaMatcher` (see `window-size-class.spec.ts`)

## Security

- Never use `bypassSecurityTrust*` APIs or bind untrusted data to `[innerHTML]`; Angular's built-in sanitization is the only safe path
- `src/index.html` puts `ngCspNonce="CSP_NONCE"` on `<app-root>`. `nginx.conf` replaces `CSP_NONCE` with `$request_id`, a fresh random value on every request, through `sub_filter`, and allows that nonce in the `script-src` and `style-src` of its `Content-Security-Policy`; any other server for `index.html` must do the same. The build copies the nonce onto inline `<script>` and `<style>` tags (including the critical-CSS loader), and Angular adds it to every component style it injects
- That policy blocks a static `style="…"` attribute in a template, because Angular writes it with `setAttribute`: bind `[style.<property>]` or use the component's CSS instead
