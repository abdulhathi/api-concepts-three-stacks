import { describe, expect, it } from 'vitest';
import { labHref, resolveLink } from '../components/Guide';
import { TOPICS } from '../curriculum';
import { loadGuide } from '../lessons';
import { linesOf, loadCode } from '../lib/code';

// The guides are the GitHub repo's docs/concepts files. Every link in them must work inside the lab too.
describe('links in the concept guides', () => {
  it('maps GitHub-relative links to lab pages, the code drawer or the public repo', () => {
    expect(resolveLink('../../python-fastapi-aws/app/routes/orders.py#L70-L77')).toEqual({ path: 'python-fastapi-aws/app/routes/orders.py', hash: '#L70-L77' });
    expect(labHref('23-retries.md')).toEqual({ kind: 'concept', href: '#/retries/learn' });
    expect(labHref('../README.md')).toEqual({ kind: 'home', href: '#/' });
    expect(labHref('../../python-fastapi-aws/app/routes/orders.py#L70-L77')).toEqual({ kind: 'code', href: 'python-fastapi-aws/app/routes/orders.py#L70-L77' });
    expect(labHref('https://www.rfc-editor.org/rfc/rfc9457').kind).toBe('external');
    expect(linesOf('#L38')).toEqual([38, 38]);
  });

  it.each(TOPICS.map((t) => t.id))('%s: every code link opens a bundled file at real lines', async (id) => {
    const md = await loadGuide(id);
    const broken: string[] = [];
    for (const [, href] of md.matchAll(/\]\(([^)\s]+)\)/g)) {
      const to = labHref(href);
      if (to.kind === 'external' && !/^https?:/.test(href)) broken.push(`${href} is not bundled (add it to src/lib/code.ts)`);
      if (to.kind !== 'code') continue;
      const [path, hash = ''] = to.href.split('#');
      const lines = (await loadCode(path)).split('\n').length;
      const range = linesOf(hash);
      if (range && range[1] > lines) broken.push(`${href}: the file has ${lines} lines`);
    }
    expect(broken).toEqual([]);
  });
});
