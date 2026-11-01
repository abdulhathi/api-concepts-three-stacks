import { describe, expect, it } from 'vitest';
import { toSpeech, UNSPEAKABLE } from '../video/speech';

describe('toSpeech: system design shorthand', () => {
  it.each([
    ['A read from memory takes about 100 ns.', 'A read from memory takes about 100 nanoseconds.'],
    ['p99 latency is 250 ms.', 'p 99 latency is 250 milliseconds.'],
    ['That is ~1,200 req/s at peak.', 'That is about 1,200 requests per second at peak.'],
    ['Store 5 TB a year, 15 TB with 3 replicas.', 'Store 5 terabytes a year, 15 terabytes with 3 replicas.'],
    ['100M daily users and 10K writes/s.', '100 million daily users and 10 thousand writes per second.'],
    ['A 100:1 read to write ratio.', 'A 100 to 1 read to write ratio.'],
    ['Reads are 10x cheaper.', 'Reads are 10 times cheaper.'],
    ['HTTP/2 multiplexes streams.', 'HTTP 2 multiplexes streams.'],
    ['UUID v7 sorts by time.', 'U U I D version 7 sorts by time.'],
    ['Wait 2 s, then 4 s.', 'Wait 2 seconds, then 4 seconds.'],
    ['R + W > N means overlap.', 'R plus W is more than N means overlap.'],
    ['A lookup is O(1).', 'A lookup is O of 1.'],
    ['Cache → database.', 'Cache to database.'],
    ['Reads & writes.', 'Reads and writes.'],
    ['1 Gbps links.', '1 gigabit per second links.'],
    ['A 1 GB video takes 1 ms, then 1.5 s.', 'A 1 gigabyte video takes 1 millisecond, then 1.5 seconds.'],
    ['Peak egress is 2 Tbps.', 'Peak egress is 2 terabits per second.'],
    ['gRPC calls into PostgreSQL and MySQL.', 'G R P C calls into Postgres and My S Q L.'],
    ['OAuth hands out JWTs.', 'O Auth hands out J W Ts.'],
    ['PKCE guards the code; traceparent carries the id.', 'pixie guards the code; trace parent carries the id.'],
  ])('%s', (caption, speech) => {
    expect(toSpeech(caption)).toBe(speech);
    expect(toSpeech(caption)).not.toMatch(UNSPEAKABLE);
  });

  it('leaves times of day alone', () => {
    expect(toSpeech('The job runs at 9:30 every day.')).toBe('The job runs at 9:30 every day.');
  });
});
