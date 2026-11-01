// A video lesson is data: scenes on a 16:9 stage, each with the lines a narrator reads.
// The player turns the scenes into a timeline of steps (src/video/timeline.ts), speaks each
// line with the browser's voice and shows it as a caption. Architecture diagrams are `flow`
// scenes: boxes and arrows that appear, light up, fail and carry moving requests, one beat per line.

/** What the narrator says. One or two sentences, shown as the caption while it is read. */
export type Line = string;

type SceneBase = {
  /** Small heading at the top of the stage, e.g. "The idea" or "Cache-aside: a read". */
  title: string;
  /** Lines read while the scene is on screen. */
  say: Line[];
};

/** Items appear one per line, starting at line `lead` (default 0). The last line always shows them all. */
type Reveal = { lead?: number };

export type Scene =
  /** The opening card: the topic's name and one sentence on what it is for. */
  | (SceneBase & { kind: 'title'; subtitle: string })
  /** Short statements that appear one at a time. tone: key = the main idea, warn = mistakes, tip = advice. */
  | (SceneBase & Reveal & { kind: 'points'; points: string[]; tone?: 'key' | 'warn' | 'tip' })
  /** An animated architecture diagram: `beats[i]` plays while `say[i]` is read (see FlowScene). */
  | (SceneBase & { kind: 'flow' } & FlowDiagram)
  /** A process as numbered plain-English steps. */
  | (SceneBase & Reveal & { kind: 'steps'; steps: string[] })
  /** Two approaches side by side. The right side appears at line `rightAt`. */
  | (SceneBase & { kind: 'compare'; left: Side; right: Side; rightAt: number })
  /** A small table, one row appearing per line: algorithms, databases, trade-offs. */
  | (SceneBase & Reveal & { kind: 'table'; head: string[]; rows: string[][] })
  /** Big numbers with a label each, appearing one per line: estimates, latencies, limits. */
  | (SceneBase & Reveal & { kind: 'stats'; items: { value: string; label: string }[] })
  /** "When you hear … reach for …" rows, appearing one per line. */
  | (SceneBase & Reveal & { kind: 'signals'; rows: { see: string; think: string }[] })
  /**
   * Pause and think: `say` asks the question, the player waits a few seconds with a countdown,
   * then reveals the answer and reads `answerSay`.
   */
  | (SceneBase & { kind: 'pause'; question: string; answer: string; answerSay: Line[] })
  /**
   * A raw HTTP exchange as text: the request, then the response once line `responseAt` is read.
   * `marks[i]` lights up lines while `say[i]` is read: `req` and `res` are 0-based line indexes.
   */
  | (SceneBase & { kind: 'http'; request: string[]; response?: string[]; responseAt?: number; marks?: HttpMark[] })
  /** The closing card: what to remember, and what to watch next. */
  | (SceneBase & Reveal & { kind: 'recap'; points: string[]; next?: string });

/** Lines to light up in an http scene while one narration line is read. */
export type HttpMark = { req?: number[]; res?: number[] };

export type Side = { label: string; points: string[]; cost?: string; tone?: 'bad' | 'good' };

export type SceneKind = Scene['kind'];
export type FlowScene = Extract<Scene, { kind: 'flow' }>;

export type VideoScript = {
  /** The topic id this video teaches, which is also its folder name and URL. */
  id: string;
  scenes: Scene[];
};

// ---------- flow diagrams ----------

/** The picture on a node, which also sets its color family. */
export type NodeKind =
  // people and devices
  | 'user' | 'client' | 'phone' | 'browser'
  // network edge
  | 'dns' | 'cdn' | 'lb' | 'gateway' | 'internet' | 'firewall'
  // compute
  | 'server' | 'service' | 'worker' | 'function' | 'scheduler' | 'ai'
  // data
  | 'db' | 'cache' | 'queue' | 'stream' | 'storage' | 'search' | 'file'
  // operations and outside services
  | 'monitor' | 'auth' | 'mail' | 'payment' | 'video' | 'map' | 'clock';

