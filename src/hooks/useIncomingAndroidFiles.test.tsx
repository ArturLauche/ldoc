import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { useIncomingAndroidFiles } from './useIncomingAndroidFiles';

const mocks = vi.hoisted(() => ({ pendingFiles: vi.fn(), releaseFile: vi.fn(), addListener: vi.fn(), read: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/native/bridge', () => ({ isAndroid: () => true, NativeFiles: mocks }));
vi.mock('@/lib/native/files', () => ({ readNativeFile: mocks.read }));

describe('incoming Android documents', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('keeps a queued batch flowing across the editor replacement transition', async () => {
    mocks.pendingFiles.mockReset().mockResolvedValueOnce({ files: [{ id: 'one' }, { id: 'two' }] }).mockResolvedValue({ files: [] });
    mocks.read.mockImplementation((file: { id: string }) => Promise.resolve(new File([file.id], `${file.id}.txt`)));
    mocks.releaseFile.mockResolvedValue(undefined);
    mocks.addListener.mockResolvedValue({ remove: mocks.remove });
    let finish: () => void = () => {};
    const first = new Promise<void>((resolve) => { finish = resolve; });
    const onFile = vi.fn().mockImplementationOnce(() => first).mockResolvedValue(undefined);
    const { rerender, unmount } = renderHook(({ ready }) => useIncomingAndroidFiles(ready, onFile), { initialProps: { ready: true }, wrapper: LocaleProvider });
    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(1));
    // Session replacement briefly makes chrome inert, then ready again.
    rerender({ ready: false });
    rerender({ ready: true });
    await act(async () => { finish(); });
    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(2));
    expect(mocks.releaseFile).toHaveBeenCalledWith({ id: 'one' });
    expect(mocks.releaseFile).toHaveBeenCalledWith({ id: 'two' });
    unmount();
    await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
  });
  it('drains a second notification received while the first import is still running', async () => {
    let notify: () => void = () => {};
    mocks.addListener.mockImplementation((_event: string, callback: () => void) => {
      notify = callback;
      return Promise.resolve({ remove: mocks.remove });
    });
    mocks.pendingFiles.mockResolvedValueOnce({ files: [{ id: 'one' }] }).mockResolvedValueOnce({ files: [{ id: 'two' }] }).mockResolvedValue({ files: [] });
    mocks.read.mockImplementation((file: { id: string }) => Promise.resolve(new File([file.id], `${file.id}.txt`)));
    mocks.releaseFile.mockResolvedValue(undefined);
    let finish: () => void = () => {};
    const first = new Promise<void>((resolve) => { finish = resolve; });
    const onFile = vi.fn().mockImplementationOnce(() => first).mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useIncomingAndroidFiles(true, onFile), { wrapper: LocaleProvider });
    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(1));
    act(() => { notify(); });
    expect(mocks.pendingFiles).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(2));
    expect(onFile.mock.calls[1][0].name).toBe('two.txt');
    await waitFor(() => expect(mocks.releaseFile).toHaveBeenCalledWith({ id: 'two' }));
    unmount();
  });
});
