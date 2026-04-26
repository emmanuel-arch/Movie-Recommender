'use client';
/**
 * NairobiClock — a live, cinematic clock + date card for Africa/Nairobi.
 *
 * Used on /signup (and reusable elsewhere). Ticks every second client-side,
 * SSR-safe (renders a stable skeleton on the server so React doesn't throw a
 * hydration mismatch when the time updates on the client).
 *
 * Visual:
 *   ┌──────────────────────────────────────────────────┐
 *   │  ● Nairobi · EAT (UTC+3)                         │
 *   │                                                  │
 *   │   06 : 05  ·  14          Sunday                 │  ← time + date
 *   │                           26 April 2026          │    side-by-side
 *   │   ║║║║│║║║║│║║║║│║║║║│║║║║│║║║║│                 │  ← 60-tick second rail
 *   │   00       15        30        45        60      │
 *   └──────────────────────────────────────────────────┘
 *
 * Sizes scale with viewport so it looks good in the left column on desktop
 * AND when stacked above the form on mobile.
 */

import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';

const NAIROBI_TZ = 'Africa/Nairobi';

interface ClockParts {
  hour: string;
  minute: string;
  second: string;
  weekday: string;
  day: string;
  monthYear: string;
}

function getNairobiParts(d: Date): ClockParts {
  // Use Intl so the user's local timezone never leaks into the display.
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: NAIROBI_TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const parts = dtf.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
    weekday: get('weekday'),
    day: get('day'),
    monthYear: `${get('month')} ${get('year')}`,
  };
}

export default function NairobiClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const placeholder = !now;
  const p = now ? getNairobiParts(now) : null;
  const sec = p ? Number(p.second) : 0;

  // 60-tick rail geometry. Cached because the array of indices never changes.
  const tickIndices = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent backdrop-blur-md p-6 sm:p-8 lg:p-9 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.6)]">
      {/* Ambient red accents — purely decorative */}
      <div className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full bg-birgen-red/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-12 w-56 h-56 rounded-full bg-birgen-red/10 blur-3xl" />

      {/* Location badge */}
      <div className="relative flex items-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-[0.22em] text-birgen-red font-semibold">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-birgen-red opacity-70 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-birgen-red" />
        </span>
        <MapPin className="w-3 h-3" aria-hidden />
        <span>Nairobi · EAT (UTC+3)</span>
      </div>

      {/* Time + date row — time on the left, weekday/date stacked on the
          right. Keeps the card shorter so the page breathes. */}
      <div
        className="relative mt-5 sm:mt-6 flex items-end justify-between gap-4 sm:gap-6"
        aria-live="polite"
        aria-label={p ? `${p.hour}:${p.minute}:${p.second} Nairobi time` : 'Loading time'}
      >
        <div className="font-display text-white leading-none tabular-nums tracking-tight flex items-baseline">
          <span className="text-[48px] sm:text-[68px] lg:text-[82px]">
            {placeholder ? '--' : p!.hour}
          </span>
          <span className="text-[48px] sm:text-[68px] lg:text-[82px] mx-1 sm:mx-1.5 text-birgen-red animate-pulse">
            :
          </span>
          <span className="text-[48px] sm:text-[68px] lg:text-[82px]">
            {placeholder ? '--' : p!.minute}
          </span>
          <span
            className="ml-2 sm:ml-3 lg:ml-4 text-[18px] sm:text-[24px] lg:text-[28px] text-birgen-silver tabular-nums"
            aria-hidden
          >
            · {placeholder ? '--' : p!.second}
          </span>
        </div>

        <div className="text-right shrink-0 pb-1 sm:pb-1.5">
          <div className="text-white/95 text-sm sm:text-base lg:text-lg font-medium leading-tight">
            {placeholder ? 'Loading…' : p!.weekday}
          </div>
          <div className="text-birgen-silver text-[12px] sm:text-[13px] lg:text-sm mt-0.5 leading-tight">
            {placeholder ? '\u00A0' : `${p!.day} ${p!.monthYear}`}
          </div>
        </div>
      </div>

      {/* 60-tick second rail — minimalist watchmaker scale, not a Netflix arc */}
      <div className="relative mt-4 sm:mt-5">
        <svg
          viewBox="0 0 600 40"
          preserveAspectRatio="none"
          className="w-full h-7 sm:h-8"
          aria-hidden
        >
          {tickIndices.map((i) => {
            const x = i * 10 + 3;
            const isQuarter = i % 15 === 0;
            const isFive = i % 5 === 0;
            const h = isQuarter ? 34 : isFive ? 24 : 14;
            const y = 40 - h;
            let fill = 'rgba(255,255,255,0.10)';
            if (!placeholder) {
              if (i < sec) fill = 'rgba(255,255,255,0.32)';
              if (i === sec) fill = '#FF1E2D';
            }
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={4}
                height={h}
                rx={1}
                fill={fill}
                style={{ transition: 'fill 200ms linear' }}
              />
            );
          })}
        </svg>
        {/* 0 / 15 / 30 / 45 quarter labels */}
        <div className="hidden sm:flex justify-between text-[9px] uppercase tracking-[0.18em] text-birgen-muted font-mono mt-1">
          <span>00</span>
          <span>15</span>
          <span>30</span>
          <span>45</span>
          <span>60</span>
        </div>
      </div>

    </div>
  );
}
