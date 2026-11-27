import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { formatDate, photoUrl, type Entry } from '../lib/api';
import { EASE } from '../lib/hooks';

interface Props {
  entry: Entry;
  /** `page` is the full-screen phone view, `panel` the desktop side panel. */
  variant: 'page' | 'panel';
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onClose?: () => void;
}

const stagger = (i: number) => ({
  initial: { opacity: 0, y: 20, filter: 'blur(10px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.5, ease: EASE, delay: 0.08 + i * 0.04 },
});

export default function EntryDetail({ entry, variant, onEdit, onDelete, onClose }: Props) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDone({});
    setConfirming(false);
    setError('');
  }, [entry.id]);

  const { ingredients, steps, note, glass, method } = entry.data;
  const page = variant === 'page';
  const doneCount = ingredients.filter((_, i) => done[i]).length;
  const facts = [glass, method].filter(Boolean);

  const remove = async () => {
    if (!confirming) return setConfirming(true);
    setBusy(true);
    setError('');
    try {
      await onDelete();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className={page ? 'min-h-full bg-bg pb-32' : ''}>
      {entry.photo && (
        <motion.img
          key={entry.photo}
          src={photoUrl(entry.photo)}
          alt={`${entry.name}的照片`}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE }}
          className={page ? 'h-[380px] w-full object-cover' : 'h-56 w-full rounded-[22px] object-cover'}
        />
      )}

      <div className={page ? `relative flex flex-col gap-6 px-5 pt-7 ${entry.photo ? '-mt-9 rounded-t-[34px] border-t border-white/20 bg-[rgba(16,13,22,.92)] backdrop-blur-2xl' : 'pt-24'}` : 'flex flex-col gap-5 pt-5'}>
        <motion.div {...stagger(0)} key={`h${entry.id}`}>
          <h2 className={`font-extrabold ${page ? 'text-[32px]' : 'text-[28px]'}`}>{entry.name}</h2>
          <div className="mt-1.5 text-sm text-sub">
            {formatDate(entry.created_at)}记下{facts.map((f) => ` · ${f}`)}
          </div>
        </motion.div>

        {ingredients.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-extrabold">用料</h3>
              <span className="text-[13px] text-sub">
                备好一样点一下 · {doneCount} / {ingredients.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ingredients.map((g, i) => (
                <motion.button
                  {...stagger(i + 1)}
                  key={`${entry.id}-${i}`}
                  aria-pressed={!!done[i]}
                  onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
                  className={`flex min-h-12 items-center justify-between gap-2 rounded-2xl border px-3.5 py-2 text-left text-[15px] transition-[background-color,border-color,box-shadow,color] duration-300 ${
                    done[i] ? 'border-accent bg-accent text-accent-ink shadow-[0_0_22px_rgba(255,138,101,.6)]' : 'border-white/15 bg-white/[.08] text-ink'
                  }`}
                >
                  <span className="min-w-0 break-words">{g.name}</span>
                  <span className={`shrink-0 font-bold ${g.amount || done[i] ? '' : 'text-accent'}`}>{g.amount || '未写'}</span>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {steps.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h3 className="text-lg font-extrabold">步骤</h3>
            {steps.map((s, i) => (
              <motion.div {...stagger(ingredients.length + i + 1)} key={`${entry.id}-s${i}`} className="flex gap-3.5 rounded-[20px] border border-white/15 bg-white/[.08] p-4">
                <span className="shrink-0 text-2xl font-extrabold leading-none text-accent">{i + 1}</span>
                <span className="whitespace-pre-wrap text-base leading-relaxed">{s}</span>
              </motion.div>
            ))}
          </section>
        )}

        {note && (
          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-extrabold">备注</h3>
            <p className="whitespace-pre-wrap text-base leading-relaxed text-sub">{note}</p>
          </section>
        )}

        {error && (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        )}

        <div className={page ? 'fixed inset-x-4 bottom-6 z-10 flex gap-2.5' : 'flex gap-2.5'}>
          <button onClick={remove} disabled={busy} className="btn-ghost h-14 flex-1 text-base backdrop-blur-xl">
            {busy ? '正在删除' : confirming ? '确认删除' : '删除'}
          </button>
          <button onClick={onEdit} className="btn-accent h-14 flex-1 text-base">
            编辑
          </button>
        </div>
      </div>

      {page && onClose && (
        <button aria-label="返回" onClick={onClose} className="fixed left-4 top-10 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/40 backdrop-blur-xl">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.4]">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
