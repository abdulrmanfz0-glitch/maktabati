import { describe, it, expect } from 'vitest';
import { isPasteTooLarge, needsLowMemoryWarning, PASTE_MAX_CHARS, FILE_WARN_BYTES } from '../../apps/web/src/core/limits.js';

describe('upload limits', () => {
  it('rejects text above the paste cap', () => {
    expect(isPasteTooLarge('x'.repeat(PASTE_MAX_CHARS + 1))).toBe(true);
    expect(isPasteTooLarge('x'.repeat(PASTE_MAX_CHARS))).toBe(false);
  });
  it('warns only on low-memory devices and larger files', () => {
    expect(needsLowMemoryWarning(FILE_WARN_BYTES + 1, 4)).toBe(true);
    expect(needsLowMemoryWarning(FILE_WARN_BYTES + 1, 8)).toBe(false);
    expect(needsLowMemoryWarning(FILE_WARN_BYTES, 4)).toBe(false);
    expect(needsLowMemoryWarning(FILE_WARN_BYTES + 1, undefined)).toBe(false);
  });
});
