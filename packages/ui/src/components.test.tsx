import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Modal,
  SelectField,
  Skeleton,
  StatusPill,
  TextField,
  ToastProvider,
  useToast,
} from './index.ts';

afterEach(cleanup);

/** axe in jsdom: structural/ARIA rules (colour contrast is tested on tokens and in Playwright). */
async function expectNoA11yViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

describe('Button', () => {
  it('renders variants accessibly and blocks clicks while loading', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <div>
        <Button onClick={onClick}>Save</Button>
        <Button variant="danger" loading onClick={onClick}>
          Delete
        </Button>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Delete' }).getAttribute('aria-busy')).toBe('true');
    await expectNoA11yViolations(container);
  });
});

describe('fields', () => {
  it('link label, hint and error to the control', async () => {
    const { container } = render(
      <form>
        <TextField label="Apartment name" hint="As guests should see it" error="Required" />
        <SelectField
          label="Room type"
          options={[
            { value: 'living', label: 'Living room' },
            { value: 'kitchen', label: 'Kitchen' },
          ]}
        />
      </form>,
    );
    const input = screen.getByLabelText('Apartment name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toHaveLength(2);
    expect(screen.getByLabelText('Room type').tagName).toBe('SELECT');
    await expectNoA11yViolations(container);
  });
});

describe('Modal', () => {
  it('opens as a labelled dialog and closes from the close button', async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <Modal open={open} title="Delete apartment" onClose={() => setOpen(false)}>
          <p>This cannot be undone.</p>
        </Modal>
      );
    }
    const { container } = render(<Harness />);
    const dialog = container.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(dialog.hasAttribute('open')).toBe(false);
  });
});

describe('toasts', () => {
  it('announce politely and auto-dismiss non-errors after 5 s; errors stay', async () => {
    vi.useFakeTimers();
    function Trigger() {
      const toast = useToast();
      return (
        <>
          <button onClick={() => toast.show('Saved', 'success')}>ok</button>
          <button onClick={() => toast.show('Upload failed', 'danger')}>bad</button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => screen.getByText('ok').click());
    act(() => screen.getByText('bad').click());
    expect(screen.getByRole('status').textContent).toContain('Saved');
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('status').textContent).not.toContain('Saved');
    expect(screen.getByRole('status').textContent).toContain('Upload failed');
    vi.useRealTimers();
  });
});

describe('table, pill and states', () => {
  it('render accessibly, with an empty state when there are no rows', async () => {
    const rows = [{ id: '1', name: 'Unit 1201', status: 'published' as const }];
    const { container, rerender } = render(
      <DataTable
        caption="Apartments"
        rowKey={(r) => r.id}
        rows={rows}
        columns={[
          { key: 'name', header: 'Name', render: (r) => r.name },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <StatusPill status={r.status} label="Published" />,
          },
        ]}
      />,
    );
    expect(screen.getByRole('table', { name: 'Apartments' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    await expectNoA11yViolations(container);

    rerender(
      <DataTable
        caption="Apartments"
        rowKey={(r: { id: string }) => r.id}
        rows={[]}
        columns={[]}
        empty={<EmptyState title="No apartments yet" body="Add your first apartment." />}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No apartments yet' })).toBeTruthy();
  });

  it('error state shows a retry and a support code; skeleton is labelled', async () => {
    const retry = vi.fn();
    const { container } = render(
      <>
        <ErrorState
          title="Could not load"
          body="Check your connection."
          code="NET-1"
          onRetry={retry}
        />
        <Skeleton label="Loading apartments" />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByText('Code: NET-1')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Loading apartments' })).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
