import { marked } from 'marked';
import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { TOPICS } from '../curriculum';
import { githubUrl, hasCode, linesOf, openCode } from '../lib/code';

// The concept guide is the same Markdown file the GitHub repo shows (docs/concepts/NN-<id>.md). Its links are written
// for GitHub, so here they are mapped: another concept opens its Learn tab, a source file opens in the code drawer,
// anything else goes to the public repo. Mermaid diagrams are drawn in the browser.

const DOCS = 'docs/concepts/';

/** Resolve a link written relative to docs/concepts/ to a path inside APIConcepts/. */
export function resolveLink(href: string): { path: string; hash: string } | undefined {
  if (/^[a-z]+:|^#|^\//i.test(href)) return undefined;
  const [rel, hash = ''] = href.split('#');
  const parts = DOCS.split('/').filter(Boolean);
  for (const p of rel.split('/')) {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  }
  return { path: parts.join('/'), hash: hash ? `#${hash}` : '' };
}

/** Where a guide link goes in the lab. */
export function labHref(href: string): { kind: 'concept' | 'home' | 'code' | 'external'; href: string } {
  const r = resolveLink(href);
  if (!r) return { kind: 'external', href };
  const concept = r.path.match(/^docs\/concepts\/\d\d-(.+)\.md$/);
  if (concept && TOPICS.some((t) => t.id === concept[1])) return { kind: 'concept', href: `#/${concept[1]}/learn` };
  if (r.path === 'docs/README.md' || r.path === 'README.md') return { kind: 'home', href: '#/' };
  if (hasCode(r.path)) return { kind: 'code', href: r.path + r.hash };
  return { kind: 'external', href: githubUrl(r.path) + r.hash };
}

function useHtml(md: string) {
  return useMemo(() => {
    const html = marked.parse(md.replace(/^# .+\n+/, ''), { async: false, gfm: true }) as string;
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    for (const a of doc.querySelectorAll('a[href]')) {
      const to = labHref(a.getAttribute('href')!);
      if (to.kind === 'code') {
        a.setAttribute('data-code', to.href);
        a.setAttribute('href', `#code:${to.href}`);
      } else {
        a.setAttribute('href', to.href);
        if (to.kind === 'external') {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noreferrer');
        }
      }
    }
    // The footer's previous/next line is the lab's own pager here.
    const last = doc.body.firstElementChild?.lastElementChild;
    if (last?.tagName === 'P' && /all concepts/.test(last.textContent ?? '')) last.remove();
    return doc.body.firstElementChild?.innerHTML ?? '';
  }, [md]);
}

let mermaidId = 0;

/** Draw ```mermaid blocks as diagrams; leave the text if mermaid cannot load. */
function useMermaid(root: React.RefObject<HTMLDivElement | null>, html: string) {
  useEffect(() => {
    const blocks = [...(root.current?.querySelectorAll<HTMLElement>('pre > code.language-mermaid') ?? [])];
    if (!blocks.length || /jsdom/.test(navigator.userAgent)) return;
    let live = true;
    void import('mermaid')
      .then(async ({ default: mermaid }) => {
        const dark = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral', fontFamily: 'inherit' });
        for (const code of blocks) {
          const { svg } = await mermaid.render(`mmd-${++mermaidId}`, code.textContent ?? '');
          if (!live) return;
          const figure = document.createElement('figure');
          figure.className = 'mermaid-fig';
          figure.innerHTML = svg;
          code.parentElement?.replaceWith(figure);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [root, html]);
}

/** The concept guide, with code links opening the code drawer. */
export function Guide({ md }: { md: string }) {
  const html = useHtml(md);
  const root = useRef<HTMLDivElement>(null);
  useMermaid(root, html);
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-code]');
    if (!a) return;
    e.preventDefault();
    const [path, hash = ''] = a.dataset.code!.split('#');
    openCode({ path, lines: linesOf(hash) });
  };
  return <div ref={root} className="prose guide" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
