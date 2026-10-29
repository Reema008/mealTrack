import { describe, expect, it } from 'vitest';
import { resolveTheme } from '../../src/lib/theme';

describe('light / dark theme choice', () => {
  it('an explicit choice wins over the phone setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('"system" follows the phone setting', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
