import { CopyBlock } from '../components/Copy';
import { Guide } from '../components/Guide';
import type { Topic } from '../curriculum';
import { useGuide } from '../lessons';
import { groupFor, useBuildProgress } from '../lib/contract';
import { setMark, useProgress } from '../lib/progress';
import { hrefFor } from '../lib/route';
import { STACKS, stackOf, useStack } from '../lib/stacks';
import { BUILD_NOTES } from './notes';

const REPO = 'https://github.com/abdulhathi/bookshop-api-handbuilt';

/** The guide's "The rule in this repo" section: exactly what the server must do. */
export function ruleOf(md: string): string | undefined {
  const m = md.match(/\n## The rule in this repo\n([\s\S]*?)(?=\n## |$)/);
  return m?.[1].trim();
}

/** Build the concept yourself, in your own API, and check it with the contract tests. */
export function BuildTab({ topic }: { topic: Topic }) {
  const stack = useStack();
  const guide = useGuide(topic.id);
  const build = useBuildProgress();
  const marks = useProgress()[topic.id];
  const group = groupFor(topic.n);
  const rule = guide.value !== undefined ? ruleOf(guide.value) : undefined;
  const dir = build.dir ?? '~/Developer/StudyGuide/bookshop-api-handbuilt';
  const passed = (s: string) => build.progress?.[s]?.includes(topic.n) ?? false;
  const mine = stackOf(stack).mineDir;

  return (
    <div className="build">
      <p className="lede-sm">
        Write this concept yourself, in your own API: <a href={REPO} target="_blank" rel="noreferrer">bookshop-api-handbuilt</a>. Build one stack through all
        27 concepts first, then the other two. Compare with the reference code only after your tests pass.
      </p>

      <div className="build-status" aria-label="Passed in your own API">
        {STACKS.map((s) => (
          <span key={s.id} className={passed(s.mineDir) ? 'tag ok' : 'tag'}>
            {passed(s.mineDir) ? '✓' : '○'} {s.short}
          </span>
        ))}
        {build.error && !build.progress && <span className="small"> Progress not found in {dir}.</span>}
      </div>

      <section>
        <h2 className="sec-h">1. What to build</h2>
        <ul className="build-notes">
          {(BUILD_NOTES[topic.n] ?? []).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        {rule ? (
          <details className="covers" open>
            <summary>The rule, from the guide</summary>
            <Guide md={rule} />
          </details>
        ) : (
          guide.error && <p className="box warn">The guide could not load: {guide.error}</p>
        )}
      </section>

      <section>
        <h2 className="sec-h">2. The tests that must pass</h2>
        {group ? (
          <>
            <p className="small">
              From <code>contract-tests</code>, group “{group.name}”.
            </p>
            <ul className="checks">
              {group.tests.map((t) => (
                <li key={t.title}>
                  □ {t.title}
                  {t.waits && <span className="detail"> ({t.waits})</span>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="small">No contract tests cover this concept.</p>
        )}
      </section>

      <section>
        <h2 className="sec-h">3. Check it</h2>
        <p>From your repo. It starts your server fresh, runs these tests, and records a pass in progress.json and the README:</p>
        <CopyBlock text={`cd ${dir}\n./check.sh ${mine} ${topic.n}`} />
        <p className="small">
          Want the Practice tab to send its requests to your server instead? Start it on port {stackOf(stack).minePort} and choose “My servers” there.
        </p>
      </section>

      <section>
        <h2 className="sec-h">4. Compare, then commit</h2>
        <p>
          Open the <a href={hrefFor(topic.id, 'learn')}>Learn tab</a>’s “Side by side” to see how the reference does it. Keep what you learn, then:
        </p>
        <CopyBlock text={`git add -A\ngit commit -m "Concept ${topic.n}: ${topic.title} in ${mine}"\ngit push`} />
      </section>

      <label className="done">
        <input type="checkbox" checked={marks?.built ?? false} onChange={(e) => setMark(topic.id, 'built', e.target.checked)} />I built it myself and the tests pass
      </label>
    </div>
  );
}
