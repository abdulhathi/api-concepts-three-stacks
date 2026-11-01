import { useEffect, useRef, useSyncExternalStore } from 'react';

// Hash routes work on any static host, GitHub Pages included, without server rewrites.
// A route is a page id and an optional anchor inside it: #/two-pointers/p-11.
function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '');
}

export function splitRoute(route: string) {
  const [id = '', anchor = ''] = route.split('/');
  return { id, anchor };
}

/** The page id part of the URL. */
export function useRoute() {
  return splitRoute(useSyncExternalStore(subscribe, currentRoute, () => '')).id;
}

/** The anchor part of the URL, such as "p-11" or "problems". */
export function useAnchor() {
  return splitRoute(useSyncExternalStore(subscribe, currentRoute, () => '')).anchor;
}

export const hrefFor = (id: string, anchor?: string) => (anchor ? `#/${id}/${anchor}` : `#/${id}`);

/** Scroll an element into view when the URL's anchor names it, after the page has settled. */
export function useAnchorTarget<T extends HTMLElement>(name: string) {
  const ref = useRef<T>(null);
  const anchor = useAnchor();
  useEffect(() => {
    if (anchor !== name) return;
    // The page scrolls to the top when a chapter opens; wait for that before scrolling here.
    const t = setTimeout(() => ref.current?.scrollIntoView?.({ block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [anchor, name]);
  return { ref, targeted: anchor === name };
}
