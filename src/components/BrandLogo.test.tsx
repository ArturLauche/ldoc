import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('renders the shared favicon asset', () => {
    render(<BrandLogo />);

    const logo = screen.getByRole('img', { name: 'LWrite' });
    expect(logo).toHaveAttribute('src', '/favicon.svg');
    expect(logo).toHaveAttribute('alt', 'LWrite');
  });

  it('accepts a custom accessible title', () => {
    render(<BrandLogo title="Custom brand" />);

    expect(screen.getByRole('img', { name: 'Custom brand' })).toHaveAttribute(
      'alt',
      'Custom brand',
    );
  });
});
