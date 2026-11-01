import { useEffect, useState } from 'react';

// The narrator is the browser's own text-to-speech (speechSynthesis) with an American English
// system voice. It runs on your computer; nothing is sent anywhere.

// macOS ships joke and robot voices under en-US; they are never picked by default.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Fred|Good News|Jester|Junior|Kathy|Organ|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox|Grandma|Grandpa|Eddy|Flo|Reed|Rocko|Sandy|Shelley)\b/;

/** English voices, best first: American premium and enhanced voices, Google's, the well-known natural ones, then the rest. */
export function rankVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const score = (v: SpeechSynthesisVoice) => {
    if (NOVELTY.test(v.name)) return 0;
    let s = /^en[-_]US$/i.test(v.lang) ? 100 : /^en/i.test(v.lang) ? 10 : 0;
    if (s === 0) return 0;
    if (/premium/i.test(v.name)) s += 40;
    else if (/enhanced|natural|neural/i.test(v.name)) s += 30;
    if (/^Google US English/i.test(v.name)) s += 25;
    if (/^(Ava|Samantha|Allison|Evan|Nathan|Zoe|Joelle|Noelle|Tom|Susan|Aaron|Nicky)\b/.test(v.name)) s += 15;
    return s;
  };
  return voices.filter((v) => score(v) > 0).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

function synth(): SpeechSynthesis | undefined {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : undefined;
}

export const canSpeak = () => Boolean(synth());

/** The English voices this browser has, best first. Updates when the browser finishes loading them. */
export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => rankVoices(synth()?.getVoices() ?? []));
  useEffect(() => {
    const s = synth();
    if (!s) return;
    const update = () => setVoices(rankVoices(s.getVoices()));
    update();
    s.addEventListener?.('voiceschanged', update);
    return () => s.removeEventListener?.('voiceschanged', update);
  }, []);
  return voices;
}

// Chrome can drop an utterance that nothing references before it finishes, and then never fires onend.
const live = new Set<SpeechSynthesisUtterance>();

/** How a line ended: read to the end, refused or failed by the engine, or stopped by us. */
export type SpeechEnd = 'end' | 'error' | 'cancel';
export type Speaking = { done: Promise<SpeechEnd>; cancel: () => void };

/**
 * Read one line aloud. `done` says how it ended. Browsers refuse to speak before the first real click
 * on the page (an 'error'), so callers should fall back to timed captions rather than skip ahead.
 */
export function speakLine(text: string, { voice, rate = 1 }: { voice?: string; rate?: number } = {}): Speaking {
  const s = synth();
  if (!s || !text.trim()) return { done: Promise.resolve('error'), cancel: () => {} };
  s.cancel();
  const all = rankVoices(s.getVoices());
  const chosen = all.find((v) => v.name === voice) ?? all[0];
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  if (chosen) u.voice = chosen;
  u.rate = rate;
  live.add(u);
  let finish: (how: SpeechEnd) => void = () => {};
  const done = new Promise<SpeechEnd>((resolve) => {
    finish = (how) => {
      live.delete(u);
      resolve(how);
    };
  });
  u.onend = () => finish('end');
  u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? 'cancel' : 'error');
  s.speak(u);
  return {
    done,
    cancel: () => {
      u.onend = null;
      u.onerror = null;
      s.cancel();
      finish('cancel');
    },
  };
}

export function stopSpeaking() {
  synth()?.cancel();
}

// ---------- written notation → words ----------

const SUPER: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', 'ⁿ': 'n', 'ᵏ': 'k', 'ˣ': 'x', '⁺': '+', '⁻': '-' };
const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ᵢ': 'i', 'ⱼ': 'j', 'ₖ': 'k', 'ₙ': 'n' };
const superRun = new RegExp(`[${Object.keys(SUPER).join('')}]+`, 'g');
const subRun = new RegExp(`[${Object.keys(SUB).join('')}]+`, 'g');

function power(exp: string): string {
  if (exp === '2') return ' squared';
  if (exp === '3') return ' cubed';
  return ` to the ${exp.replace(/-/g, 'minus ')}`;
}

