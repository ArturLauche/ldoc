import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createStarterGraphic } from '@/lib/smartGraphic';
import { SmartGraphicCanvas } from './SmartGraphicCanvas';

describe('SmartGraphicCanvas compact previews', () => {
  it('keeps chevron and step processes on one row in compact mode', () => {
    const chevron = render(<SmartGraphicCanvas graphic={createStarterGraphic('process-chevron')} compact />);
    const chevronRoot = chevron.getByTestId('graphic-layout-process-chevron');
    expect(chevronRoot).toHaveClass('flex-nowrap');
    expect(chevronRoot).not.toHaveClass('flex-wrap');
    expect(chevronRoot.innerHTML).not.toContain('min-w-[7rem]');
    expect(chevronRoot.innerHTML).not.toContain('min-w-[6.5rem]');
    chevron.unmount();

    const steps = render(<SmartGraphicCanvas graphic={createStarterGraphic('process-steps')} compact />);
    const stepsRoot = steps.getByTestId('graphic-layout-process-steps');
    expect(stepsRoot).toHaveClass('flex-nowrap');
    expect(stepsRoot).not.toHaveClass('flex-wrap');
    expect(stepsRoot.innerHTML).not.toContain('min-w-[5.5rem]');
  });

  it('sizes compact cycle and radial layouts to the gallery preview height', () => {
    const cycle = render(<SmartGraphicCanvas graphic={createStarterGraphic('cycle-basic')} compact />);
    const cycleRoot = cycle.getByTestId('graphic-layout-cycle-basic');
    expect(cycleRoot).toHaveClass('h-[7.5rem]', 'w-[7.5rem]');
    expect(cycleRoot.className).not.toMatch(/w-full max-w-md/);
    cycle.unmount();

    const radial = render(<SmartGraphicCanvas graphic={createStarterGraphic('relationship-radial')} compact />);
    const radialRoot = radial.getByTestId('graphic-layout-relationship-radial');
    expect(radialRoot).toHaveClass('h-[7.5rem]', 'w-[7.5rem]');
    expect(radialRoot.className).not.toContain('min-h-[16rem]');
  });

  it('keeps compact opposing, org, and pyramid layouts from stacking out of the preview', () => {
    const opposing = render(<SmartGraphicCanvas graphic={createStarterGraphic('relationship-opposing')} compact />);
    expect(opposing.getByTestId('graphic-layout-relationship-opposing')).toHaveClass('grid-cols-[1fr_auto_1fr]');
    opposing.unmount();

    const org = render(<SmartGraphicCanvas graphic={createStarterGraphic('hierarchy-org')} compact />);
    expect(org.getByTestId('graphic-layout-hierarchy-org')).toHaveClass('flex-nowrap');
    org.unmount();

    const pyramid = render(<SmartGraphicCanvas graphic={createStarterGraphic('pyramid-basic')} compact />);
    expect(pyramid.getByTestId('graphic-layout-pyramid-basic').innerHTML).not.toContain('min-w-[8rem]');
  });
});
