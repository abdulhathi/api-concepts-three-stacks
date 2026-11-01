// The word helper behind the select-a-word popup:
//   GET  /api/words/translate?text=…&target=ta   English → target language (MyMemory, free, no key)
//   POST /api/words/explain  { text, context?, model? }   a short plain-English explanation from Claude
//   POST /api/words/ask      { text, context?, question, history?, model? }   Claude answers your question about it
// Both answers are cached for a day. Requests must come from the app's own page (custom header + Origin check), so
// other websites cannot spend your API credit, and a rate limit caps runaway use. Claude credentials come from the
// environment the SDK reads: ANTHROPIC_API_KEY, or an `ant auth login` profile.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import type { Plugin } from 'vite';

export const WORD_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
type WordModel = (typeof WORD_MODELS)[number];
const FALLBACK_MODELS = new Set<WordModel>(['claude-opus-5-5', 'claude-sonnet-5-5']);

const MAX_TEXT = 500;
const MAX_CONTEXT = 6000;
const MAX_QUESTION = 500;
const MAX_TURNS = 6; // earlier questions and answers sent back for follow-ups
const MAX_ANSWER = 4000;
const DAY_MS = 24 * 60 * 60 * 1000;

const SYSTEM_PROMPT =
  'You explain a highlighted word, phrase, or sentence for someone who is studying. ' +
  'When surrounding text from the document is provided, tailor the explanation to how the term ' +
  'is actually used there: its meaning in that specific context, not just a generic definition. ' +
  'Reply with a short, plain-English explanation in 1-3 sentences: define the term, say what ' +
  'it means in plain words, and, if it is jargon, an idiom, or technical, add a quick example. ' +
  'No preamble, no markdown, no bullet points, no quoting the term back. ' +
  'Never comment on whether context was or was not provided; just give the explanation. Be concise.';

const ASK_PROMPT =
  'You are a study assistant. The reader highlighted a word, phrase, or sentence while reading and asked a question ' +
  'about it. Answer the question directly, using the highlighted text and the surrounding passage as context. ' +
  'Be accurate and concise: usually 2-5 sentences in plain English. Define jargon, and add a short example when it ' +
  'helps. If the passage does not contain the answer, answer from general knowledge. Plain text only: no markdown ' +
  'headings or bullet lists; short code may go in backticks. No preamble, and do not repeat the question.';

export type Turn = { question: string; answer: string };

/**
 * The conversation for a question: the passage, the highlighted text and the first question in the first message,
 * then earlier answers and follow-up questions in turn. A turn with an empty question stands for an Explain answer.
 */
export function askMessages(term: string, context: string, history: Turn[], question: string): { role: 'user' | 'assistant'; content: string }[] {
  const firstQuestion = history.length ? history[0].question || 'Explain this term as it is used in the passage.' : question;
  const opening = [
    ...(context ? ['--- passage the reader is looking at ---', context, '--- end passage ---', ''] : []),
    `Highlighted text: ${term}`,
    '',
    `Question: ${firstQuestion}`,
  ].join('\n');
  const messages: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: opening }];
  history.forEach((t, i) => {
    if (i > 0) messages.push({ role: 'user', content: t.question || 'Explain this term as it is used in the passage.' });
    messages.push({ role: 'assistant', content: t.answer });
  });
  if (history.length) messages.push({ role: 'user', content: question });
  return messages;
}

/** With the passage the reader is looking at, ask for the meaning there; without it, a standalone definition. */
export function explainPrompt(term: string, context: string): string {
  if (!context) return term;
  return [
    'The reader is studying the passage below and highlighted a term within it. Use the passage as',
    'context so the explanation matches how the term is used here.',
    '',
    '--- passage the reader is looking at ---',
    context,
    '--- end passage ---',
    '',
    `Explain this highlighted term/phrase as it is used in that passage: ${term}`,
  ].join('\n');
}

/** MyMemory escapes HTML entities; decode the common ones (numeric first, &amp; last). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (m, n: string) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return m;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (m, n: string) => {
      try {
        return String.fromCodePoint(parseInt(n, 16));
      } catch {
        return m;
      }
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const SCRIPT: Record<string, RegExp> = { ta: /[஀-௿]/, hi: /[ऀ-ॿ]/, te: /[ఀ-౿]/, ml: /[ഀ-ൿ]/, kn: /[ಀ-೿]/ };

/** Keep real translations: in the target script when we know it, not English noise, not the input echoed back. */
export function pickTranslations(input: string, target: string, candidates: string[]): string[] {
  const lower = input.toLowerCase();
  const phrase = /\s/.test(input);
  const script = SCRIPT[target];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    const c = decodeEntities(raw.trim());
    const norm = c.toLowerCase();
    if (!c || norm === lower || seen.has(norm)) continue;
    if (script && !script.test(c)) continue;
    if (/^[\x00-\x7F]+$/.test(c)) continue;
    if (!phrase && (c.length > 80 || c.split(/\s+/).length > 8)) continue;
    seen.add(norm);
    out.push(c);
    if (out.length >= (phrase ? 5 : 8)) break;
  }
  return out;
}

