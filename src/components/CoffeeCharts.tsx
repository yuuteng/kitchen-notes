import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Method, Shot } from '../lib/api';
import { EASE } from '../lib/hooks';

const W = 340;
const H = 230;
const PAD = { l: 38, r: 12, t: 12, b: 30 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

const TARGET: Record<Method, { time: [number, number]; ratio: [number, number] }> = {
  espresso: { time: [25, 30], ratio: [1.8, 2.2] },
  pourover: { time: [120, 180], ratio: [15, 17] },
};

const SCORE_COLOR = (s: number | null) => (s === null ? 'none' : s >= 7 ? '#FF8A65' : s >= 5 ? '#A8705F' : '#5C4D4B');
const TASTE_COLOR = (t: number | null) => (t === null ? 'none' : t < 0 ? '#F6F3FA' : t > 0 ? '#6E5750' : '#FF8A65');

/** Linear scale with padding so points never sit on the axes. */
function scale(values: number[], minSpan: number, pad: number) {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  lo -= pad;
  hi += pad;
  return { lo, hi, at: (v: number) => (v - lo) / (hi - lo) };
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Number(v.toFixed(1)).toString());
const secs = (v: number, method: Method) => (method === 'pourover' ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : `${fmt(v)}s`);

interface Props {
  method: Method;
  shots: Shot[];
  current: { grind: number; time_s: number; ratio: number };
}

type Tab = 'map' | 'ratio' | 'trend';
const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: '研磨 / 时间' },
  { id: 'ratio', label: '粉液比 / 时间' },
  { id: 'trend', label: '评分趋势' },
];

function Legend({ items }: { items: [string, string][] }) {
  return (
    <span className="flex items-center gap-3 text-xs text-sub">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-white/40" style={{ background: color }} />
          {label}
        </span>
      ))}
    </span>
  );
}

