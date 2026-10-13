import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./shared/layout/layout').then((m) => m.LayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/home/home').then((m) => m.HomeComponent),
        title: 'Question bank',
      },
      {
        path: 'reading',
        loadComponent: () => import('./pages/launch/launch').then((m) => m.LaunchComponent),
        data: { mode: 'practice', skill: 'reading', label: 'Starting reading practice…' },
        title: 'Reading',
      },
      {
        path: 'listening',
        loadComponent: () => import('./pages/launch/launch').then((m) => m.LaunchComponent),
        data: { mode: 'practice', skill: 'listening', label: 'Starting listening practice…' },
        title: 'Listening',
      },
      {
        path: 'writing',
        loadComponent: () => import('./pages/launch/launch').then((m) => m.LaunchComponent),
        data: { mode: 'practice', skill: 'writing', label: 'Starting writing practice…' },
        title: 'Writing',
      },
      {
        path: 'full',
        loadComponent: () => import('./pages/launch/launch').then((m) => m.LaunchComponent),
        data: { mode: 'practice', label: 'Starting full practice…' },
        title: 'Full',
      },
      {
        path: 'exam',
        loadComponent: () => import('./pages/launch/launch').then((m) => m.LaunchComponent),
        data: { mode: 'exam', label: 'Starting mock exam…' },
        title: 'Exam',
      },
      {
        path: 'session/:id',
        loadComponent: () => import('./pages/session/session').then((m) => m.SessionComponent),
        title: 'Session',
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
