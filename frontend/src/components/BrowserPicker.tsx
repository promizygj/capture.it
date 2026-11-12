import type { Browser } from '../types';

const ALL: { key: Browser; label: string }[] = [
  { key: 'chromium', label: 'Chromium' },
  { key: 'firefox', label: 'Firefox' },
  { key: 'webkit', label: 'WebKit (Safari)' },
];

export function BrowserPicker({ value, onChange }: { value: Browser[]; onChange: (v: Browser[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL.map((b) => {
        const on = value.includes(b.key);
        return (
          <label key={b.key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${on ? 'border-primary bg-primary-soft text-ink' : 'border-line-strong text-ink-2'}`}>
            <input
              type="checkbox"
              className="accent-[var(--color-primary)]"
              checked={on}
              onChange={() => {
                const next = on ? value.filter((x) => x !== b.key) : [...value, b.key];
                if (next.length) onChange(next);
              }}
            />
            {b.label}
          </label>
        );
      })}
    </div>
  );
}
