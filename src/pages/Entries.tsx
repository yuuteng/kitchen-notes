import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { api, type Entry, type Kind } from '../lib/api';
import { EASE, useIsDesktop, useNewEvent } from '../lib/hooks';
import Carousel from '../components/Carousel';
import Cover from '../components/Cover';
import EntryDetail from '../components/EntryDetail';
import EntryEditor from '../components/EntryEditor';

const COPY = {
  recipe: { title: '食谱', unit: '道菜', search: '搜索菜名或食材', empty: '还没有食谱。想到一个做法，点下面的加号随手写下来，AI 会帮你整理成用料和步骤。' },
  cocktail: { title: '调酒', unit: '款酒', search: '搜索酒名或材料', empty: '还没有配方。点下面的加号，把配方写下来或直接粘贴，AI 会帮你整理成材料和步骤。' },
};

export default function Entries({ kind }: { kind: Kind }) {
  const copy = COPY[kind];
  const desktop = useIsDesktop();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);

  const load = useCallback(() => {
    setError('');
    api
      .listEntries(kind)
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, [kind]);
  useEffect(load, [load]);

  const openNew = useCallback(() => setEditing('new'), []);
  useNewEvent(openNew);

  // Arriving from another tab via the "+" button.
  useEffect(() => {
    if ((location.state as { create?: boolean } | null)?.create) {
      setEditing('new');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!items || !needle) return items ?? [];
    return items.filter((e) => e.name.toLowerCase().includes(needle) || e.data.ingredients.some((g) => g.name.toLowerCase().includes(needle)));
  }, [items, q]);

  const selected = filtered.find((e) => e.id === selId) ?? (desktop ? filtered[0] : undefined);

  const onSaved = (saved: Entry) => {
    setItems((list) => {
      const rest = (list ?? []).filter((e) => e.id !== saved.id);
      return [saved, ...rest].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id));
    });
    setSelId(saved.id);
    setEditing(null);
  };

  const remove = async (entry: Entry) => {
    await api.deleteEntry(entry.id);
    setItems((list) => (list ?? []).filter((e) => e.id !== entry.id));
    setSelId(null);
  };

  const showCarousel = !desktop && !q.trim() && (items?.length ?? 0) >= 3;

  return (
    <div className="lg:flex lg:items-start lg:gap-7">
      <section className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3.5">
          <h1 className="flex-1 text-[34px] font-extrabold lg:text-4xl">{copy.title}</h1>
          {items && items.length > 0 && (
            <span className="text-[13px] text-sub lg:order-last lg:w-full">
              {items.length} {copy.unit}
            </span>
          )}
          <button onClick={openNew} className="btn-accent hidden h-[46px] !rounded-2xl px-5 text-base lg:block">
            新建
          </button>
        </div>

        {items && items.length > 0 && (
          <div className="glass mt-3.5 flex h-[46px] items-center gap-2 rounded-2xl px-3.5 text-sub lg:max-w-sm">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-width:2]">
              <circle cx="11" cy="11" r="6" />
              <path d="M16 16l4 4" />
            </svg>
            <input aria-label={copy.search} value={q} placeholder={copy.search} onChange={(e) => setQ(e.target.value)} className="h-full min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-sub" />
          </div>
        )}

        {error && (
          <div role="alert" className="glass mt-6 flex flex-col items-start gap-3 rounded-3xl p-5">
            <p className="text-base">{error}</p>
            <button onClick={load} className="btn-ghost h-11 px-5 text-[15px]">
              重试
            </button>
          </div>
        )}

        {!items && !error && (
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-[18px]">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[190px] rounded-[26px]" />
            ))}
          </div>
        )}

        {items && items.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="glass mt-8 rounded-[28px] p-6">
            <p className="text-base leading-relaxed text-sub">{desktop ? copy.empty.replace('下面的加号', '右上角的“新建”') : copy.empty}</p>
          </motion.div>
        )}

        {showCarousel && items && <Carousel items={items.slice(0, 7)} onOpen={(e) => setSelId(e.id)} />}
        {showCarousel && <h2 className="mt-4 text-lg font-extrabold">全部</h2>}

        {items && items.length > 0 && filtered.length === 0 && <p className="mt-8 text-base text-sub">没有找到“{q.trim()}”。换个词试试。</p>}

        <div className="mt-4 grid grid-cols-2 gap-3 lg:mt-6 lg:grid-cols-3 lg:gap-[18px]">
          {filtered.map((entry, i) => {
            const active = desktop && selected?.id === entry.id;
            return (
              <motion.button
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.5, ease: EASE, delay: Math.min(i * 0.05, 0.4) }}
                onClick={() => setSelId(entry.id)}
                className="flex flex-col gap-2 text-left text-ink"
              >
                <span
                  className={`block h-[190px] w-full overflow-hidden rounded-[26px] border bg-card transition-[border-color,box-shadow] duration-300 ${
                    active ? 'border-accent shadow-[0_0_30px_rgba(255,138,101,.45)]' : 'border-white/15 shadow-[0_22px_44px_-18px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.28)]'
                  }`}
                >
                  <Cover entry={entry} />
                </span>
                {entry.thumb && (
                  <span className="px-1">
                    <span className="block truncate text-[15px] font-semibold">{entry.name}</span>
                    <span className="block truncate text-xs text-sub">
                      {entry.data.ingredients
                        .slice(0, 3)
                        .map((g) => g.name)
                        .join(' · ')}
                    </span>
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </section>

      {desktop && selected && (
        <aside className="glass sticky top-8 max-h-[calc(100vh-4rem)] w-[380px] shrink-0 overflow-y-auto rounded-[30px] p-5">
          <EntryDetail entry={selected} variant="panel" onEdit={() => setEditing(selected)} onDelete={() => remove(selected)} />
        </aside>
      )}

      <AnimatePresence>
        {!desktop && selected && (
          <motion.div
            key="detail"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.55, ease: EASE }}
            className="fixed inset-0 z-40 overflow-y-auto bg-bg"
          >
            <EntryDetail entry={selected} variant="page" onEdit={() => setEditing(selected)} onDelete={() => remove(selected)} onClose={() => setSelId(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && <EntryEditor key="editor" kind={kind} entry={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
      </AnimatePresence>
    </div>
  );
}
