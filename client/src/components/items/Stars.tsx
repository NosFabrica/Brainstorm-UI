/**
 * Stars, one to five: shown on a review, and picked in a composer. Books and
 * places draw them alike.
 */
import { useState } from "react";
import { Star } from "lucide-react";

const STARS = [1, 2, 3, 4, 5];

/** One to five stars, read out as such. */
export function Stars({
  value,
  size = "sm",
  testId = "review-stars",
}: {
  value: number;
  size?: "sm" | "md";
  testId?: string;
}) {
  const px = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${value} out of 5 stars`}
      data-testid={testId}
    >
      {STARS.map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={`${px} ${n <= value ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700"}`}
        />
      ))}
    </span>
  );
}

/** Five buttons, one per star; the one picked again clears it. */
export function StarPicker({ value, onChange }: { value: number | null; onChange: (stars: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const lit = hover ?? value ?? 0;
  return (
    <span className="inline-flex items-center" onMouseLeave={() => setHover(null)}>
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          onMouseEnter={() => setHover(n)}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
          aria-pressed={value === n}
          className="p-0.5"
        >
          <Star
            aria-hidden="true"
            className={`h-6 w-6 transition-colors ${n <= lit ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200 hover:text-amber-300 dark:fill-slate-700 dark:text-slate-700"}`}
          />
        </button>
      ))}
    </span>
  );
}
