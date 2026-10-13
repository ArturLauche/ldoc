import type { AndroidUpdateState } from './bridge';

/** Bridge replies and progress events may arrive after an activity recreation. */
export function validateUpdateState(value: unknown): value is AndroidUpdateState {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return typeof data.installedVersion === 'string' && Number.isSafeInteger(data.installedCode) &&
    typeof data.phase === 'string' && ['disabled', 'idle', 'checking', 'current', 'downloading', 'ready', 'error'].includes(data.phase) &&
    typeof data.canInstall === 'boolean' &&
    typeof data.downloadedBytes === 'number' && Number.isFinite(data.downloadedBytes) && data.downloadedBytes >= 0 &&
    typeof data.totalBytes === 'number' && Number.isFinite(data.totalBytes) && data.totalBytes >= 0 &&
    (data.availableVersion === undefined || typeof data.availableVersion === 'string') &&
    (data.availableCode === undefined || Number.isSafeInteger(data.availableCode)) &&
    (data.lastChecked === undefined || (typeof data.lastChecked === 'number' && Number.isFinite(data.lastChecked))) &&
    (data.error === undefined || (typeof data.error === 'string' && ['network', 'release', 'integrity', 'incompatible', 'storage', 'installer', 'rate-limit'].includes(data.error)));
}

export function updateProgress(state: Pick<AndroidUpdateState, 'downloadedBytes' | 'totalBytes'>): number {
  if (state.totalBytes <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor(state.downloadedBytes / state.totalBytes * 100)));
}