/** Find the `)` that closes the `(` at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Big-O and friends: O(n log n) → "O of n log n", with the inside read as math. */
function bigO(text: string): string {
  let out = '';
  let i = 0;
  const head = /\b([OΘΩ])\(/g;
  for (let m = head.exec(text); m; m = head.exec(text)) {
    const open = m.index + 1;
    const close = closing(text, open);
    if (close < 0) break;
    const name = m[1] === 'O' ? 'O' : m[1] === 'Θ' ? 'theta' : 'omega';
    out += text.slice(i, m.index) + `${name} of ${math(text.slice(open + 1, close))}`;
    i = close + 1;
    head.lastIndex = i;
  }
  return out + text.slice(i);
}

/** Math inside a cost: products, sums, powers, logs and a few named functions. */
function math(expr: string): string {
  return expr
    .replace(/\blog₂\s*/g, 'log base 2 of ')
    .replace(/\s*[·×]\s*/g, ' times ')
    .replace(/(\d|\b[a-zA-Z])\s*√/g, '$1 times √')
    .replace(/(\w)!/g, '$1 factorial')
    .replace(/α\(([^)]*)\)/g, 'alpha of $1')
    .replace(/\bmin\(/g, 'the min of (')
    .replace(/\bmax\(/g, 'the max of (')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turn a caption into words a speech engine reads well. Captions keep the written notation
 * (O(n²), 10⁹ + 7, i ≤ j, a → b); the voice hears "O of n squared", "10 to the 9 plus 7",
 * "i is at most j", "a to b". A test checks that no line leaves a symbol behind.
 */
const BYTES: Record<string, string> = { KB: 'kilobytes', MB: 'megabytes', GB: 'gigabytes', TB: 'terabytes', PB: 'petabytes', EB: 'exabytes' };
const BITS: Record<string, string> = { Kbps: 'kilobits per second', Mbps: 'megabits per second', Gbps: 'gigabits per second', Tbps: 'terabits per second' };
const TIMES: Record<string, string> = { ns: 'nanoseconds', 'µs': 'microseconds', us: 'microseconds', ms: 'milliseconds', s: 'seconds' };
const PER: Record<string, string> = { s: 'second', sec: 'second', second: 'second', min: 'minute', minute: 'minute', h: 'hour', hr: 'hour', hour: 'hour', day: 'day', month: 'month', mo: 'month', year: 'year', yr: 'year' };

/**
 * System-design shorthand the voice would stumble on: 10 ms → "10 milliseconds", 5 GB → "5 gigabytes",
 * 100K → "100 thousand", 2M req/s → "2 million requests per second", p99 → "p 99", ~50 → "about 50", 10x → "10 times".
 */
/** Product and protocol names a voice reads badly, spelled the way engineers say them. */
const SAY_AS: [RegExp, string][] = [
  [/\bgRPC\b/g, 'G R P C'],
  [/\bPostgreSQL\b/g, 'Postgres'],
  [/\bMySQL\b/g, 'My S Q L'],
  [/\bNoSQL\b/g, 'No S Q L'],
  [/\bOAuth\b/g, 'O Auth'],
  [/\bJWTs\b/g, 'J W Ts'],
  [/\bJWT\b/g, 'J W T'],
  [/\bnginx\b/gi, 'engine X'],
  [/\bk8s\b/g, 'Kubernetes'],
  [/\bPKCE\b/g, 'pixie'],
  [/\btraceparent\b/g, 'trace parent'],
  [/\bUUIDs\b/g, 'U U I Ds'],
  [/\bUUID\b/g, 'U U I D'],
  [/\bSHA-256\b/g, 'shah 256'],
  [/\bHMAC\b/g, 'H mac'],
  [/\bETags\b/g, 'E tags'],
  [/\bETag\b/g, 'E tag'],
  [/\bGraphQL\b/g, 'Graph Q L'],
  [/\bFastAPI\b/g, 'Fast A P I'],
  [/\bCORS\b/g, 'cors'],
  [/\bC#/g, 'C sharp'],
  [/\bASP\.NET\b/g, 'A S P dot net'],
  [/\basyncio\b/g, 'async I O'],
  [/\biat\b/g, 'I A T'],
  [/\bjti\b/g, 'J T I'],
  [/\bnbf\b/g, 'N B F'],
  [/\btyp\b/g, 'type'],
  [/\bapi-concepts\b/g, 'A P I concepts'],
  [/(^|[\s(])\.NET\b/g, '$1dot net'],
];

/** "1 gigabytes" → "1 gigabyte"; "1 gigabits per second" → "1 gigabit per second". */
const one = (n: string, unit: string) => (n === '1' ? unit.replace(/s\b/, '') : unit);

export function units(text: string): string {
  for (const [re, said] of SAY_AS) text = text.replace(re, said);
  return text
    .replace(/~\s?(?=[\d$])/g, 'about ')
    .replace(/\s+&\s+/g, ' and ')
    .replace(/\bHTTP\/(\d(?:\.\d)?)/g, 'HTTP $1')
    .replace(/\bp(50|90|95|99)\b/g, 'p $1')
    .replace(/\bp999\b/g, 'p 99.9')
    .replace(/(\d[\d,.]*)\s?(Kbps|Mbps|Gbps|Tbps)\b/g, (_, d: string, u: string) => `${d} ${one(d, BITS[u])}`)
    .replace(/(\d[\d,.]*)\s?(KB|MB|GB|TB|PB|EB)\b/g, (_, d: string, u: string) => `${d} ${one(d, BYTES[u])}`)
    .replace(/(\d[\d,.]*)\s?(ns|µs|ms)\b/g, (_, d: string, u: string) => `${d} ${one(d, TIMES[u])}`)
    .replace(/(\d[\d,.]*) s\b(?!\w)/g, (_, d: string) => `${d} ${one(d, 'seconds')}`)
    .replace(/(\d)\s?K\b/g, '$1 thousand')
    .replace(/(\d)\s?M\b/g, '$1 million')
    .replace(/(\d)\s?B\b/g, '$1 billion')
    .replace(/(\d)x\b/g, '$1 times')
    .replace(/\breq\/(s|sec|second)\b/g, 'requests per second')
    .replace(/([\w%])\/(s|sec|second|min|minute|h|hr|hour|day|month|mo|year|yr)\b/g, (_, w: string, u: string) => `${w} per ${PER[u]}`)
    .replace(/(\d+):(\d+)(?= ratio|\b(?!:))/g, (m: string, a: string, b: string) => (/^\d{1,2}$/.test(a) && b.length === 2 ? m : `${a} to ${b}`))
    .replace(/\bv(\d+)\b/g, 'version $1')
    .replace(/(^|\s)@(?=\s)/g, '$1at')
    .replace(/(^|\s)#(\d)/g, '$1number $2');
}

const TENS: Record<string, string> = { '³': 'a thousand', '⁴': 'ten thousand', '⁵': 'a hundred thousand', '⁶': 'a million', '⁷': 'ten million', '⁸': 'a hundred million', '⁹': 'a billion' };
const BRACKETS: Record<string, string> = { '(': 'open paren', ')': 'close paren', '[': 'open bracket', ']': 'close bracket', '{': 'open brace', '}': 'close brace', '<': 'less-than sign', '>': 'greater-than sign' };

export function toSpeech(caption: string): string {
  let t = units(caption);
  // A bracket character talked about in quotes, as in bracket-matching problems: "]" → "close bracket".
  t = t.replace(/(["'“‘])([()[\]{}<>])(["'”’])/g, (_, _o: string, b: string) => `"${BRACKETS[b]}"`);
  t = t
    .replace(/\s*(?:===|==)\s*/g, ' equals ')
    .replace(/\s*(?:!==|!=)\s*/g, ' is not ')
    .replace(/\s*<=\s*/g, ' is at most ')
    .replace(/\s*>=\s*/g, ' is at least ')
    .replace(/\]\s*\[/g, ', ')
    .replace(/(\w)\^\(([^)]*)\)/g, '$1 to the $2')
    .replace(/(\w)\^(\w+)/g, '$1 to the $2');
  t = bigO(t);
  // Powers of ten in limits read as words: 10⁵ → "a hundred thousand", 2 × 10⁵ → "2 hundred thousand".
  t = t
    .replace(/(\d+)\s*[×·]\s*10([³⁴⁵⁶⁷⁸⁹])(?![⁰¹²³⁴⁵⁶⁷⁸⁹])/g, (_, m: string, e: string) => `${m} ${TENS[e].replace(/^an? /, '')}`)
    .replace(/\b10([³⁴⁵⁶⁷⁸⁹])(?![⁰¹²³⁴⁵⁶⁷⁸⁹])/g, (_, e: string) => TENS[e])
    .replace(/(\d)\s*…\s*(\d)/g, '$1 to $2')
    .replace(/\b([a-z])…([a-z])\b/g, '$1 to $2');
  t = t.replace(/\blog₂\s*\((\w+)\)/g, 'log base 2 of $1').replace(/\blog₂\s*/g, 'log base 2 of ');
  t = t.replace(superRun, (run) => power([...run].map((c) => SUPER[c]).join('')));
  t = t.replace(subRun, (run) => ` ${[...run].map((c) => SUB[c]).join('')}`);
  t = t
    .replace(/(\d)\s*·\s*(?=\d)|(\w)·(?=\w)/g, (_, a, c) => `${a ?? c} times `)
    .replace(/(\d)!(?!\w)/g, '$1 factorial')
    .replace(/(\d)\s*√/g, '$1 times √')
    .replace(/(\w)\s*\.\.\s*(\w)/g, '$1 to $2')
    .replace(/(\d)\s*–\s*(\d)/g, '$1 to $2')
    .replace(/\bC\((\w+),\s*(\w+)\)/g, '$1 choose $2')
    .replace(/\((-?\d+),(-?\d+)\)/g, '($1, $2)')
    .replace(/\bA\*/g, 'A star')
    .replace(/\|(\w+)\|/g, 'the length of $1')
    .replace(/\s+>>>?\s+/g, ' shifted right by ')
    .replace(/\s+<<\s+/g, ' shifted left by ')
    .replace(/\s+\^\s+/g, ' XOR ')
    .replace(/\s+&\s+/g, ' AND ')
    .replace(/\s+\|\s+/g, ' OR ')
    .replace(/~(?=\w)/g, 'NOT ')
    .replace(/√\s*\(([^)]*)\)/g, ' the square root of $1')
    .replace(/√\s*(\w+)/g, ' the square root of $1')
    .replace(/⌊([^⌋]*)⌋/g, 'the floor of $1')
    .replace(/⌈([^⌉]*)⌉/g, 'the ceiling of $1')
    .replace(/\s*≤\s*/g, ' is at most ')
    .replace(/\s*≥\s*/g, ' is at least ')
    .replace(/\s*≠\s*/g, ' is not ')
    .replace(/\s*≈\s*/g, ' is about ')
    .replace(/\s*≡\s*/g, ' is congruent to ')
    .replace(/\s*(?:→|⇒)\s*/g, ' to ')
    .replace(/\s*←\s*/g, ' gets ')
    .replace(/\s*×\s*/g, ' times ')
    .replace(/\s*÷\s*/g, ' divided by ')
    .replace(/\s*±\s*/g, ' plus or minus ')
    .replace(/∞/g, 'infinity')
    .replace(/(^|[\s(])−(?=\d)/g, '$1minus ')
    .replace(/\s*−\s*/g, ' minus ')
    .replace(/(^|[\s(=,[])-(?=\d)/g, '$1minus ')
    .replace(/(\w)\s+-\s+(\w)/g, '$1 minus $2')
    .replace(/\s+=\s+/g, ' equals ')
    .replace(/\s+\+\s+/g, ' plus ')
    .replace(/(\d)\+(\d)/g, '$1 plus $2')
    .replace(/\s+\*\s+/g, ' times ')
    .replace(/([\w)])\s+\/\s+([\w(])/g, '$1 divided by $2')
    .replace(/\s+%\s+/g, ' mod ')
    .replace(/\s+<\s+/g, ' is less than ')
    .replace(/\s+>\s+/g, ' is more than ')
    .replace(/\s*·\s*/g, ', ')
    .replace(/…/g, '...')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\bvs\.?\s/g, 'versus ')
    .replace(/\be\.g\.,?\s*/g, 'for example, ')
    .replace(/\bi\.e\.,?\s*/g, 'that is, ');
  // nums[i] → "nums at i"; a lone bracketed range [2, 5] reads fine without the brackets.
  t = t.replace(/(\w)\[([^\]]+)\]/g, '$1 at $2').replace(/[[\]{}]/g, '');
  return t.replace(/\s{2,}/g, ' ').trim();
}

/** Characters a speech engine skips or reads badly; toSpeech must not leave any behind. */
export const UNSPEAKABLE = /[[\]{}<>=≤≥≠≈≡×÷±→←⇒↑↓⌊⌋⌈⌉∑∏√∞^|&*#@~`\\⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ₀₁₂₃₄₅₆₇₈₉−·ΘΩα]/;