class Cache<T> {
  private map = new Map<string, { value: T; expires: number }>();
  constructor(private max: number, private now: () => number) {}
  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < this.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key); // most recently used goes to the end
    this.map.set(key, hit);
    return hit.value;
  }
  set(key: string, value: T) {
    this.map.set(key, { value, expires: this.now() + DAY_MS });
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 32_000): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('Request too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

type Options = {
  /** The custom header the app's own page sends, e.g. "x-interview-library". */
  header: string;
  client?: Anthropic;
  fetchImpl?: typeof fetch;
  now?: () => number;
  defaultModel?: WordModel;
};

export function createWordsHandler({ header, client, fetchImpl = fetch, now = () => Date.now(), defaultModel = 'claude-opus-5-5' }: Options) {
  const translations = new Cache<string[]>(2000, now);
  const explanations = new Cache<{ text: string; model: string }>(1000, now);
  const answers = new Cache<{ text: string; model: string }>(1000, now);
  type Kind = 'translate' | 'explain' | 'ask';
  const calls: Record<Kind, number[]> = { translate: [], explain: [], ask: [] };
  const LIMITS: Record<Kind, number> = { translate: 200, explain: 60, ask: 60 }; // per 10 minutes
  let anthropic = client;

  const fromOwnPage = (req: IncomingMessage) => {
    if (req.headers[header] !== '1') return false;
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  };
  const allow = (kind: Kind) => {
    const t = now();
    calls[kind] = calls[kind].filter((c) => t - c < 10 * 60 * 1000);
    if (calls[kind].length >= LIMITS[kind]) return false;
    calls[kind].push(t);
    return true;
  };

  async function translate(text: string, target: string) {
    const key = `${target}:${text.toLowerCase()}`;
    const hit = translations.get(key);
    if (hit) return { status: 200, body: { text, target, translations: hit, cached: true } };
    if (!allow('translate')) return { status: 429, body: { error: 'Too many translations in ten minutes. Try again shortly.' } };
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', text);
    url.searchParams.set('langpair', `en|${target}`);
    try {
      const r = await fetchImpl(url, { headers: { 'User-Agent': 'study-apps/1.0' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return { status: 502, body: { error: `The translation service answered ${r.status}.` } };
      const data = (await r.json()) as { responseData?: { translatedText?: string }; matches?: { translation?: string }[] };
      const list = pickTranslations(text, target, [data.responseData?.translatedText ?? '', ...(data.matches ?? []).map((m) => m.translation ?? '')]);
      if (!list.length) return { status: 502, body: { error: 'No translation came back for that.' } };
      translations.set(key, list);
      return { status: 200, body: { text, target, translations: list, cached: false } };
    } catch (e) {
      return { status: 502, body: { error: `Translation failed: ${e instanceof Error ? e.message : String(e)}` } };
    }
  }

  async function explain(text: string, context: string, model: WordModel) {
    const ctx = context ? createHash('sha1').update(context).digest('hex').slice(0, 12) : '';
    const key = `${model}:${ctx}:${text.toLowerCase()}`;
    const hit = explanations.get(key);
    if (hit) return { status: 200, body: { text, explanation: hit.text, model: hit.model, cached: true } };
    if (!allow('explain')) return { status: 429, body: { error: 'That is a lot of explanations in ten minutes. Take a short break, then try again.' } };
    const r = await claude(model, SYSTEM_PROMPT, [{ role: 'user', content: explainPrompt(text, context) }], 'low');
    if ('error' in r) return r.error;
    explanations.set(key, { text: r.text, model: r.model });
    return { status: 200, body: { text, explanation: r.text, model: r.model, cached: false } };
  }

  async function ask(text: string, context: string, history: Turn[], question: string, model: WordModel) {
    const digest = createHash('sha1').update(JSON.stringify([context, history, question])).digest('hex').slice(0, 16);
    const key = `${model}:${digest}:${text.toLowerCase()}`;
    const hit = answers.get(key);
    if (hit) return { status: 200, body: { text, question, answer: hit.text, model: hit.model, cached: true } };
    if (!allow('ask')) return { status: 429, body: { error: 'That is a lot of questions in ten minutes. Take a short break, then try again.' } };
    const r = await claude(model, ASK_PROMPT, askMessages(text, context, history, question), 'medium');
    if ('error' in r) return r.error;
    answers.set(key, { text: r.text, model: r.model });
    return { status: 200, body: { text, question, answer: r.text, model: r.model, cached: false } };
  }

  /** One Claude call; returns the text and the model that answered, or an HTTP error to send back. */
  async function claude(
    model: WordModel,
    system: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    effort: 'low' | 'medium',
  ): Promise<{ text: string; model: string } | { error: { status: number; body: { error: string } } }> {
    try {
      anthropic ??= new Anthropic();
      const response = await anthropic.beta.messages.create({
        model,
        max_tokens: 1024,
        ...(FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        output_config: { effort },
        system,
        messages,
      });
      const text = response.content
        .flatMap((b) => (b.type === 'text' ? [b.text] : []))
        .join('')
        .trim();
      if (!text) return { error: { status: 502, body: { error: 'Claude returned no answer.' } } };
      return { text, model: response.model };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || /authentication|api key|credentials/i.test(String(e)))
        return { error: { status: 503, body: { error: 'Claude is not signed in. Run `ant auth login` in a terminal (or set ANTHROPIC_API_KEY), then restart the app.' } } };
      if (e instanceof Anthropic.RateLimitError) return { error: { status: 429, body: { error: 'The Claude API is rate limiting. Wait a minute and try again.' } } };
      return { error: { status: 502, body: { error: `Claude failed: ${e instanceof Error ? e.message : String(e)}` } } };
    }
  }

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://app');
    const path = url.pathname.replace(/\/+$/, '');
    if (path !== '/translate' && path !== '/explain' && path !== '/ask') return next();
    if (!fromOwnPage(req)) return send(res, 403, { error: 'Requests must come from this app’s own page.' });
    try {
      if (path === '/translate' && req.method === 'GET') {
        const text = (url.searchParams.get('text') ?? '').trim();
        const target = url.searchParams.get('target') ?? 'ta';
        if (!text) return send(res, 400, { error: 'Select some text first.' });
        if (text.length > MAX_TEXT) return send(res, 400, { error: `That selection is too long (at most ${MAX_TEXT} characters).` });
        if (!/^[a-z]{2}(-[A-Z]{2})?$/i.test(target)) return send(res, 400, { error: 'Unknown language code.' });
        const r = await translate(text, target);
        return send(res, r.status, r.body);
      }
      if (path === '/explain' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { text?: unknown; context?: unknown; model?: unknown };
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        const context = typeof body.context === 'string' ? body.context.trim().slice(0, MAX_CONTEXT) : '';
        const model = (WORD_MODELS as readonly unknown[]).includes(body.model) ? (body.model as WordModel) : defaultModel;
        if (!text) return send(res, 400, { error: 'Select some text first.' });
        if (text.length > MAX_TEXT) return send(res, 400, { error: `That selection is too long (at most ${MAX_TEXT} characters).` });
        const r = await explain(text, context, model);
        return send(res, r.status, r.body);
      }
      if (path === '/ask' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req, 64_000)) as { text?: unknown; context?: unknown; question?: unknown; history?: unknown; model?: unknown };
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        const question = typeof body.question === 'string' ? body.question.trim() : '';
        const context = typeof body.context === 'string' ? body.context.trim().slice(0, MAX_CONTEXT) : '';
        const model = (WORD_MODELS as readonly unknown[]).includes(body.model) ? (body.model as WordModel) : defaultModel;
        const raw = Array.isArray(body.history) ? body.history : [];
        const history = raw
          .filter((t): t is Turn => !!t && typeof t === 'object' && typeof (t as Turn).question === 'string' && typeof (t as Turn).answer === 'string')
          .slice(-MAX_TURNS)
          .map((t) => ({ question: t.question.slice(0, MAX_QUESTION), answer: t.answer.slice(0, MAX_ANSWER) }));
        if (!text) return send(res, 400, { error: 'Select some text first.' });
        if (text.length > MAX_TEXT) return send(res, 400, { error: `That selection is too long (at most ${MAX_TEXT} characters).` });
        if (!question) return send(res, 400, { error: 'Type a question first.' });
        if (question.length > MAX_QUESTION) return send(res, 400, { error: `That question is too long (at most ${MAX_QUESTION} characters).` });
        const r = await ask(text, context, history, question, model);
        return send(res, r.status, r.body);
      }
      return next();
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
  };
}

export function wordsPlugin(options: Options): Plugin {
  return {
    name: 'word-helper',
    configureServer(server) {
      server.middlewares.use('/api/words', createWordsHandler(options));
    },
  };
}
