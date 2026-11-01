import { useState } from 'react';

/** A command or snippet with a copy button. */
export function CopyBlock({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = () =>
    void navigator.clipboard?.writeText(text).then(
      () => {
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      },
      () => undefined,
    );
  return (
    <div className="copy-block">
      <pre>
        <code>{text}</code>
      </pre>
      <button type="button" className="chip-btn copy-btn" onClick={copy}>
        {done ? 'Copied ✓' : label}
      </button>
    </div>
  );
}
