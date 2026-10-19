import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { FONT_FAMILIES, fontFamilyValue } from '@/lib/fonts';
import { FontPicker } from './FontPicker';

describe('FontPicker', () => {
  it('opens on the current font, also after a dismissed search', async () => {
    const user = userEvent.setup();
    const font = FONT_FAMILIES[12];
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(
      <LocaleProvider>
        <FontPicker value={fontFamilyValue(font.name)} onChange={vi.fn()} />
      </LocaleProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Select font' });
    const active = () => document.querySelector('[role="option"][data-active]')?.textContent;

    await user.click(trigger);
    expect(active()).toBe(font.name);
    // The list scrolls to it instead of opening at the top.
    expect(scrollIntoView).toHaveBeenCalled();

    await user.type(screen.getByRole('combobox'), font.name.slice(0, 3));
    await user.keyboard('{Escape}');
    await user.click(trigger);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(active()).toBe(font.name);
  });
});
