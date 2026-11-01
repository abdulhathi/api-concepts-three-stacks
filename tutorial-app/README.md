# API Concepts Lab

The 27 API concepts of this repo as a course you can follow on your own. Every concept has four parts:

1. **Watch**: a narrated video with animated diagrams and the real HTTP messages.
2. **Learn**: the concept guide from `../docs/concepts`, with the code of all three stacks side by side. Code links open
   the real file beside the guide.
3. **Practice**: steps that send real requests to the Bookshop API on your machine (Python on 8001, TypeScript on 8002,
   C# on 8003), check the answers, show the curl command, open the code that did it, and end with something to build
   yourself.
4. **Build**: write the concept yourself in your own API
   ([bookshop-api-handbuilt](https://github.com/abdulhathi/bookshop-api-handbuilt)): what to build, the contract tests
   that must pass, and `./check.sh <stack> <concept>` to grade it. The Practice tab can also send its requests to your
   own servers (ports 9001 to 9003) with “My servers”.

Each concept page tracks six study steps: watch, read, practice on one stack, practice on a second, build it in your own
API, and answer the interview questions out loud. The dev server reads your repo's `progress.json` (`HANDBUILT_DIR`,
default `bookshop-api-handbuilt` next to the github-portfolio folder) to tick the build step.

```bash
npm install
npm run dev -- --port 5195   # http://localhost:5195 (Study Hub starts it on 5195 too)
npm test
npm run typecheck
```

Start at least one API server first (Study Hub: API Concepts · Python, TypeScript or C#). The dev server proxies
`/stack/python|node|dotnet/…` to them, so practice requests need no CORS, and it receives webhook deliveries at
`/lab/inbox/<box>` for the webhooks lab (`server/lab.ts`).

- The course outline is `src/curriculum.ts`. A lesson is `src/lessons/<id>/`: `video.ts` and `practice.ts`.
  `LESSON-GUIDE.md` is the writer brief, and `src/lessons/idempotency/` is the template.
- Videos are data, not recordings: the player (`src/video/`) reads each line with the browser's American English voice,
  at 0.75× to 1.75×. Diagrams are drawn by `src/flow/`; `http` scenes show requests and responses line by line.
- Progress stays in this browser.
- Select any word or sentence to translate it to Tamil, hear it, or ask Claude about it (the word helper shared by every
  study app).
