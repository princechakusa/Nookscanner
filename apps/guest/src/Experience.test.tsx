import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_EXPERIENCE } from './demo.ts';
import { Experience } from './Experience.tsx';

afterEach(cleanup);

const setup = (props: Partial<Parameters<typeof Experience>[0]> = {}) => {
  const onLocaleChange = vi.fn();
  render(
    <Experience
      experience={DEMO_EXPERIENCE}
      locale="en"
      onLocaleChange={onLocaleChange}
      webgl
      demo
      {...props}
    />,
  );
  return { onLocaleChange };
};

describe('guest experience shell', () => {
  it('shows apartment name, demo badge, rooms and a language group', () => {
    const { onLocaleChange } = setup();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Demo apartment');
    const rooms = screen.getByRole('navigation', { name: 'Rooms' });
    expect(within(rooms).getAllByRole('button')).toHaveLength(4);
    expect(
      within(rooms)
        .getByRole('button', { name: /Living room/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'عربي' }));
    expect(onLocaleChange).toHaveBeenCalledWith('ar');
  });

  it('room chips switch the appliance list', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Appliances in Living room' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kitchen/ }));
    expect(screen.getByRole('heading', { name: 'Appliances in Kitchen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Oven/ })).toBeTruthy();
  });

  it('search for "AC" lists both ACs with their rooms', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search appliances'), { target: { value: 'ac' } });
    const results = screen.getByRole('region', { name: 'Search appliances' });
    const rows = within(results).getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Living room AC'),
      expect.stringContaining('Bedroom 1 AC'),
    ]);
    expect(rows[1]!.textContent).toContain('Bedroom 1');
  });

  it('search with no match explains and does not list anything', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search appliances'), { target: { value: 'jacuzzi' } });
    expect(screen.getByText('No appliance called "jacuzzi" in this apartment.')).toBeTruthy();
  });

  it('opens the instruction sheet with steps, verification and support', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Living room AC/ }));
    const dialog = document.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    const sheet = within(dialog);
    expect(sheet.getByRole('heading', { name: 'Living room AC' })).toBeTruthy();
    expect(sheet.getByText('Verified')).toBeTruthy();
    expect(sheet.getAllByRole('listitem')).toHaveLength(4);
    const support = sheet.getByRole('link', { name: /Contact support/ });
    expect(support.getAttribute('href')).toBe('https://wa.me/10000000000');
    fireEvent.click(sheet.getByRole('button', { name: 'Close' }));
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('without WebGL shows the explanation and every appliance grouped by room', () => {
    setup({ webgl: false });
    expect(screen.getByRole('status').textContent).toContain('cannot show the 3D apartment');
    for (const room of ['Living room', 'Kitchen', 'Bedroom 1']) {
      expect(screen.getByRole('heading', { level: 3, name: room })).toBeTruthy();
    }
  });

  it('renders Arabic content with Arabic step numbers', () => {
    setup({ locale: 'ar' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('شقة تجريبية');
    fireEvent.click(screen.getByRole('button', { name: /مكيف غرفة المعيشة/ }));
    const dialog = within(document.querySelector('dialog')!);
    expect(dialog.getByText('٢')).toBeTruthy();
    expect(dialog.getByRole('link', { name: /تواصل معنا/ })).toBeTruthy();
  });
});
