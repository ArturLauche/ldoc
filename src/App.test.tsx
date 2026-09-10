import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./pages/Index', () => ({
  default: () => <main>Editor ready</main>,
}));

vi.mock('./pages/NotFound', () => ({
  default: () => <main>Not found</main>,
}));

describe('App startup', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('loads the editor route without an artificial startup delay', async () => {
    render(<App />);

    expect(await screen.findByText('Editor ready')).toBeInTheDocument();
    expect(screen.queryByText(/loading lwrite/i)).not.toBeInTheDocument();
  });
});
