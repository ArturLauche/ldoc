import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { deliverNativeBlob, pickFileBatch, pickFiles, readNativeFile } from './files';
import { MAX_DOCUMENT_BYTES } from '@/lib/documentLimits';

const bridge = vi.hoisted(() => ({
  isAndroid: vi.fn(() => true),
  NativeFiles: { pickFiles: vi.fn(), readChunk: vi.fn(), releaseFile: vi.fn(), beginExport: vi.fn(), writeChunk: vi.fn(), finishExport: vi.fn() },
}));
vi.mock('./bridge', () => bridge);
const file = { id: '12345678-1234-1234-1234-123456789012', name: 'report.txt', mimeType: 'text/plain', size: 5 };
const blob = (text: string) => new NodeBlob([text], { type: 'text/plain' }) as unknown as Blob;

describe('Android file bridge', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    bridge.isAndroid.mockReturnValue(true);
    bridge.NativeFiles.beginExport.mockResolvedValue({ id: file.id });
    bridge.NativeFiles.readChunk.mockResolvedValue({ data: btoa('hello') });
    bridge.NativeFiles.releaseFile.mockResolvedValue(undefined);
    bridge.NativeFiles.finishExport.mockResolvedValue({ completed: true });
  });
  it('validates metadata before reading a native stream', async () => {
    for (const changed of [{ size: MAX_DOCUMENT_BYTES + 1 }, { size: -1 }, { size: 1.5 }, { id: '../../file' }]) {
      await expect(readNativeFile({ ...file, ...changed })).rejects.toThrow();
    }
    expect(bridge.NativeFiles.readChunk).not.toHaveBeenCalled();
    const result = await readNativeFile(file);
    expect(result.name).toBe('report.txt');
    expect(result.type).toBe('text/plain');
    expect(result.size).toBe(5);
  });
  it('rejects incomplete and oversized chunks instead of importing partial documents', async () => {
    bridge.NativeFiles.readChunk.mockResolvedValue({ data: '' });
    await expect(readNativeFile(file)).rejects.toThrow('Incomplete');
    bridge.NativeFiles.readChunk.mockResolvedValue({ data: btoa('toolong') });
    await expect(readNativeFile(file)).rejects.toThrow('Incomplete');
  });
  it('releases selected staging files even if a provider read fails', async () => {
    bridge.NativeFiles.pickFiles.mockResolvedValue({ files: [file] });
    bridge.NativeFiles.readChunk.mockRejectedValue(new Error('Provider unavailable'));
    await expect(pickFiles({ accept: '.txt', kind: 'document' })).rejects.toThrow('Provider');
    expect(bridge.NativeFiles.releaseFile).toHaveBeenCalledWith({ id: file.id });
  });
  it('stages an export and only reports a completed native save', async () => {
    expect(await deliverNativeBlob(blob('hello'), 'report.txt', 'save')).toBe(true);
    expect(bridge.NativeFiles.writeChunk).toHaveBeenCalledWith({ id: file.id, offset: 0, data: btoa('hello') });
    expect(bridge.NativeFiles.finishExport).toHaveBeenCalledWith({ id: file.id, action: 'save' });
    expect(bridge.NativeFiles.releaseFile).toHaveBeenCalled();
    bridge.NativeFiles.finishExport.mockResolvedValue({ completed: false });
    expect(await deliverNativeBlob(blob('hello'), 'report.txt', 'save')).toBe(false);
  });
  it('releases staging after native sharing moves the recipient-visible file', async () => {
    await deliverNativeBlob(blob('hello'), 'report.txt', 'share');
    expect(bridge.NativeFiles.releaseFile).toHaveBeenCalledWith({ id: file.id });
    bridge.NativeFiles.releaseFile.mockClear();
    bridge.NativeFiles.writeChunk.mockRejectedValue(new Error('Storage full'));
    await expect(deliverNativeBlob(blob('hello'), 'report.txt', 'save')).rejects.toThrow('Storage full');
    expect(bridge.NativeFiles.releaseFile).toHaveBeenCalledWith({ id: file.id });
  });
  it('reads a batch lazily and releases unread files if the import stops', async () => {
    const second = { ...file, id: '12345678-1234-1234-1234-123456789013', name: 'second.txt' };
    const third = { ...file, id: '12345678-1234-1234-1234-123456789014', name: 'third.txt' };
    bridge.NativeFiles.pickFiles.mockResolvedValue({ files: [file, second, third] });
    const batch = pickFileBatch({ accept: '.txt', kind: 'document', multiple: true });
    const first = await batch.next();
    expect(first.value).toMatchObject({ name: 'report.txt' });
    expect(bridge.NativeFiles.readChunk).toHaveBeenCalledTimes(1);
    expect(bridge.NativeFiles.releaseFile).not.toHaveBeenCalled();
    const next = await batch.next();
    expect(next.value).toMatchObject({ name: 'second.txt' });
    expect(bridge.NativeFiles.readChunk).toHaveBeenCalledTimes(2);
    expect(bridge.NativeFiles.releaseFile).toHaveBeenCalledWith({ id: file.id });
    await batch.return(undefined);
    expect(bridge.NativeFiles.readChunk).toHaveBeenCalledTimes(2);
    expect(bridge.NativeFiles.releaseFile).toHaveBeenCalledWith({ id: second.id });
    expect(bridge.NativeFiles.releaseFile).toHaveBeenCalledWith({ id: third.id });
  });
  it('releases the rest of a batch when a provider read fails', async () => {
    const second = { ...file, id: '12345678-1234-1234-1234-123456789013' };
    bridge.NativeFiles.pickFiles.mockResolvedValue({ files: [file, second] });
    bridge.NativeFiles.readChunk.mockRejectedValue(new Error('Provider unavailable'));
    const batch = pickFileBatch({ accept: '.txt', kind: 'document', multiple: true });
    await expect(batch.next()).rejects.toThrow('Provider');
    expect(bridge.NativeFiles.releaseFile).toHaveBeenCalledWith({ id: file.id });
    expect(bridge.NativeFiles.releaseFile).toHaveBeenCalledWith({ id: second.id });
  });
  it('splits large exports into bounded messages with consecutive offsets', async () => {
    await deliverNativeBlob(blob('x'.repeat(192 * 1024 + 10)), 'large.txt', 'save');
    expect(bridge.NativeFiles.writeChunk).toHaveBeenCalledTimes(2);
    expect(bridge.NativeFiles.writeChunk.mock.calls[1][0]).toMatchObject({ offset: 192 * 1024 });
  });
  it('uses the normal browser picker and treats cancellation as no selection', async () => {
    bridge.isAndroid.mockReturnValue(false);
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      this.dispatchEvent(new Event('cancel'));
    });
    expect(await pickFiles({ accept: '.txt', kind: 'document' })).toEqual([]);
    expect(bridge.NativeFiles.pickFiles).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
