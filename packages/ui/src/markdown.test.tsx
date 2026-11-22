import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Markdown } from './markdown.tsx';

afterEach(cleanup);

describe('Markdown (8.3 XSS acceptance)', () => {
  it('renders formatting and safe links', () => {
    const { container } = render(
      <Markdown
        source={'Press **Power**, then *Cool*.\n\n- [Manual](https://example.com/m.pdf)'}
      />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('Power');
    expect(container.querySelector('em')?.textContent).toBe('Cool');
    const a = container.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.com/m.pdf');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(a.getAttribute('target')).toBe('_blank');
  });

  it('never creates script, img, iframe or svg elements, event handlers or javascript: links', () => {
    const attacks = [
      '<script>window.__pwned = 1</script>',
      '<img src=x onerror="window.__pwned = 1">',
      '<svg/onload=window.__pwned=1>',
      '<iframe src="javascript:window.__pwned=1"></iframe>',
      '[click](javascript:window.__pwned=1)',
      '[click](data:text/html,<script>window.__pwned=1</script>)',
      '**<b onmouseover=alert(1)>x</b>**',
    ];
    const { container } = render(<Markdown source={attacks.join('\n\n')} />);
    expect(container.querySelector('script, img, iframe, svg, object, embed, b')).toBeNull();
    for (const el of container.querySelectorAll('*')) {
      for (const attr of el.getAttributeNames()) expect(attr.startsWith('on')).toBe(false);
    }
    expect(container.querySelectorAll('a')).toHaveLength(0);
    // The attack text is shown as text, so a guest can see something is wrong with it.
    expect(container.textContent).toContain('<script>window.__pwned = 1</script>');
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
