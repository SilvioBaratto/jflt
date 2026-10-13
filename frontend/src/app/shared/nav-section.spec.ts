import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { NavSectionService, sectionRoute } from './nav-section';

describe('sectionRoute', () => {
  it.each([
    [{ mode: 'practice', skill: 'reading' }, '/reading'],
    [{ mode: 'practice', skill: 'listening' }, '/listening'],
    [{ mode: 'practice', skill: 'writing' }, '/writing'],
    [{ mode: 'practice', skill: null }, '/full'],
    [{ mode: 'practice' }, '/full'],
    [{ mode: 'exam', skill: null }, '/exam'],
  ])('when the session is %o, the destination is %s', (session, route) => {
    expect(sectionRoute(session)).toBe(route);
  });

  it('when the session is a timed exam with a skill, exam wins', () => {
    expect(sectionRoute({ mode: 'exam', skill: 'reading' })).toBe('/exam');
  });
});

describe('NavSectionService', () => {
  it('when nothing is set, there is no current destination', () => {
    expect(TestBed.inject(NavSectionService).current()).toBeNull();
  });

  it('when a destination is set and then cleared, current follows', () => {
    const service = TestBed.inject(NavSectionService);
    service.set('/reading');
    expect(service.current()).toBe('/reading');
    service.set(null);
    expect(service.current()).toBeNull();
  });
});
