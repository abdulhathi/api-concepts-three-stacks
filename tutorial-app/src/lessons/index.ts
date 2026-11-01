// What each concept has. A lesson is a folder ./<concept id>/ with
//   video.ts     the video lesson (exports `video: VideoScript`)
//   practice.ts  the practice lab (exports `practice: Practice`)
// and the concept guide is ../docs/concepts/NN-<id>.md, the same file the GitHub repo shows.
// Everything loads on demand.
import { useEffect, useState } from 'react';
import { docName, findTopic, TOPICS } from '../curriculum';
import type { Practice } from '../practice/types';
import { buildTimeline } from '../video/timeline';
import type { VideoScript } from '../video/types';

const videos = import.meta.glob<{ video: VideoScript }>('./*/video.ts');
const practices = import.meta.glob<{ practice: Practice }>('./*/practice.ts');
const guides = import.meta.glob<string>('../../../docs/concepts/*.md', { query: '?raw', import: 'default' });

const idOf = (path: string) => path.split('/')[1];
const guidePath = (id: string) => {
  const t = findTopic(id);
  return t ? `../../../docs/concepts/${docName(t)}.md` : '';
};

export const VIDEO_IDS: ReadonlySet<string> = new Set(Object.keys(videos).map(idOf));
export const PRACTICE_IDS: ReadonlySet<string> = new Set(Object.keys(practices).map(idOf));
export const GUIDE_IDS: ReadonlySet<string> = new Set(TOPICS.filter((t) => guidePath(t.id) in guides).map((t) => t.id));

/** A concept is complete once it has its video, its guide and its practice lab. */
export const isWritten = (id: string) => VIDEO_IDS.has(id) && PRACTICE_IDS.has(id) && GUIDE_IDS.has(id);
export const WRITTEN = TOPICS.filter((t) => isWritten(t.id));
export const WITH_VIDEO = TOPICS.filter((t) => VIDEO_IDS.has(t.id));

export async function loadVideo(id: string): Promise<VideoScript> {
  const load = videos[`./${id}/video.ts`];
  if (!load) throw new Error(`No video lesson for "${id}"`);
  const { video } = await load();
  if (video.id !== id) throw new Error(`Video script ${id}/video.ts declares id "${video.id}"`);
  return video;
}

export async function loadPractice(id: string): Promise<Practice> {
  const load = practices[`./${id}/practice.ts`];
  if (!load) throw new Error(`No practice lab for "${id}"`);
  const { practice } = await load();
  if (practice.id !== id) throw new Error(`Practice ${id}/practice.ts declares id "${practice.id}"`);
  return practice;
}

export async function loadGuide(id: string): Promise<string> {
  const load = guides[guidePath(id)];
  if (!load) throw new Error(`No concept guide for "${id}"`);
  return load();
}

/** Load something for a concept, again whenever the concept changes. */
function useLoaded<T>(id: string, has: boolean, load: (id: string) => Promise<T>) {
  const [state, setState] = useState<{ id?: string; value?: T; error?: string }>({});
  useEffect(() => {
    if (!has) return;
    let live = true;
    load(id).then(
      (value) => live && setState({ id, value }),
      (e: unknown) => live && setState({ id, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [id, has, load]);
  return state.id === id ? state : {};
}

export const useVideo = (id: string) => useLoaded(id, VIDEO_IDS.has(id), loadVideo);
export const usePractice = (id: string) => useLoaded(id, PRACTICE_IDS.has(id), loadPractice);
export const useGuide = (id: string) => useLoaded(id, GUIDE_IDS.has(id), loadGuide);

let lengths: Promise<Record<string, number>> | undefined;

/** Every video's length in ms, once the scripts have loaded (loaded once per visit). */
export function useVideoLengths(): Record<string, number> {
  const [value, setValue] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    lengths ??= Promise.all(
      [...VIDEO_IDS].map((id) => loadVideo(id).then((v) => [id, buildTimeline(v).totalMs] as const).catch(() => [id, 0] as const)),
    ).then((rows) => Object.fromEntries(rows));
    void lengths.then((l) => live && setValue(l));
    return () => {
      live = false;
    };
  }, []);
  return value;
}
