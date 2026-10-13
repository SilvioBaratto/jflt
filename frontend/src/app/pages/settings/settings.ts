import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-settings',
  imports: [MatCardModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Settings page. Appearance is fixed to light mode, so it offers no theme choice. */
export class SettingsComponent {}
