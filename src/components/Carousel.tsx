import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { formatDate, type Entry } from '../lib/api';
import { EASE } from '../lib/hooks';
import Cover from './Cover';

/** 3D coverflow of the most recent entries. Tap a side card to centre it, tap the centre card to open it. */
export default function Carousel({ items, onOpen }: { items: Entry[]; onOpen: (e: Entry) => void }) {
  const [idx, setIdx] = useState(0);
  const dragged = useRef(false);
  const firstId = items[0]?.id;

  // A new entry lands at the front; bring it to the centre.
  useEffect(() => setIdx(0), [firstId]);

  const cur = items[Math.min(idx, items.length - 1)];
  const go = (next: number) => setIdx(Math.max(0, Math.min(items.length - 1, next)));

  return (
    <div className="-mx-4 overflow-hidden pb-2 pt-6">
      <motion.div
        className="relative mx-auto h-[310px] w-full touch-pan-y [perspective:1000px]"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => {
          if (info.offset.x < -40) go(idx + 1);
          else if (info.offset.x > 40) go(idx - 1);
          setTimeout(() => (dragged.current = false), 0);
        }}
      >
        {items.map((entry, i) => {
          const o = i - idx;
          const a = Math.abs(o);
          return (
            <motion.button
              key={entry.id}
              aria-label={entry.name}
              tabIndex={a > 2 ? -1 : 0}
              onClick={() => {
                if (dragged.current) return;
                if (o === 0) onOpen(entry);
                else setIdx(i);
              }}
              initial={false}
              animate={{ x: o * 128, z: -a * 140, rotateY: o * -32, scale: 1 - a * 0.08, opacity: a > 2 ? 0 : 1 - a * 0.22 }}
              transition={{ duration: 0.65, ease: EASE }}
              style={{ zIndex: 10 - a, pointerEvents: a > 2 ? 'none' : 'auto' }}
              className="absolute left-1/2 top-0 -ml-[110px] h-[300px] w-[220px] overflow-hidden rounded-[30px] border border-white/20 bg-card p-0 text-ink shadow-[0_34px_70px_-18px_rgba(0,0,0,.75),inset_0_1px_0_rgba(255,255,255,.28)]"
            >
              <Cover entry={entry} big />
            </motion.button>
          );
        })}
      </motion.div>

      <div className="mt-4 h-[66px] text-center">
        <AnimatePresence mode="wait">
          {cur && (
            <motion.div
              key={cur.id}
              initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <div className="truncate px-6 text-[26px] font-extrabold">{cur.name}</div>
              <div className="mt-1 text-sm text-sub">
                {formatDate(cur.created_at)} · {cur.data.ingredients.length} 种用料 · {cur.data.steps.length} 个步骤
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
