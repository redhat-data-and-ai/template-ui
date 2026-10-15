import { describe, it, expect, beforeEach } from 'vitest';
import reducer, { setDensity } from '../userSettings';

/**
 * Density has to survive a reload.
 *
 * The first version applied instantly and reverted on refresh,
 * because the reducer changed state without persisting it — which
 * reads as the control not working rather than as a storage bug.
 */
describe('density setting', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to comfortable', () => {
    expect(reducer(undefined, { type: '@@INIT' }).density).toBe('comfortable');
  });

  it('is written to storage when changed', () => {
    reducer(undefined, setDensity('compact'));
    const key = Object.keys(localStorage).find((k) => k.includes('settings'));
    expect(key).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(key!)!).density).toBe('compact');
  });

  it('falls back when storage holds a value it does not understand', () => {
    // Storage is editable by anyone with devtools; an unknown value
    // must not reach a CSS selector.
    reducer(undefined, setDensity('compact'));
    const key = Object.keys(localStorage).find((k) => k.includes('settings'))!;
    localStorage.setItem(key, JSON.stringify({ density: 'enormous' }));
    expect(['comfortable', 'compact']).toContain(
      reducer(undefined, { type: '@@INIT' }).density,
    );
  });
});
