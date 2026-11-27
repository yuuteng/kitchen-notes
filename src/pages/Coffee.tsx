import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, formatDate, type Method, type Shot, type ShotInput } from '../lib/api';
import { EASE, useNewEvent } from '../lib/hooks';
import CoffeeCharts from '../components/CoffeeCharts';

type NumKey = 'grind' | 'dose' | 'time_s' | 'yield_g' | 'pressure' | 'temp' | 'score';

interface Field {
  key: NumKey;
  label: string;
  unit: string;
  step: number;
  min: number;
  max: number;
  digits: number;
  initial: number;
}

const FIELDS: Record<Method, Field[]> = {
  espresso: [
    { key: 'grind', label: '研磨度', unit: '', step: 0.1, min: 0, max: 40, digits: 1, initial: 1.8 },
    { key: 'dose', label: '粉量', unit: 'g', step: 0.5, min: 5, max: 30, digits: 1, initial: 18 },
    { key: 'time_s', label: '时间', unit: 's', step: 1, min: 5, max: 90, digits: 0, initial: 28 },
    { key: 'yield_g', label: '液量', unit: 'g', step: 1, min: 5, max: 120, digits: 0, initial: 36 },
    { key: 'pressure', label: '压力', unit: 'bar', step: 0.5, min: 1, max: 15, digits: 1, initial: 9 },
    { key: 'score', label: '评分', unit: '/10', step: 1, min: 1, max: 10, digits: 0, initial: 7 },
  ],
  pourover: [
    { key: 'grind', label: '研磨度', unit: '', step: 0.1, min: 0, max: 40, digits: 1, initial: 2.3 },
    { key: 'dose', label: '粉量', unit: 'g', step: 0.5, min: 5, max: 60, digits: 1, initial: 15 },
    { key: 'yield_g', label: '注水量', unit: 'g', step: 5, min: 50, max: 900, digits: 0, initial: 240 },
    { key: 'temp', label: '水温', unit: '°C', step: 1, min: 70, max: 100, digits: 0, initial: 92 },
    { key: 'time_s', label: '时间', unit: '', step: 5, min: 30, max: 600, digits: 0, initial: 150 },
    { key: 'score', label: '评分', unit: '/10', step: 1, min: 1, max: 10, digits: 0, initial: 7 },
  ],
};

const METHOD_LABEL: Record<Method, string> = { espresso: '意式', pourover: '手冲' };
const TASTES = ['很酸', '偏酸', '平衡', '偏苦', '很苦'];
const mmss = (v: number) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;

type Values = Record<NumKey, number>;

const defaults = (method: Method): Values => {
  const v = { grind: 0, dose: 0, time_s: 0, yield_g: 0, pressure: 0, temp: 0, score: 0 };
  for (const f of FIELDS[method]) v[f.key] = f.initial;
  return v;
};

function hintFor(method: Method, taste: number, v: Values): string {
  if (taste === 0) return '口感平衡。保持这组参数，下一杯只微调一个变量。';
  if (method === 'espresso') {
    if (taste < 0) return v.time_s < 25 ? '偏酸且出液快：下一杯研磨调细 0.1，其他不动。' : '偏酸但时间正常：下一杯液量多出 2g，其他不动。';
    return v.time_s > 30 ? '偏苦且出液慢：下一杯研磨调粗 0.1，其他不动。' : '偏苦但时间正常：下一杯液量少出 2g，其他不动。';
  }
  if (taste < 0) return v.time_s < 120 ? '偏酸且流速快：下一杯研磨调细 0.1，其他不动。' : '偏酸但时间正常：下一杯水温提高 2°C，其他不动。';
  return v.time_s > 180 ? '偏苦且流速慢：下一杯研磨调粗 0.1，其他不动。' : '偏苦但时间正常：下一杯水温降低 2°C，其他不动。';
}

/** What changed between two consecutive shots, e.g. "研磨度 1.8→1.7". */
function diffOf(method: Method, prev: Shot | undefined, cur: Shot): string[] {
  if (!prev) return [];
  const out: string[] = [];
  for (const f of FIELDS[method]) {
    if (f.key === 'score') continue;
    const a = prev[f.key];
    const b = cur[f.key];
    if (a === null || b === null || a === b) continue;
    const show = (n: number) => (f.key === 'time_s' && method === 'pourover' ? mmss(n) : Number(n.toFixed(f.digits)).toString());
    out.push(`${f.label} ${show(a)}→${show(b)}`);
  }
  if (prev.bean !== cur.bean && cur.bean) out.push(`换豆 ${cur.bean}`);
  return out;
}

