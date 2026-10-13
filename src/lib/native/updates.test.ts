import { describe, expect, it } from 'vitest';
import { updateProgress, validateUpdateState } from './updates';
import type { AndroidUpdateState } from './bridge';

const state: AndroidUpdateState = { installedVersion: '1.0.0', installedCode: 1_000_000, phase: 'ready', downloadedBytes: 100, totalBytes: 100, canInstall: false, availableVersion: '1.1.0', availableCode: 1_001_000 };
describe('updater bridge replies', () => {
  it('accepts valid native status while rejecting corrupt responses', () => {
    expect(validateUpdateState(state)).toBe(true);
    for (const value of [null, [], {}, { ...state, phase: 'install-silently' }, { ...state, downloadedBytes: NaN }, { ...state, totalBytes: -1 }, { ...state, installedCode: 1.2 }, { ...state, error: 'arbitrary' }]) expect(validateUpdateState(value)).toBe(false);
  });
  it('keeps progress within bounds including unknown lengths', () => {
    expect(updateProgress({ downloadedBytes: 0, totalBytes: 0 })).toBe(0);
    expect(updateProgress({ downloadedBytes: 5, totalBytes: 10 })).toBe(50);
    expect(updateProgress({ downloadedBytes: 11, totalBytes: 10 })).toBe(100);
  });
});
