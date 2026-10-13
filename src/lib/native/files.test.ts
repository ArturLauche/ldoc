import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { deliverNativeBlob, pickFiles, readNativeFile } from './files';
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
  it('keeps a shared file readable to other apps and cleans up failed transfers', async () => {
    await deliverNativeBlob(blob('hello'), 'report.txt', 'share');
    expect(bridge.NativeFiles.releaseFile).not.toHaveBeenCalled();
    bridge.NativeFiles.writeChunk.mockRejectedValue(new Error('Storage full'));
    await expect(deliverNativeBlob(blob('hello'), 'report.txt', 'save')).rejects.toThrow('Storage full');
    expect(bridge.NativeFiles.releaseFile).toHaveBeenCalledWith({ id: file.id });
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