export default function CoffeeCharts({ method, shots, current }: Props) {
  const [tab, setTab] = useState<Tab>('map');
  const target = TARGET[method];

  const mapPts = shots.filter((s) => s.grind !== null && s.time_s !== null) as (Shot & { grind: number; time_s: number })[];
  const ratioPts = shots
    .filter((s) => s.time_s !== null && s.dose && s.yield_g !== null)
    .map((s) => ({ id: s.id, time: s.time_s as number, ratio: (s.yield_g as number) / (s.dose as number), taste: s.taste }));
  const trendPts = shots.filter((s) => s.score !== null) as (Shot & { score: number })[];

  const x = (f: number) => PAD.l + f * PW;
  const y = (f: number) => PAD.t + (1 - f) * PH;

  let body: ReactNode;
  let caption = '';
  let legend: [string, string][] = [];

  if (tab === 'map') {
    const sx = scale([...mapPts.map((p) => p.grind), current.grind], 0.6, 0.1);
    const sy = scale([...mapPts.map((p) => p.time_s), current.time_s, ...target.time], 10, method === 'pourover' ? 15 : 3);
    caption = '横轴为研磨度（左细右粗），纵轴为萃取时间，白色圆环为当前参数';
    legend = [
      ['#5C4D4B', '评分 1–4'],
      ['#A8705F', '5–6'],
      ['#FF8A65', '7–10'],
    ];
    body = (
      <>
        <rect x={PAD.l} y={y(sy.at(target.time[1]))} width={PW} height={y(sy.at(target.time[0])) - y(sy.at(target.time[1]))} fill="rgba(255,138,101,.15)" stroke="#8A5C50" strokeDasharray="4 3" />
        <text x={W - PAD.r - 4} y={y(sy.at(target.time[1])) + 12} textAnchor="end" fontSize="10" fill="#F0B8A6">
          目标区间 {secs(target.time[0], method)}–{secs(target.time[1], method)}
        </text>
        <text x={PAD.l - 6} y={PAD.t + 9} textAnchor="end" fontSize="10" fill="#D2CADC">
          {secs(sy.hi, method)}
        </text>
        <text x={PAD.l - 6} y={H - PAD.b} textAnchor="end" fontSize="10" fill="#D2CADC">
          {secs(sy.lo, method)}
        </text>
        <text x={PAD.l} y={H - 10} fontSize="10" fill="#D2CADC">
          细 {fmt(sx.lo)}
        </text>
        <text x={W - PAD.r} y={H - 10} textAnchor="end" fontSize="10" fill="#D2CADC">
          {fmt(sx.hi)} 粗
        </text>
        {mapPts.map((p) => (
          <motion.circle key={p.id} cx={x(sx.at(p.grind))} cy={y(sy.at(p.time_s))} r="6" fill={SCORE_COLOR(p.score)} stroke={p.score === null ? '#D2CADC' : 'none'} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE }}>
            <title>{`研磨 ${p.grind} · ${secs(p.time_s, method)}${p.score !== null ? ` · 评分 ${p.score}` : ''}`}</title>
          </motion.circle>
        ))}
        <motion.g initial={false} animate={{ x: x(sx.at(current.grind)), y: y(sy.at(current.time_s)) }} transition={{ duration: 0.45, ease: EASE }}>
          <circle r="10" fill="none" stroke="#FF8A65" strokeWidth="2" className="[animation:ring_1.8s_ease-out_infinite] [transform-box:fill-box] [transform-origin:center]" />
          <circle r="10" fill="none" stroke="#FFFFFF" strokeWidth="2" />
        </motion.g>
      </>
    );
  } else if (tab === 'ratio') {
    const sx = scale([...ratioPts.map((p) => p.time), current.time_s, ...target.time], 10, method === 'pourover' ? 15 : 3);
    const sy = scale([...ratioPts.map((p) => p.ratio), current.ratio, ...target.ratio], method === 'pourover' ? 4 : 1, method === 'pourover' ? 1 : 0.2);
    caption = '横轴为萃取时间，纵轴为粉液比，虚线框为目标区间，白色圆环为当前参数';
    legend = [
      ['#F6F3FA', '偏酸'],
      ['#FF8A65', '平衡'],
      ['#6E5750', '偏苦'],
    ];
    body = (
      <>
        <rect
          x={x(sx.at(target.time[0]))}
          y={y(sy.at(target.ratio[1]))}
          width={x(sx.at(target.time[1])) - x(sx.at(target.time[0]))}
          height={y(sy.at(target.ratio[0])) - y(sy.at(target.ratio[1]))}
          fill="rgba(255,138,101,.15)"
          stroke="#8A5C50"
          strokeDasharray="4 3"
        />
        <text x={PAD.l - 6} y={PAD.t + 9} textAnchor="end" fontSize="10" fill="#D2CADC">
          1:{fmt(sy.hi)}
        </text>
        <text x={PAD.l - 6} y={H - PAD.b} textAnchor="end" fontSize="10" fill="#D2CADC">
          1:{fmt(sy.lo)}
        </text>
        <text x={PAD.l} y={H - 10} fontSize="10" fill="#D2CADC">
          {secs(sx.lo, method)}
        </text>
        <text x={W - PAD.r} y={H - 10} textAnchor="end" fontSize="10" fill="#D2CADC">
          {secs(sx.hi, method)}
        </text>
        {ratioPts.map((p) => (
          <motion.circle key={p.id} cx={x(sx.at(p.time))} cy={y(sy.at(p.ratio))} r="6" fill={TASTE_COLOR(p.taste)} stroke={p.taste === null ? '#D2CADC' : 'none'} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE }}>
            <title>{`${secs(p.time, method)} · 1:${p.ratio.toFixed(1)}`}</title>
          </motion.circle>
        ))}
        <motion.g initial={false} animate={{ x: x(sx.at(current.time_s)), y: y(sy.at(current.ratio)) }} transition={{ duration: 0.45, ease: EASE }}>
          <circle r="10" fill="none" stroke="#FFFFFF" strokeWidth="2" />
        </motion.g>
      </>
    );
  } else {
    const n = Math.max(trendPts.length - 1, 1);
    const px = (i: number) => x(trendPts.length === 1 ? 0.5 : i / n);
    const py = (s: number) => y((s - 1) / 9);
    caption = '按记录时间先后排列，纵轴为评分';
    body = (
      <>
        {[1, 5, 10].map((s) => (
          <g key={s}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(s)} y2={py(s)} stroke="rgba(255,255,255,.1)" />
            <text x={PAD.l - 6} y={py(s) + 3} textAnchor="end" fontSize="10" fill="#D2CADC">
              {s}
            </text>
          </g>
        ))}
        {trendPts.length > 1 && (
          <motion.polyline
            points={trendPts.map((p, i) => `${px(i)},${py(p.score)}`).join(' ')}
            fill="none"
            stroke="#FF8A65"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: EASE }}
          />
        )}
        {trendPts.map((p, i) => (
          <circle key={p.id} cx={px(i)} cy={py(p.score)} r="4.5" fill="#FF8A65" stroke="#0B0A10" strokeWidth="2">
            <title>{`第 ${i + 1} 条 · 评分 ${p.score}`}</title>
          </circle>
        ))}
      </>
    );
  }

  const empty = (tab === 'map' && mapPts.length === 0) || (tab === 'ratio' && ratioPts.length === 0) || (tab === 'trend' && trendPts.length === 0);

  return (
    <section className="glass rounded-[26px] p-4 lg:rounded-[30px] lg:p-6">
      <div className="relative flex h-11 rounded-xl bg-black/30 p-[3px]" role="tablist">
        <motion.div className="absolute bottom-[3px] left-[3px] top-[3px] w-[calc((100%-6px)/3)] rounded-[9px] bg-accent" animate={{ x: `${TABS.findIndex((t) => t.id === tab) * 100}%` }} transition={{ duration: 0.4, ease: EASE }} />
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative flex-1 text-sm font-bold transition-colors duration-300 ${tab === t.id ? 'text-accent-ink' : 'text-sub'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex min-h-5 justify-end">{legend.length > 0 && <Legend items={legend} />}</div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block w-full" role="img" aria-label={TABS.find((t) => t.id === tab)?.label}>
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="rgba(255,255,255,.22)" />
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="rgba(255,255,255,.22)" />
        {body}
        {empty && (
          <text x={PAD.l + PW / 2} y={PAD.t + PH / 2 - 16} textAnchor="middle" fontSize="12" fill="#D2CADC">
            暂无数据，保存记录后在此显示
          </text>
        )}
      </svg>
      <p className="mt-1 text-center text-xs text-sub">{caption}</p>
    </section>
  );
}
