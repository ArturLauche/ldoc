import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './download';

describe('downloadBlob', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let originalCreate: typeof URL.createObjectURL;
  let originalRevoke: typeof URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn(() => 'blob:fake-url');
    revokeObjectURL = vi.fn();
    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates a download anchor, triggers click, and removes it', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'remove');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    downloadBlob(blob, 'My Report.txt');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });

  it('does not revoke the object URL synchronously after click', () => {
    downloadBlob(new Blob(['hello']), 'a.txt');
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the object URL after a delay', () => {
    downloadBlob(new Blob(['hello']), 'a.txt');
    vi.advanceTimersByTime(60_001);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('uses noopener on the temporary anchor', () => {
    const created: HTMLAnchorElement[] = [];
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = originalCreateElement(tag);
      if (tag === 'a') created.push(element as HTMLAnchorElement);
      return element;
    });

    downloadBlob(new Blob(['hello']), 'a.txt');

    expect(created[0]?.rel).toBe('noopener');
  });
});
