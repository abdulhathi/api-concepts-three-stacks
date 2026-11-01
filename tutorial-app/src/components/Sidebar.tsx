import { LEVELS, levelOf, TOPICS } from '../curriculum';
import { studyDone, useProgress } from '../lib/progress';
import { hrefFor } from '../lib/route';
import { useWatched } from '../video/watched';

/** The course outline: every part and concept, with how many of its six study steps you have done. */
export function Sidebar({ current }: { current: string }) {
  const watched = useWatched();
  const progress = useProgress();
  const doneOf = (id: string) => Object.values(studyDone(progress[id], watched[id]?.done ?? false)).filter(Boolean).length;
  const finished = TOPICS.filter((t) => doneOf(t.id) === 6).length;
  const open = levelOf(current)?.key;
  return (
    <nav className="toc" aria-label="Concepts">
      <div className="progress">
        <span className="progress-text">
          {finished} of {TOPICS.length} concepts finished
        </span>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${(100 * finished) / TOPICS.length}%` }} />
        </div>
      </div>
      <ol>
        <li>
          <a className={current === '' ? 'toc-link is-current' : 'toc-link'} href="#/">
            <span className="n">⌂</span>
            <span>Course home</span>
            <span />
          </a>
        </li>
      </ol>
      {LEVELS.map((level) => (
        <details key={level.key} className="toc-group" open={open ? open === level.key : level.n === 1}>
          <summary className="group">
            <span>
              {level.n} · {level.title}
            </span>
            <span className="group-count">
              {level.topics.filter((t) => doneOf(t.id) === 6).length}/{level.topics.length}
            </span>
          </summary>
          <ol>
            {level.topics.map((t) => {
              const n = doneOf(t.id);
              return (
                <li key={t.id}>
                  <a className={`toc-link${t.id === current ? ' is-current' : ''}`} href={hrefFor(t.id)} aria-current={t.id === current ? 'page' : undefined}>
                    <span className="n">{t.n}</span>
                    <span>{t.title}</span>
                    <span className="tick" title={`${n} of 6 study steps done`}>
                      {n === 6 ? '✓✓' : n > 0 ? `${n}/6` : ''}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </details>
      ))}
    </nav>
  );
}
