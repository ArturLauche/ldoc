import { describe, expect, it, vi } from 'vitest';
import { dismissNativeOverlay, flushNativeSession, prepareNativeDeparture, registerNativeSession } from './lifecycle';

describe('native departures', () => {
  it('awaits the session transaction and propagates a failed save', async () => {
    let finish: (saved: boolean) => void = () => {};
    const canLeave = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const dispose = registerNativeSession({ flush: async () => false, canLeave });
    const waiting = prepareNativeDeparture();
    expect(canLeave).toHaveBeenCalledOnce();
    finish(false);
    expect(await waiting).toBe(false);
    expect(await flushNativeSession()).toBe(false);
    dispose();
    expect(await prepareNativeDeparture()).toBe(true);
  });
  it('dismisses dialogs through Escape before leaving the editor', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    const listener = vi.fn();
    document.addEventListener('keydown', listener);
    expect(dismissNativeOverlay()).toBe(true);
    expect(listener.mock.calls[0][0].key).toBe('Escape');
    document.removeEventListener('keydown', listener);
    dialog.remove();
    expect(dismissNativeOverlay()).toBe(false);
  });
});
