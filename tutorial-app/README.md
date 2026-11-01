# API Concepts Lab

The 27 API concepts of this repo as a course you can follow on your own. Every concept has three parts:

1. **Watch**: a narrated video with animated diagrams and the real HTTP messages.
2. **Learn**: the concept guide from `../docs/concepts`, with the code of all three stacks side by side. Code links open
   the real file beside the guide.
3. **Practice**: steps that send real requests to the Bookshop API on your machine (Python on 8001, TypeScript on 8002,
   C# on 8003), check the answers, show the curl command, open the code that did it, and end with something to build
   yourself.

Each concept page tracks six study steps: watch, read, practice on one stack, practice on a second, build, and answer the
interview questions out loud.

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
