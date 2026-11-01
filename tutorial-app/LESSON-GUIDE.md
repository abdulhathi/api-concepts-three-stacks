# Lesson guide

The writer brief for the API Concepts Lab. Each of the 27 concepts in `src/curriculum.ts` has three parts:

| Part | File | Who writes it |
|---|---|---|
| Video | `src/lessons/<id>/video.ts` | you |
| Practice lab | `src/lessons/<id>/practice.ts` | you |
| Guide | `../docs/concepts/NN-<id>.md` | already written; it is also on GitHub. Read it, do not edit it |

The template is `src/lessons/idempotency/` (both files). Read it all, and if the dev server runs, watch
http://localhost:5195/#/idempotency and do http://localhost:5195/#/idempotency/practice.

## The learner

A senior software engineer (full stack, about 15 years, React, .NET, Python, cloud) learning every API concept well enough
to build it, explain it in an interview and show it on GitHub. Their first language is Tamil; they are learning American
English. So: plain, clear, spoken American English. Short sentences, one idea per line, no idioms. American spelling (a
test rejects British spellings). Use the real terms (idempotent, preflight, problem details) and explain each the first
time.

## The system you teach with

`../SPEC.md` is the contract: the Bookshop API, implemented three times (Python FastAPI on 8001, TypeScript Express on
8002, C# ASP.NET Core on 8003), all passing the same contract tests. Read the parts of SPEC.md for your concept, the guide,
and the code it links in all three stacks. Every request, header, status code, problem slug and limit you mention must be
what this API really does. When the three stacks differ in an interesting way (a built-in limiter versus a hand-written
one), say so in one line.

## Scope

The concept's `covers` list in `src/curriculum.ts` is the video's scope, in order. Teach every item and stay inside it:
neighboring concepts own their material (idempotency mentions retries in one line and leaves them to concept 23). Never
edit `src/curriculum.ts`, `src/video`, `src/flow`, `src/practice`, `src/components`, the guides, the stacks, or another
concept's folder. If something there is wrong or missing, say so in your report.

## Accuracy

- Only state what you are sure of. RFC numbers, header names, status codes and cloud features must be right. If unsure of
  a default or a limit, leave it out.
- Numbers are orders of magnitude unless they are this API's own values (5 requests a minute on the free plan).
- No made-up company stories. A company may be named only for behavior it documents itself.
- Name trade-offs honestly. Be consistent with the guide: same terms, same rules, same numbers.

## The video

Aim for **8 to 11 minutes** (the test allows 5 to 14). About 14 to 18 scenes, in this arc, adapted to the concept:

1. `title`: the concept and one sentence on what it is for. Two lines.
2. The problem, shown: a `flow` scene where life without the concept hurts.
3. The core idea, as a `flow` scene, step by step.
4. A `pause` question early.
5. One scene per item in `covers`. Use an **`http` scene** wherever the concept lives in the message itself (headers,
   status lines, bodies): at least one per video, usually two or three. `flow` when something moves, `compare` for two
   options, `table` for three or more, `steps` for a procedure, `stats` for numbers, `points` for rules.
6. Failure or misuse, in a `flow` scene with `down` nodes, `fail` packets or `lost` packets.
7. `signals`: "When you hear … reach for …", four to six rows.
8. Mistakes (`points`, tone `warn`).
9. A second `pause`, with an answer nobody could argue with.
10. `recap` with `next` set to the next concept in curriculum order (none for the last one). End by sending the learner to
    the practice tab, then the next lesson.

**The animation is the point.** At least **four** `flow` scenes (a test enforces it), and in each, at least half the lines
change the picture: a packet moves, a node appears or fails, a badge or panel row changes.

### Scene kinds

| kind | use it for | reveal |
| --- | --- | --- |
| `title` | the opening card | none |
| `flow` | an animated diagram (below) | `beats[i]` plays with `say[i]` |
| `http` | a raw HTTP request and response as text | the response appears at line `responseAt`; `marks[i]` lights lines while `say[i]` is read |
| `points` | statements; `tone`: `key`, `warn`, `tip` | item k with line k + `lead` |
| `steps` | a numbered procedure | item k with line k + `lead` |
| `compare` | two options (`tone: 'bad' / 'good'`, optional `cost`) | right side at line `rightAt` |
| `table` | three or more options: `head` and `rows` | row k with line k + `lead` |
| `stats` | two to four big numbers | item k with line k + `lead` |
| `signals` | "When you hear / Reach for" rows | row k with line k + `lead` |
| `pause` | a question; 6 seconds to think, then `answer` and `answerSay` | answer after the pause |
| `recap` | what to remember, and `next` | item k with line k + `lead` |

Reveal rule: the last line of a scene shows every item, and `items ≤ say.length − lead`.

**`http` scenes.** `request` and `response` are arrays of lines, each **at most 42 characters** (a test enforces it; cut
long values with `…`, as the template does with the token). Use the API's real paths, headers and problem slugs. `marks`
has one entry per `say` line (or fewer): `{ req: [line indexes], res: [line indexes] }`, 0-based. Light the lines the
narration is talking about. Leave `response` out to show a request alone. `responseAt` is the line index where the
response appears (default: the last line).

### Flow scenes

Grid `col` 0 to 6, `row` 0 to 3 (halves fine); the picture is cropped to what you use, so use the smallest grid that tells
the story (three to six nodes). Left to right: clients on the left, data on the right.

**Nodes** `{ id, kind, label, sub?, col, row, hidden? }`: `label` ≤ 18 characters, `sub` ≤ 22. Kinds: people and devices
`user client phone browser`; network edge `dns cdn lb gateway internet firewall`; compute `server service worker function
scheduler ai`; data `db queue stream storage search file`; cache `cache`; outside services `monitor auth mail payment
video map clock`. For this course: an API server is `server`, an OAuth server is `auth`, an API gateway is `gateway`, a
webhook receiver is `service`, a browser page is `browser`.

**Edges** `{ from, to, id?, label?, dashed?, arrow?, hidden? }`: id defaults to `"from-to"`; `label` ≤ 16 characters.
**Zones** `{ id, label, from: [col,row], to: [col,row] }`: a region, a trust boundary, a browser origin.
**Panels** `{ id, title, col, row, rows, width? }`: a table whose rows change: a token bucket, a key store, a queue, a
delivery log. A row fits `(width − 24) ÷ 9` characters (20 at the default 210).

**Beats**, one per `say` line (`{}` changes nothing). Lasting: `show`/`hide`, `down`/`up`, `cut`/`mend`, `relabel`
(`{ id: { label?, sub? } }`, `sub: null` removes it), `badge` (`{ id: 'text' }` ≤ 12 characters, `null` removes),
`rows` (`{ panelId: [...] }`). This line only: `focus`, `send`, `note` (≤ 64 characters).

**Packets** `{ path, label?, tone?, sameTime?, lost? }`: every hop must be a visible edge. `label` ≤ 18 characters
("POST /v1/orders", "401", "304 Not Modified"). Tones: `request` (default) indigo, `reply` green, `fail` red (errors,
4xx and 5xx answers, rejections), `data` teal (writes), `event` amber (webhooks, async messages). A `down` node may answer
only with `fail` packets. `lost: true` drops the packet halfway (a timeout, a lost response).

`name` on a flow scene must be unique in the video.

### Lines that sound right

- One or two sentences, at most 240 characters; lines are also captions.
- The voice is text-to-speech. Units and many terms are converted (`src/video/speech.ts`: `10 ms`, `UUID`, `JWT`, `OAuth`,
  `HMAC`, `SHA-256`, `ETag`, `GraphQL`, `CORS`, `C#`). Status codes are fine as numbers ("a 429", "201 Created").
- Do not read paths aloud: "a POST to the orders endpoint", not "POST slash v1 slash orders". Header names are fine:
  "the Idempotency-Key header".
- Never use ` - ` as a dash (read as "minus"); no `#`, `*`, `|`, `<`, `>`, braces or brackets in `say` (a test fails).
- Say "for example", not "e.g.". Do not narrate the slide word for word.

## The practice lab

`export const practice: Practice` (types in `src/practice/types.ts`): steps the learner does in the lab against the
server they pick. The lab sends the requests itself, checks the answers, and shows the curl command for the terminal.

**Shape:** 6 to 12 `try` steps in a teaching order (the happy path, then each rule, then misuse), 1 or 2 `read` steps,
1 or 2 `think` steps, and one `build` step at the end. The test requires at least 4 `try`, 1 `read`, 1 `think` and 1
`build`.

**`try` steps** `{ title, goal, request, expect, save?, notice }`:

- `request`: `method`, `path` (with query), `headers`, a body as `json` (sent as JSON), `raw` (exact text, for broken
  JSON or a wrong Content-Type), or `form` (the token endpoint); `basic: [id, secret]` for client authentication;
  `as: 'reader' | 'writer' | 'partner' | 'admin' | 'free'` to send a Bearer token for that demo client (the lab fetches
  it); `times` and `parallel` to send it several times (rate limits, throttling, races).
- Headers a browser may not set are fine: `Origin`, `Access-Control-Request-Method`, `Access-Control-Request-Headers`
  (the proxy sets them). The lab's proxy does not add `X-Forwarded-*`, so a step can send `X-Forwarded-Proto: https`.
- `{{NAME}}` placeholders: from `vars` (`'uuid'` makes a fresh UUID when the lab opens) or saved by an earlier step with
  `save: { NAME: 'body.id' | 'header.etag' | 'body.access_token' }`. `{{LAB}}` is the lab's own address (webhooks).
  Placeholders also work inside `expect`.
- `expect`: `status`, or `statuses: { 200: 5, 429: 1 }` with `times`; `headers` (name → exact value, `"~part"` contains,
  `true` present, `false` absent); `body` (dotted path → value, `"*"` present, `"~part"`, `"errors.length": 2`);
  `empty: true` for 204 and 304. Check what the step teaches, not every field.
- `notice`: one to three short points on what to look at in the response.
- **Every step must pass on all three servers** with the expectations you write. Where the stacks legitimately differ
  (SPEC.md is silent), expect only what they share and say in `notice` that the stacks differ. Run each request with curl
  against 8001, 8002 and 8003 before you write the expectation.
- Steps must also pass when run again later: use fresh `vars` UUIDs for anything that must be new, and do not depend on
  the exact number of orders or products in the server.
- Rate limits are real: the `free` client has 5 requests a minute, per server. A step that empties the bucket should be
  the last one that uses `free`, and its `notice` should say the bucket refills in a minute.

**`read` steps** `{ title, goal, files: { python, node, dotnet } }`: each `{ path, lines: [from, to], note }`, `path`
inside `APIConcepts/` and in that stack's folder. Point at the 10 to 40 lines that do the work, and check the line numbers
in the real file. `note` says what to look for in that stack (one sentence).

**`think` steps** `{ title, question, answer }`: a production or interview question about the concept, answered in two to
four sentences.

**`build` step** `{ title, task, steps, hints, check?, command?, undo? }`: a change the learner makes in their stack, small
enough for 30 to 60 minutes, that deepens the concept (extend it to another endpoint, add a missing piece, change a limit
and watch it work). `steps` name the files in all three stacks. `hints` (two or three) guide without giving the solution.
`check` is a request plus expect that passes only once the change works (prefer this), and `command` a test command run
from `APIConcepts/` (for example the contract suite: `cd contract-tests && ./run.sh python`). The change must not break the
contract tests, or `undo` must say how to put the code back.

## Checking your work

```bash
cd APIConcepts/tutorial-app
ONLY=<id> npx vitest run src/test/videos.test.tsx src/test/practice.test.ts
PRINT=<id> npx vitest run src/test/transcript.test.ts     # writes .transcripts/<id>.txt
node node_modules/typescript/bin/tsc -p .
```

Then run the practice lab for real on all three servers (they must be running; the lab's dev server on 5195 too, for
webhook inbox steps):

```bash
LIVE=<id> npx vitest run src/test/live.test.ts
```

It sends every `try` step to 8001, 8002 and 8003 with the lab's own runner and lists every check that fails, waits for
inbox deliveries, and confirms that a build step's `check` does **not** pass yet (nobody has made the change). Every
stack must pass. Draft each expectation with curl first. The `free` client's bucket (5 a minute per server) is shared:
wait a minute before running a lab that empties it again.

Read the whole transcript as the learner hears it. Walk each flow scene beat by beat against its lines: does the picture
show exactly what the line says, at that moment? Check every status code, header and number against SPEC.md and the code.

Report in under 10 lines: the files written, the video length, how many practice steps passed on each server, and anything
in the code, the guide or SPEC.md that looked wrong.
