import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { findTopic } from './curriculum';
import { CodeDrawer } from './components/CodeDrawer';
import { Sidebar } from './components/Sidebar';
import { WordHelper } from './components/WordHelper';
import { Home } from './pages/Home';
import { TopicPage } from './pages/TopicPage';
import { useRoute } from './lib/route';
import { useTheme, type ThemeMode } from './lib/theme';

const WORD_HEADERS = { 'X-Api-Concepts-Lab': '1' };
const THEME_LABEL: Record<ThemeMode, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

export default function App() {
  return (
    <>
      <Lab />
      {/* The source file a guide or practice step points at, beside the page. */}
      <CodeDrawer />
      {/* Select a word or sentence anywhere: translate it to Tamil, hear it, or have Claude explain it in context. */}
      <WordHelper target="ta" headers={WORD_HEADERS} />
    </>
  );
}

function Lab() {
  const route = useRoute();
  const topic = findTopic(route);
  const key = topic?.id ?? '';
  const { mode, cycle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const firstRender = useRef(true);

  // On every page change: start at the top, close the phone menu, and move keyboard focus to the new title.
  useEffect(() => {
    document.title = topic ? `${topic.title} · API Concepts Lab` : 'API Concepts Lab';
    setMenuOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [key, topic]);

  return (
    <div className="page">
      <aside className="rail">
        <div className="rail-head">
          <a className="brand" href="#/">
            API Concepts Lab
          </a>
          <div className="rail-actions">
            <button type="button" className="chip-btn" onClick={cycle} title="Switch between automatic, light and dark theme">
              Theme: {THEME_LABEL[mode]}
            </button>
            <button type="button" className="chip-btn menu-btn" aria-expanded={menuOpen} aria-controls="topic-nav" onClick={() => setMenuOpen((o) => !o)}>
              {menuOpen ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>
        <div id="topic-nav" className={menuOpen ? 'rail-body open' : 'rail-body'}>
          <Sidebar current={key} />
        </div>
      </aside>
      <main>
        <Boundary key={key}>{topic ? <TopicPage topic={topic} /> : <Home />}</Boundary>
      </main>
    </div>
  );
}

/** If a page fails to render, say so instead of leaving a blank page. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="box warn" role="alert">
          <span className="box-label">This page could not load</span>
          <p>{this.state.error.message}</p>
          <p>Reload the page to try again.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
