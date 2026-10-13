import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export const isAndroid = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export interface NativeFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

interface FilesPlugin {
  pickFiles(options: { kind: 'document' | 'library' | 'mixed' | 'image'; multiple: boolean }): Promise<{ files: NativeFile[] }>;
  readChunk(options: { id: string; offset: number }): Promise<{ data: string }>;
  releaseFile(options: { id: string }): Promise<void>;
  pendingFiles(): Promise<{ files: NativeFile[]; error?: string }>;
  beginExport(options: { name: string; mimeType: string; size: number }): Promise<{ id: string }>;
  writeChunk(options: { id: string; offset: number; data: string }): Promise<void>;
  finishExport(options: { id: string; action: 'save' | 'share' | 'print' }): Promise<{ completed: boolean }>;
  addListener(event: 'incomingFiles', listener: () => void): Promise<PluginListenerHandle>;
}

export type UpdatePhase = 'disabled' | 'idle' | 'checking' | 'current' | 'downloading' | 'ready' | 'error';
export type UpdateError = 'network' | 'release' | 'integrity' | 'incompatible' | 'storage' | 'installer' | 'rate-limit';
export interface AndroidUpdateState {
  installedVersion: string;
  installedCode: number;
  availableVersion?: string;
  availableCode?: number;
  phase: UpdatePhase;
  downloadedBytes: number;
  totalBytes: number;
  lastChecked?: number;
  error?: UpdateError;
  canInstall: boolean;
}

interface UpdaterPlugin {
  getState(): Promise<AndroidUpdateState>;
  check(options: { manual: boolean }): Promise<AndroidUpdateState>;
  install(): Promise<{ permissionRequired: boolean }>;
  addListener(event: 'stateChanged', listener: (state: AndroidUpdateState) => void): Promise<PluginListenerHandle>;
}

export const NativeFiles = registerPlugin<FilesPlugin>('LWriteFiles');
export const NativeUpdater = registerPlugin<UpdaterPlugin>('LWriteUpdater');