export default function Coffee() {
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [method, setMethod] = useState<Method>('espresso');
  const [values, setValues] = useState<Values>(() => defaults('espresso'));
  const [taste, setTaste] = useState(0);
  const [bean, setBean] = useState('');
  const [roast, setRoast] = useState('');
  const [note, setNote] = useState('');
  const [onlyBean, setOnlyBean] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [quick, setQuick] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoadError('');
    api
      .listShots()
      .then(setShots)
      .catch((e: Error) => setLoadError(e.message));
  }, []);
  useEffect(load, [load]);

  const ofMethod = useMemo(() => (shots ?? []).filter((s) => s.method === method), [shots, method]);

  // Start each cup from the previous one, so only the changed parameter needs touching.
  const prefill = useCallback((m: Method, list: Shot[]) => {
    const last = [...list].reverse().find((s) => s.method === m);
    const v = defaults(m);
    if (last) for (const f of FIELDS[m]) if (last[f.key] !== null) v[f.key] = last[f.key] as number;
    setValues(v);
    setBean(last?.bean ?? '');
    setRoast(last?.roast_date ?? '');
    setTaste(0);
    setNote('');
  }, []);

  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (shots && !prefilled) {
      prefill(method, shots);
      setPrefilled(true);
    }
  }, [shots, prefilled, method, prefill]);

  const switchMethod = (m: Method) => {
    setMethod(m);
    prefill(m, shots ?? []);
  };

  const openQuick = useCallback(() => {
    setQuick(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  useNewEvent(openQuick);

  const beans = useMemo(() => [...new Set((shots ?? []).map((s) => s.bean).filter(Boolean))], [shots]);
  const charted = useMemo(() => {
    const b = bean.trim();
    const same = ofMethod.filter((s) => s.bean === b);
    return onlyBean && b && same.length > 0 ? same : ofMethod;
  }, [ofMethod, bean, onlyBean]);
  const filteredByBean = charted !== ofMethod;

  const ratio = values.dose > 0 ? values.yield_g / values.dose : 0;
  const roastDay = roast ? Math.floor((Date.now() - new Date(`${roast}T00:00:00`).getTime()) / 86400000) : null;

  const step = (f: Field, dir: 1 | -1) =>
    setValues((v) => ({ ...v, [f.key]: Math.max(f.min, Math.min(f.max, Math.round((v[f.key] + dir * f.step) * 10) / 10)) }));

  const save = async () => {
    setSaving(true);
    setError('');
    const keys = new Set(FIELDS[method].map((f) => f.key));
    const pick = (k: NumKey) => (keys.has(k) ? values[k] : null);
    const input: ShotInput = {
      method,
      bean: bean.trim(),
      roast_date: roast || null,
      grind: pick('grind'),
      dose: pick('dose'),
      time_s: pick('time_s'),
      yield_g: pick('yield_g'),
      pressure: pick('pressure'),
      temp: pick('temp'),
      score: pick('score'),
      taste,
      note: note.trim(),
    };
    try {
      const saved = await api.createShot(input);
      const next = [...(shots ?? []), saved];
      setShots(next);
      setNote('');
      setToast(`已记录第 ${next.filter((s) => s.method === method).length} 杯${METHOD_LABEL[method]}`);
      setTimeout(() => setToast(''), 2200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const runQuick = async () => {
    setThinking(true);
    setError('');
    try {
      const out = await api.extractShot(quickText);
      const m = out.method;
      setMethod(m);
      setValues((prev) => {
        const v = m === method ? { ...prev } : defaults(m);
        for (const f of FIELDS[m]) {
          const got = out[f.key];
          if (typeof got === 'number') v[f.key] = Math.max(f.min, Math.min(f.max, got));
        }
        return v;
      });
      if (out.bean) setBean(out.bean);
      if (typeof out.taste === 'number') setTaste(Math.max(-2, Math.min(2, Math.round(out.taste))));
      if (out.note) setNote(out.note);
      setQuick(false);
      setQuickText('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  };

  const remove = async (id: number) => {
    if (confirmId !== id) return setConfirmId(id);
    try {
      await api.deleteShot(id);
      setShots((list) => (list ?? []).filter((s) => s.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConfirmId(null);
    }
  };

  const history = [...ofMethod].reverse().slice(0, 30);

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-sub">
            {bean.trim() || '还没填豆子'}
            {roastDay !== null && roastDay >= 0 && ` · 烘焙第 ${roastDay} 天`}
          </div>
          <h1 className="text-[30px] font-extrabold lg:text-4xl">{method === 'espresso' ? '意式浓缩' : '手冲'}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-sub">粉液比</div>
            <div className="text-xl font-extrabold tabular-nums">1 : {ratio.toFixed(1)}</div>
          </div>
          <button onClick={() => api.exportCsv().catch((e: Error) => setError(e.message))} className="btn-ghost hidden h-[46px] !rounded-2xl px-4 text-[15px] lg:block">
            导出 CSV
          </button>
        </div>
      </div>

      <div className="relative flex h-11 rounded-xl bg-white/[.08] p-[3px]">
        <motion.div className="absolute bottom-[3px] left-[3px] top-[3px] w-[calc((100%-6px)/2)] rounded-[9px] bg-accent" animate={{ x: method === 'espresso' ? '0%' : '100%' }} transition={{ duration: 0.4, ease: EASE }} />
        {(['espresso', 'pourover'] as Method[]).map((m) => (
          <button key={m} aria-pressed={method === m} onClick={() => switchMethod(m)} className={`relative flex-1 text-[15px] font-bold transition-colors duration-300 ${method === m ? 'text-accent-ink' : 'text-sub'}`}>
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>

      {loadError && (
        <div role="alert" className="glass flex flex-col items-start gap-3 rounded-3xl p-5">
          <p>{loadError}</p>
          <button onClick={load} className="btn-ghost h-11 px-5 text-[15px]">
            重试
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0 lg:flex-1">
          <CoffeeCharts method={method} shots={charted} current={{ grind: values.grind, time_s: values.time_s, ratio }} />
          {bean.trim() && ofMethod.some((s) => s.bean === bean.trim()) && (
            <button aria-pressed={onlyBean} onClick={() => setOnlyBean((v) => !v)} className="mt-2 h-11 px-1 text-sm text-sub underline decoration-white/30 underline-offset-4">
              {filteredByBean ? `图上只显示“${bean.trim()}”，点这里看全部豆子` : `图上是全部豆子，点这里只看“${bean.trim()}”`}
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3.5 lg:flex-1">
          <AnimatePresence initial={false}>
            {quick && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: EASE }} className="overflow-hidden">
                <div className="glass flex flex-col gap-2.5 rounded-[22px] p-3">
                  <label htmlFor="quick" className="text-sm font-semibold">
                    写一句话，AI 帮你填参数
                  </label>
                  <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/[.06]">
                    <textarea id="quick" value={quickText} disabled={thinking} placeholder="比如：耶加雪菲 18g 研磨1.7 30秒出38g 9bar 有点苦" onChange={(e) => setQuickText(e.target.value)} className="block h-20 w-full resize-none border-0 bg-transparent p-3 text-base outline-none placeholder:text-[#a79fb3]" />
                    {thinking && <span aria-hidden="true" className="absolute inset-x-0 h-[3px] bg-accent shadow-[0_0_20px_6px_rgba(255,138,101,.7)] [animation:scan_.9s_ease-in-out_infinite_alternate]" />}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setQuick(false)} disabled={thinking} className="btn-ghost h-11 flex-1 !rounded-2xl text-[15px]">
                      收起
                    </button>
                    <button onClick={runQuick} disabled={thinking || quickText.trim().length < 4} className="btn-accent h-11 flex-[2] !rounded-2xl text-[15px]">
                      {thinking ? '正在读取' : '填入下面的参数'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {!quick && (
            <button onClick={() => setQuick(true)} className="hidden h-11 self-start px-1 text-sm text-sub underline decoration-white/30 underline-offset-4 lg:block">
              不想点按钮？写一句话让 AI 填
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bean" className="text-xs font-semibold text-sub">
                豆子
              </label>
              <input id="bean" list="beans" className="field" value={bean} maxLength={60} placeholder="耶加雪菲" onChange={(e) => setBean(e.target.value)} />
              <datalist id="beans">
                {beans.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="roast" className="text-xs font-semibold text-sub">
                烘焙日期
              </label>
              <input id="roast" type="date" className="field [color-scheme:dark]" value={roast} onChange={(e) => setRoast(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-2 lg:gap-3">
            {FIELDS[method].map((f, i) => (
              <motion.div key={`${method}-${f.key}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: i * 0.04 }} className="glass flex flex-col items-center gap-0.5 rounded-[20px] px-2 pb-2 pt-2.5">
                <span className="text-xs text-sub">{f.label}</span>
                <span className="text-2xl font-extrabold tabular-nums lg:text-[28px]">
                  {f.key === 'time_s' && method === 'pourover' ? mmss(values[f.key]) : values[f.key].toFixed(f.digits)}
                  {f.unit && <span className="ml-0.5 text-xs font-medium text-sub">{f.unit}</span>}
                </span>
                <div className="mt-1 flex w-full gap-1.5">
                  <button aria-label={`${f.label}减少`} onClick={() => step(f, -1)} className="h-11 flex-1 rounded-xl bg-white/10 text-[22px] leading-none active:bg-white/20">
                    −
                  </button>
                  <button aria-label={`${f.label}增加`} onClick={() => step(f, 1)} className="h-11 flex-1 rounded-xl bg-white/10 text-[22px] leading-none active:bg-white/20">
                    +
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="glass rounded-[22px] p-3">
            <div className="relative flex h-11 rounded-xl bg-black/30 p-[3px]">
              <motion.div className="absolute bottom-[3px] left-[3px] top-[3px] w-[calc((100%-6px)/5)] rounded-[9px] bg-accent" animate={{ x: `${(taste + 2) * 100}%` }} transition={{ duration: 0.4, ease: EASE }} />
              {TASTES.map((label, i) => (
                <button key={label} aria-pressed={taste === i - 2} onClick={() => setTaste(i - 2)} className={`relative flex-1 text-[13px] font-bold transition-colors duration-300 ${taste === i - 2 ? 'text-accent-ink' : 'text-sub'}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-[#F0B8A6]">{hintFor(method, taste, values)}</p>
          </div>

          <label htmlFor="shot-note" className="sr-only">
            备注
          </label>
          <input id="shot-note" className="field" value={note} placeholder="备注（可不填）" onChange={(e) => setNote(e.target.value)} />

          {error && (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          )}
          <button onClick={save} disabled={saving || !shots} className="btn-accent h-[58px] text-lg">
            {saving ? '正在保存' : '记下这一杯'}
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">最近的{METHOD_LABEL[method]}</h2>
            <button onClick={() => api.exportCsv().catch((e: Error) => setError(e.message))} className="h-11 px-1 text-sm text-sub underline decoration-white/30 underline-offset-4 lg:hidden">
              导出 CSV
            </button>
          </div>
          <div className="grid gap-2.5 lg:grid-cols-2">
            {history.map((s) => {
              const idx = ofMethod.indexOf(s);
              const diff = diffOf(method, ofMethod[idx - 1], s);
              const parts = FIELDS[method]
                .filter((f) => f.key !== 'score' && s[f.key] !== null)
                .map((f) => (f.key === 'time_s' && method === 'pourover' ? mmss(s[f.key] as number) : `${Number((s[f.key] as number).toFixed(f.digits))}${f.unit || (f.key === 'grind' ? ' 研磨' : '')}`));
              return (
                <motion.div key={s.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }} className="glass flex items-center gap-3 rounded-[22px] p-3.5">
                  <span className="w-10 shrink-0 text-center text-[32px] font-extrabold leading-none tabular-nums">{s.score ?? '–'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">
                      {s.bean || '未填豆子'}
                      <span className="ml-2 text-xs font-normal text-sub">
                        {formatDate(s.created_at)}
                        {s.taste !== null && ` · ${TASTES[s.taste + 2]}`}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-sub">{parts.join(' · ')}</div>
                    {diff.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {diff.map((d) => (
                          <span key={d} className="rounded-lg bg-accent/[.16] px-2 py-0.5 text-xs text-[#F0B8A6]">
                            {d}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.note && <div className="mt-1 text-[13px] text-sub">{s.note}</div>}
                  </div>
                  <button onClick={() => remove(s.id)} onBlur={() => setConfirmId(null)} className="h-11 shrink-0 px-2 text-sm text-sub">
                    {confirmId === s.id ? '确认删除' : '删除'}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div role="status" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4, ease: EASE }} className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
