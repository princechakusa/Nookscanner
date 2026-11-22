import { describe, expect, it } from 'vitest';
import { markdownText, parseMarkdown, safeHref, type MdBlock, type MdInline } from './markdown.ts';

/** Every node of the tree, to assert nothing but the known node types appears. */
function nodes(blocks: MdBlock[]): MdInline[] {
  const all: MdInline[] = [];
  const walk = (list: MdInline[]) => {
    for (const n of list) {
      all.push(n);
      if ('children' in n) walk(n.children);
    }
  };
  for (const b of blocks) {
    if (b.type === 'p') walk(b.children);
    else b.items.forEach(walk);
  }
  return all;
}
const links = (md: string) =>
  nodes(parseMarkdown(md)).filter(
    (n): n is Extract<MdInline, { type: 'link' }> => n.type === 'link',
  );

describe('parseMarkdown', () => {
  it('parses paragraphs, line breaks, lists, bold, italic and links', () => {
    expect(
      parseMarkdown(
        'Press **Power** on the *remote*.\nWait 5 s.\n\n- Mode: cool\n- Fan: auto\n\n1. Open [the manual](https://example.com/m.pdf)\n2. Call [us](tel:+971501234567)',
      ),
    ).toEqual([
      {
        type: 'p',
        children: [
          { type: 'text', text: 'Press ' },
          { type: 'strong', children: [{ type: 'text', text: 'Power' }] },
          { type: 'text', text: ' on the ' },
          { type: 'em', children: [{ type: 'text', text: 'remote' }] },
          { type: 'text', text: '.' },
          { type: 'br' },
          { type: 'text', text: 'Wait 5 s.' },
        ],
      },
      {
        type: 'ul',
        items: [[{ type: 'text', text: 'Mode: cool' }], [{ type: 'text', text: 'Fan: auto' }]],
      },
      {
        type: 'ol',
        items: [
          [
            { type: 'text', text: 'Open ' },
            {
              type: 'link',
              href: 'https://example.com/m.pdf',
              children: [{ type: 'text', text: 'the manual' }],
            },
          ],
          [
            { type: 'text', text: 'Call ' },
            { type: 'link', href: 'tel:+971501234567', children: [{ type: 'text', text: 'us' }] },
          ],
        ],
      },
    ]);
  });

  it('keeps Arabic text and does not treat snake_case or 2*3*4 as italics', () => {
    const md = 'اضغط **تشغيل** ثم انتظر\nset fan_speed_max and 2*3*4';
    expect(markdownText(parseMarkdown(md))).toBe(
      'اضغط تشغيل ثم انتظر\nset fan_speed_max and 2*3*4',
    );
  });
});

describe('XSS (acceptance 8.3): nothing executable survives', () => {
  const attacks = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '[click](javascript:alert(1))',
    '[click](JaVaScRiPt:alert(1))',
    '[click](java\tscript:alert(1))',
    '[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '[click](vbscript:msgbox(1))',
    '[click](//evil.example/x)',
    '[click](http://insecure.example/x)',
    '[x](https://ok.example/"onmouseover="alert(1))',
    '<svg/onload=alert(1)>',
    '**<iframe src=javascript:alert(1)>**',
  ];
  for (const attack of attacks) {
    it(`renders ${JSON.stringify(attack)} as text only`, () => {
      const tree = parseMarkdown(attack);
      for (const l of links(attack)) {
        expect(safeHref(l.href)).toBe(true);
        expect(l.href).toMatch(/^(https:\/\/|tel:|mailto:)/i);
        expect(l.href).not.toMatch(/["'<>\s`]/);
      }
      // Only known node types, and HTML-looking input is kept verbatim as visible text.
      for (const n of nodes(tree)) expect(['text', 'strong', 'em', 'link', 'br']).toContain(n.type);
      if (attack.startsWith('<')) expect(markdownText(tree)).toBe(attack);
    });
  }

  it('safeHref accepts only https, tel and mailto without whitespace or control characters', () => {
    expect(safeHref('https://example.com/a?b=c')).toBe(true);
    expect(safeHref('tel:+97150123')).toBe(true);
    expect(safeHref('mailto:host@example.com')).toBe(true);
    for (const bad of [
      'javascript:alert(1)',
      'https://ok.example/\u0000x',
      ' https://lead.example',
      'http://plain.example',
      'ftp://x.example',
      '/relative',
    ]) {
      expect(safeHref(bad)).toBe(false);
    }
  });

  it('cuts input at the length limit', () => {
    expect(markdownText(parseMarkdown('a'.repeat(6000))).length).toBe(5000);
  });
});
