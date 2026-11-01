import { BuildTab } from '../build/BuildTab';
import { levelOf, TOPICS, type Topic } from '../curriculum';
import { Guide } from '../components/Guide';
import { GUIDE_IDS, PRACTICE_IDS, useGuide, usePractice, useVideo, VIDEO_IDS } from '../lessons';
import { passedByHand, useBuildProgress } from '../lib/contract';
import { STUDY_STEPS, studyDone, toggleMark, useProgress } from '../lib/progress';
import { hrefFor, useAnchor } from '../lib/route';
import { PracticeView } from '../practice/Practice';
import { VideoPlayer } from '../video/VideoPlayer';
import { useWatched } from '../video/watched';

const TABS = [
  { key: '', label: 'Watch', has: VIDEO_IDS },
  { key: 'learn', label: 'Learn', has: GUIDE_IDS },
  { key: 'practice', label: 'Practice', has: PRACTICE_IDS },
  { key: 'build', label: 'Build', has: GUIDE_IDS },
] as const;

/** One concept: your study steps, then three tabs: the video, the guide and the practice lab. */
export function TopicPage({ topic }: { topic: Topic }) {
  const level = levelOf(topic.id)!;
  const index = TOPICS.indexOf(topic);
  const anchor = useAnchor();
  const tab = TABS.find((t) => t.key === anchor) ?? TABS[0];

  return (
    <article className="chapter" key={topic.id}>
      <header className="ch-head prose">
        <p className="eyebrow">
          <b>Concept {topic.n}</b> · Part {level.n} · {level.title}
        </p>
        <h1 className="ch-title" tabIndex={-1} id="topic-title">
          {topic.title}
        </h1>
        <p className="goal">{topic.goal}</p>
      </header>

      <StudySteps topic={topic} />

      <nav className="tabs" aria-label="Parts of this concept">
        {TABS.map((t, k) => (
          <a
            key={t.key}
            href={hrefFor(topic.id, t.key || undefined)}
            className={t === tab ? 'tab on' : 'tab'}
            aria-current={t === tab ? 'page' : undefined}
          >
            <span className="tab-n">{k + 1}</span> {t.label}
            {!t.has.has(topic.id) && <span className="tag">Soon</span>}
          </a>
        ))}
      </nav>

      {tab.key === '' && <WatchTab topic={topic} />}
      {tab.key === 'learn' && <LearnTab topic={topic} />}
      {tab.key === 'practice' && <PracticeTab topic={topic} />}
      {tab.key === 'build' && <BuildTab topic={topic} />}

      <nav className="pager" aria-label="Previous and next concept">
        {TOPICS[index - 1] ? (
          <a className="pager-link" href={hrefFor(TOPICS[index - 1].id, anchor || undefined)}>
            <span className="pager-dir">← Previous</span>
            <span className="pager-title">
              {TOPICS[index - 1].n} · {TOPICS[index - 1].title}
            </span>
          </a>
        ) : (
          <span />
        )}
        {TOPICS[index + 1] && (
          <a className="pager-link next" href={hrefFor(TOPICS[index + 1].id, anchor || undefined)}>
            <span className="pager-dir">Next →</span>
            <span className="pager-title">
              {TOPICS[index + 1].n} · {TOPICS[index + 1].title}
            </span>
          </a>
        )}
      </nav>
    </article>
  );
}

/** The six study steps for this concept, with what is done. */
function StudySteps({ topic }: { topic: Topic }) {
  const watched = useWatched()[topic.id]?.done ?? false;
  const marks = useProgress()[topic.id];
  const done = studyDone(marks, watched, passedByHand(useBuildProgress(), topic.n));
  const count = Object.values(done).filter(Boolean).length;
  return (
    <section className="study" aria-label="Your steps for this concept">
      <p className="study-h">
        Your steps <span className="study-count">{count} of 6</span>
      </p>
      <ol className="study-list">
        {STUDY_STEPS.map((s) => (
          <li key={s.key} className={done[s.key] ? 'on' : undefined}>
            <span className="study-tick" aria-hidden="true">
              {done[s.key] ? '✓' : ''}
            </span>
            <a href={hrefFor(topic.id, s.tab || undefined)}>{s.label}</a>
            {done[s.key] && <span className="visually-hidden"> (done)</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Soon({ what }: { what: string }) {
  return (
    <div className="soon-box">
      <h2 className="sec-h">Coming soon</h2>
      <p>The {what} for this concept is not written yet. The other tabs are ready.</p>
    </div>
  );
}

function WatchTab({ topic }: { topic: Topic }) {
  const video = useVideo(topic.id);
  if (!VIDEO_IDS.has(topic.id))
    return (
      <>
        <Soon what="video" />
        <Covers topic={topic} />
      </>
    );
  return (
    <>
      {video.error && <p className="box warn">The video could not load: {video.error}</p>}
      {video.value ? <VideoPlayer key={topic.id} script={video.value} title={topic.title} /> : !video.error && <p className="loading">Loading the video…</p>}
      <Covers topic={topic} />
      <p className="after">
        Watched it? <a href={hrefFor(topic.id, 'learn')}>Read the guide →</a>
      </p>
    </>
  );
}

function Covers({ topic }: { topic: Topic }) {
  return (
    <details className="covers">
      <summary>What the video covers</summary>
      <ol>
        {topic.covers.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
    </details>
  );
}

function LearnTab({ topic }: { topic: Topic }) {
  const guide = useGuide(topic.id);
  const marks = useProgress()[topic.id];
  if (!GUIDE_IDS.has(topic.id)) return <Soon what="guide" />;
  return (
    <>
      <p className="small">
        Code links open the real file beside the guide. The same guide is in the GitHub repo.
      </p>
      {guide.error && <p className="box warn">The guide could not load: {guide.error}</p>}
      {guide.value !== undefined ? <Guide md={guide.value} /> : !guide.error && <p className="loading">Loading the guide…</p>}
      <label className="done">
        <input type="checkbox" checked={marks?.read ?? false} onChange={() => toggleMark(topic.id, 'read')} />I read the guide and the code
      </label>
      <label className="done">
        <input type="checkbox" checked={marks?.explained ?? false} onChange={() => toggleMark(topic.id, 'explained')} />I answered the interview questions out loud, without looking
      </label>
      <p className="after">
        Next: <a href={hrefFor(topic.id, 'practice')}>practice it against the real API →</a>
      </p>
    </>
  );
}

function PracticeTab({ topic }: { topic: Topic }) {
  const practice = usePractice(topic.id);
  if (!PRACTICE_IDS.has(topic.id)) return <Soon what="practice lab" />;
  return (
    <>
      {practice.error && <p className="box warn">The practice lab could not load: {practice.error}</p>}
      {practice.value ? <PracticeView key={topic.id} topicId={topic.id} practice={practice.value} /> : !practice.error && <p className="loading">Loading the lab…</p>}
    </>
  );
}