export type FlowNode = {
  id: string;
  kind: NodeKind;
  /** Main label under the icon, about 16 characters at most: "Load balancer". */
  label: string;
  /** Optional second line, smaller: "Redis", "primary", "us-east-1". */
  sub?: string;
  /** Grid position: columns 0 to 6 left to right, rows 0 to 3 top to bottom. Halves are fine (2.5). */
  col: number;
  row: number;
  /** Starts hidden; a beat's `show` reveals it. */
  hidden?: boolean;
};

export type FlowEdge = {
  from: string;
  to: string;
  /** Defaults to "from-to"; beats refer to the edge by it. */
  id?: string;
  /** Short text on the line: "HTTPS", "replication", "async". */
  label?: string;
  /** Dashed: asynchronous or occasional traffic. */
  dashed?: boolean;
  /** Arrowheads: 'to' (default), 'both' or 'none'. */
  arrow?: 'to' | 'both' | 'none';
  hidden?: boolean;
};

/** A labeled rectangle behind a group of nodes: a region, an availability zone, a shard, a private network. */
export type FlowZone = {
  id: string;
  label: string;
  /** Corners in grid units, inclusive of the nodes inside: [col, row]. */
  from: [number, number];
  to: [number, number];
  hidden?: boolean;
};

/** A small table next to the nodes whose rows can change: cache entries, queue contents, a log. */
export type FlowPanel = {
  id: string;
  title: string;
  /** Grid position of the panel's center. */
  col: number;
  row: number;
  rows: string[];
  /** Width in px (default 210). */
  width?: number;
  hidden?: boolean;
};

/** The color, and the meaning, of a moving request or message. */
export type PacketTone = 'request' | 'reply' | 'fail' | 'data' | 'event';

export type Packet = {
  /** Node ids the packet travels through, two or more; each hop must be an edge (either direction). */
  path: string[];
  /** A few words on the packet: "GET /cart", "miss", "200 OK", "INSERT". */
  label?: string;
  tone?: PacketTone;
  /** Start together with the previous packet instead of after it. */
  sameTime?: boolean;
  /** Lost on the way: the packet stops halfway along its last hop and vanishes (a dropped packet, a timeout). */
  lost?: boolean;
};

/**
 * What changes while one line is read. `show`, `hide`, `down`, `up`, `cut`, `mend`, `relabel`, `badge` and `rows`
 * last for the rest of the scene; `focus`, `send` and `note` are for this line only.
 */
export type Beat = {
  /** Reveal nodes, edges, zones or panels by id. */
  show?: string[];
  hide?: string[];
  /** Mark nodes as failed (red, crossed out), or bring them back. */
  down?: string[];
  up?: string[];
  /** Break edges by id (a network partition, a dead link): drawn red and broken until `mend`. Packets may still try them. */
  cut?: string[];
  mend?: string[];
  /** Change a node's label or second line: a follower becomes "Leader", a sub becomes "term 2". null removes the sub. */
  relabel?: Record<string, { label?: string; sub?: string | null }>;
  /** A small tag on a node: "HIT", "lag 2 s", "v2", "3/5". null removes it. */
  badge?: Record<string, string | null>;
  /** Replace a panel's rows. */
  rows?: Record<string, string[]>;
  /** Highlight nodes, edges or panels. */
  focus?: string[];
  /** Requests or messages moving along edges; they play in order and loop until the next line. */
  send?: Packet[];
  /** A short callout on the diagram: "Cache miss: go to the database". */
  note?: string;
};

export type FlowDiagram = {
  nodes: FlowNode[];
  edges?: FlowEdge[];
  zones?: FlowZone[];
  panels?: FlowPanel[];
  /** One beat per `say` line, in order. Use {} for a line that changes nothing. */
  beats: Beat[];
  /** A name for the diagram, so the lesson notes can show it with `::diagram <name>`. */
  name?: string;
};
