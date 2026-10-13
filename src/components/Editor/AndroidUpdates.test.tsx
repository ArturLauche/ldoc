import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { AndroidUpdates } from './AndroidUpdates';
import type { AndroidUpdateState } from '@/lib/native/bridge';

const mocks = vi.hoisted(() => ({
  check: vi.fn(), prepare: vi.fn(), install: vi.fn(),
  state: { installedVersion: '1.0.0', installedCode: 1_000_000, availableVersion: '1.1.0', availableCode: 1_001_000, phase: 'ready', downloadedBytes: 100, totalBytes: 100, canInstall: false } as AndroidUpdateState,
}));
vi.mock('@/hooks/useAndroidUpdater', () => ({ useAndroidUpdater: () => ({ state: mocks.state, check: mocks.check, bridgeError: false }) }));
vi.mock('@/lib/native/lifecycle', () => ({ prepareNativeDeparture: mocks.prepare }));
vi.mock('@/lib/native/bridge', () => ({ NativeUpdater: { install: mocks.install } }));

describe('Android update interface', () => {
  beforeEach(() => {
    mocks.prepare.mockReset().mockResolvedValue(true);
    mocks.install.mockReset().mockResolvedValue({ permissionRequired: false });
    mocks.check.mockReset();
    mocks.state.phase = 'ready';
  });
  const open = async () => {
    render(<LocaleProvider><AndroidUpdates /></LocaleProvider>);
    const user = userEvent.setup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Install LWrite 1.1.0' }));
    return user;
  };
  it('offers a verified update without interrupting typing and saves before installation', async () => {
    const user = await open();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Install update' }));
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.install.mock.invocationCallOrder[0]);
  });
  it('does not open the installer if document saving fails', async () => {
    mocks.prepare.mockResolvedValue(false);
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Install update' }));
    expect(mocks.install).not.toHaveBeenCalled();
  });
  it('allows a manual check and disables official updates in development builds', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(mocks.check).toHaveBeenCalledOnce();
    mocks.state.phase = 'disabled';
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'App updates' }));
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Install update' })).not.toBeInTheDocument();
  });
});
