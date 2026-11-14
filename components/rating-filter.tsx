"use client";

import { useState } from "react";

export function RatingFilter({
  name,
  label,
  initial,
}: {
  name: string;
  label: string;
  initial: number | null;
}) {
  const [enabled, setEnabled] = useState(initial !== null);
  const [score, setScore] = useState(initial ?? 1);

  return (
    <div className="rating-filter">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          aria-label={label + " 필터 사용"}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        {label}
        <output htmlFor={name}>
          {enabled ? score.toFixed(1) + " 이상" : "전체"}
        </output>
      </label>
      <input
        id={name}
        name={enabled ? name : undefined}
        type="range"
        min="1"
        max="5"
        step="0.1"
        value={score}
        aria-label={label + " 최솟값"}
        aria-valuetext={score.toFixed(1) + "점"}
        onChange={(event) => {
          setScore(event.target.valueAsNumber);
          setEnabled(true);
        }}
      />
    </div>
  );
}
