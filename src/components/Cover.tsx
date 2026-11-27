import { useState } from 'react';
import { photoUrl, type Entry } from '../lib/api';

/** Card face: the photo when there is one, otherwise the name set large over glass. */
export default function Cover({ entry, big = false }: { entry: Entry; big?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  if (entry.thumb) {
    return (
      <img
        src={photoUrl(entry.thumb)}
        alt=""
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    );
  }
  const hints = entry.data.ingredients.slice(0, 3).map((g) => g.name);
  return (
    <div className="relative flex h-full w-full flex-col justify-center gap-2 overflow-hidden p-4 text-left">
      <div aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent opacity-25 blur-3xl" />
      <div className={`relative line-clamp-3 font-extrabold leading-tight ${big ? 'text-[32px]' : 'text-2xl'}`}>{entry.name}</div>
      {hints.length > 0 && <div className="relative line-clamp-2 text-xs leading-relaxed text-sub">{hints.join(' · ')}</div>}
    </div>
  );
}
