import { afterEach, describe, expect, it, vi } from 'vitest';
import { openFilePicker } from './filePicker';

describe('openFilePicker', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hands over the chosen files and ignores a cancelled chooser', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const onSelect = vi.fn();
    expect(openFilePicker({ accept: '.txt', multiple: true, onSelect })).toBe(true);
    const input = click.mock.contexts[0] as HTMLInputElement;
    expect(input).toMatchObject({ type: 'file', accept: '.txt', multiple: true });

    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    expect(onSelect).toHaveBeenCalledWith([file]);

    const cancelled = vi.fn();
    openFilePicker({ accept: '.txt', onSelect: cancelled });
    const second = click.mock.contexts[1] as HTMLInputElement;
    Object.defineProperty(second, 'files', { value: [] });
    second.dispatchEvent(new Event('change'));
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('reports a chooser the browser refuses to open', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(openFilePicker({ accept: '.txt', onSelect: vi.fn() })).toBe(false);
  });
});
