import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('uses the favicon as the accessible LWrite brand mark', () => {
    render(<BrandLogo />);

    expect(screen.getByRole('img', { name: 'LWrite' })).toHaveAttribute('src', '/favicon.svg');
  });

  it('can be decorative beside a visible wordmark', () => {
    render(<BrandLogo alt="" />);

    expect(screen.getByRole('presentation')).toHaveAttribute('alt', '');
  });
});
