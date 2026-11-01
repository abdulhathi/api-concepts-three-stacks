import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTimeline, clock } from '../video/timeline';
import { loadVideo } from '../lessons';

// Writes a video's transcript, with timestamps and what the voice will actually say where it differs,
// to .transcripts/<id>.txt (git-ignored):
//   PRINT=caching,cdn npx vitest run src/test/transcript.test.ts
// Skipped in a normal test run.
const ids = process.env.PRINT?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

describe.skipIf(ids.length === 0)('transcript', () => {
  it.each(ids)('%s', async (id) => {
    const video = await loadVideo(id);
    const tl = buildTimeline(video);
    const out: string[] = [`\n===== ${id}: ${clock(tl.totalMs)}, ${video.scenes.length} scenes, ${tl.steps.length} captions =====`];
    tl.steps.forEach((s, i) => {
      if (tl.sceneStarts.includes(i)) out.push(`\n[${clock(tl.starts[i])}] Scene ${s.scene + 1}: ${video.scenes[s.scene].kind} · ${video.scenes[s.scene].title}`);
      out.push(`  ${s.caption}`);
      if (s.speech && s.speech !== s.caption) out.push(`    voice: ${s.speech}`);
    });
    mkdirSync('.transcripts', { recursive: true });
    writeFileSync(`.transcripts/${id}.txt`, out.join('\n') + '\n');
    expect(tl.steps.length).toBeGreaterThan(0);
  });
});
