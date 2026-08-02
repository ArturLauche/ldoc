import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('renders the LWrite brand mark', () => {
    const { container } = render(<BrandLogo />);

    expect(screen.getByRole('img', { name: 'LWrite' })).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('linearGradient')).toHaveLength(2);
  });

  it('accepts a custom accessible title', () => {
    render(<BrandLogo title="Custom brand" />);

    expect(screen.getByRole('img', { name: 'Custom brand' })).toBeInTheDocument();
  });
});
