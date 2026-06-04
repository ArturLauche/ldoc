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

  it('renders the editor route without a blocking loading screen', () => {
    render(<App />);

    expect(screen.getByText('Editor ready')).toBeInTheDocument();
    expect(screen.queryByText(/loading lwrite/i)).not.toBeInTheDocument();
  });
});
