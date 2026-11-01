import { CopyBlock } from '../components/Copy';
import { LEVELS, TOPICS } from '../curriculum';
import { PRACTICE_IDS, useVideoLengths, VIDEO_IDS } from '../lessons';
import { passedByHand, useBuildProgress } from '../lib/contract';
import { STUDY_STEPS, studyDone, useProgress } from '../lib/progress';
import { hrefFor } from '../lib/route';
import { STACKS, useHealth } from '../lib/stacks';
import { minutes } from '../video/timeline';
import { useWatched } from '../video/watched';

/** A five-week plan: about an hour a concept, five days a week, then a week to make it yours. */
const PLAN: { week: string; what: string; ids: [number, number] | null }[] = [
  { week: 'Week 1', what: 'The shape of an API call', ids: [1, 7] },
  { week: 'Week 2', what: 'Schemas, status codes, and who may call', ids: [8, 13] },
  { week: 'Week 3', what: 'HTTPS, CORS, API styles and moving data', ids: [14, 20] },
  { week: 'Week 4', what: 'Load, failure, events and errors', ids: [21, 27] },
  { week: 'Week 5', what: 'Make it yours: add a feature to your stack end to end, deploy it, and write it up', ids: null },
];

/** The course: how to study, the servers you practice on, the plan, and every concept with your progress. */
export function Home() {
  const watched = useWatched();
  const progress = useProgress();
  const lengths = useVideoLengths();
  const health = useHealth();
  const byHand = useBuildProgress();
  const doneOf = (id: string) =>
    Object.values(studyDone(progress[id], watched[id]?.done ?? false, passedByHand(byHand, TOPICS.find((t) => t.id === id)!.n))).filter(Boolean).length;
  const next = TOPICS.find((t) => doneOf(t.id) < 6) ?? TOPICS[0];
  const finished = TOPICS.filter((t) => doneOf(t.id) === 6).length;
  const total = Object.values(lengths).reduce((a, b) => a + b, 0);

  return (
    <>
      <header className="home-hero">
        <p className="kicker">API Concepts Lab</p>
        <h1 tabIndex={-1}>27 API concepts, learned by doing</h1>
        <p className="lede">
          Every concept has a narrated video with animated diagrams, a guide with the real code from three stacks side by side,
          and a practice lab that sends real requests to the Bookshop API running on your machine: Python and FastAPI, TypeScript
          and Express, or C# and ASP.NET Core. Then you build something yourself.
        </p>
        <div className="home-actions">
          <a className="btn primary" href={hrefFor(next.id)}>
            ▶ {finished || doneOf(next.id) ? 'Continue' : 'Start'}: {next.n} · {next.title}
          </a>
        </div>
        <p className="home-stats">
          <span>
            <b>{TOPICS.length}</b> concepts in {LEVELS.length} parts
          </span>
          <span>
            <b>{VIDEO_IDS.size}</b> videos{total > 0 && ` · ${Math.round(total / 60000)} min`} · <b>{PRACTICE_IDS.size}</b> practice labs
          </span>
          <span>
            <b>{finished}</b> concepts finished
          </span>
        </p>
      </header>

      <section className="home-how" aria-labelledby="how">
        <h2 id="how">How to learn each concept</h2>
        <p>Do the six steps in order. The concept page ticks them off as you go, so you always know where you stopped.</p>
        <ol className="how-list">
          <li>
            <b>{STUDY_STEPS[0].label}.</b> Get the picture first: what problem the concept solves and how it moves on the wire.
          </li>
          <li>
            <b>{STUDY_STEPS[1].label}.</b> The rule this API follows, and the code that does it in all three stacks. Click a code link to open the real file.
          </li>
          <li>
            <b>{STUDY_STEPS[2].label}.</b> Send each request, read the response, and see the checks pass. Copy the curl command and run it in your terminal too.
          </li>
          <li>
            <b>{STUDY_STEPS[3].label}.</b> Switch the server and send the same requests. Same contract, different framework: open the code and compare.
          </li>
          <li>
            <b>{STUDY_STEPS[4].label}.</b> Write the concept yourself in your own Bookshop API (the bookshop-api-handbuilt repo), then run <code>./check.sh</code>: the same contract tests the reference passes grade your code.
          </li>
          <li>
            <b>{STUDY_STEPS[5].label}.</b> Say each answer aloud before you open it. If you cannot explain it simply, watch that part of the video again.
          </li>
        </ol>
      </section>

      <section className="home-servers" aria-labelledby="servers">
        <h2 id="servers">Your practice servers</h2>
        <p>
          Start one or all three in a terminal from the folder that holds SPEC.md (or from Study Hub, if you use it). Each stack's README says how to install it first.
          The practice labs talk to them through this page, so there is nothing else to set up.
        </p>
        <ul className="servers">
          {STACKS.map((s) => (
            <li key={s.id}>
              <span className={`dot ${health[s.id]}`} aria-hidden="true" />
              <b>{s.name}</b> · {s.cloud} · port {s.port}{' '}
              <span className={`tag${health[s.id] === 'up' ? ' ok' : ''}`}>{health[s.id] === 'up' ? 'running' : health[s.id] === 'down' ? 'stopped' : '…'}</span>
              {health[s.id] === 'down' && <CopyBlock text={s.start} />}
            </li>
          ))}
        </ul>
      </section>

      <section className="home-plan" aria-labelledby="plan">
        <h2 id="plan">A five-week plan</h2>
        <p>About an hour a concept, five days a week. Fall behind? Keep the order and move the dates.</p>
        <table className="plan">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Concepts</th>
            </tr>
          </thead>
          <tbody>
            {PLAN.map((p) => (
              <tr key={p.week}>
                <td>{p.week}</td>
                <td>{p.what}</td>
                <td>{p.ids ? `${p.ids[0]} to ${p.ids[1]}` : 'Your project'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {LEVELS.map((level) => (
        <section key={level.key} className="level" aria-labelledby={`lv-${level.key}`}>
          <h2 id={`lv-${level.key}`}>
            <span className="level-n">Part {level.n}</span> {level.title}
          </h2>
          <p className="level-blurb">{level.blurb}</p>
          <ul className="cards">
            {level.topics.map((t) => {
              const n = doneOf(t.id);
              const ready = VIDEO_IDS.has(t.id) && PRACTICE_IDS.has(t.id);
              return (
                <li key={t.id} className={`card${ready ? '' : ' soon'}${n === 6 ? ' watched' : ''}`}>
                  <a href={hrefFor(t.id)}>
                    <span className="card-top">
                      <span>{t.n}</span>
                      <span>
                        {n === 6 ? (
                          <span className="tag ok">✓ Done</span>
                        ) : n > 0 ? (
                          <span className="tag video">{n} of 6 steps</span>
                        ) : VIDEO_IDS.has(t.id) ? (
                          <span className="tag video">▶ {lengths[t.id] ? minutes(lengths[t.id]) : 'Video'}</span>
                        ) : (
                          <span className="tag">Guide ready · video soon</span>
                        )}
                      </span>
                    </span>
                    <span className="card-title">{t.title}</span>
                    <span className="card-goal">{t.goal}</span>
                    {n > 0 && <span className="card-bar" style={{ width: `${(100 * n) / 6}%` }} />}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
