export type Kind = 'recipe' | 'cocktail';
export type Method = 'espresso' | 'pourover';

export interface Ingredient {
  name: string;
  amount: string;
}

export interface EntryData {
  ingredients: Ingredient[];
  steps: string[];
  note: string;
  glass: string;
  method: string;
}

export interface Entry {
  id: number;
  kind: Kind;
  name: string;
  data: EntryData;
  photo: string | null;
  thumb: string | null;
  created_at: string;
}

export interface Shot {
  id: number;
  method: Method;
  bean: string;
  roast_date: string | null;
  grind: number | null;
  dose: number | null;
  time_s: number | null;
  yield_g: number | null;
  pressure: number | null;
  temp: number | null;
  score: number | null;
  taste: number | null;
  note: string | null;
  created_at: string;
}

export type ShotInput = Omit<Shot, 'id' | 'created_at'>;

const USER_KEY = 'kn_user';

export const getUser = (): string => {
  try {
    return localStorage.getItem(USER_KEY) || '';
  } catch {
    return '';
  }
};

export const setUser = (name: string) => {
  try {
    if (name) localStorage.setItem(USER_KEY, name);
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* private mode: the name just won't be remembered */
  }
};

// Usernames used on this device, most recent first. Kept in this browser only.
const RECENT_KEY = 'kn_recent';

export const getRecentUsers = (): string[] => {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string' && !!n).slice(0, 5) : [];
  } catch {
    return [];
  }
};

const saveRecent = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
  } catch {
    /* storage unavailable: the list is a convenience only */
  }
};

// The server ignores case, so "Test" and "test" are one entry.
const sameUser = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const rememberUser = (name: string) => {
  if (name.trim()) saveRecent([name.trim(), ...getRecentUsers().filter((n) => !sameUser(n, name))]);
};

export const forgetUser = (name: string) => saveRecent(getRecentUsers().filter((n) => !sameUser(n, name)));

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('x-user', encodeURIComponent(getUser()));
  if (typeof init.body === 'string') headers.set('content-type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, { ...init, headers });
  } catch {
    throw new Error('网络连接失败，请检查网络后重试');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { error?: string } | null)?.error || `请求失败（${res.status}）`);
  }
  return (init as { raw?: boolean }).raw ? (res as unknown as T) : res.json();
}

export const emptyData = (): EntryData => ({ ingredients: [], steps: [], note: '', glass: '', method: '' });

export const api = {
  listEntries: (kind: Kind) => req<Entry[]>(`entries?kind=${kind}`),
  createEntry: (e: Pick<Entry, 'kind' | 'name' | 'data' | 'photo' | 'thumb'>) => req<Entry>('entries', { method: 'POST', body: JSON.stringify(e) }),
  updateEntry: (id: number, e: Pick<Entry, 'name' | 'data' | 'photo' | 'thumb'>) => req<Entry>(`entries/${id}`, { method: 'PUT', body: JSON.stringify(e) }),
  deleteEntry: (id: number) => req<{ ok: true }>(`entries/${id}`, { method: 'DELETE' }),

  listShots: () => req<Shot[]>('shots'),
  createShot: (s: ShotInput) => req<Shot>('shots', { method: 'POST', body: JSON.stringify(s) }),
  updateShot: (id: number, s: ShotInput) => req<Shot>(`shots/${id}`, { method: 'PUT', body: JSON.stringify(s) }),
  deleteShot: (id: number) => req<{ ok: true }>(`shots/${id}`, { method: 'DELETE' }),

  extractEntry: (kind: Kind, text: string) => req<{ name: string; data: EntryData }>('extract', { method: 'POST', body: JSON.stringify({ kind, text }) }),
  extractShot: (text: string) => req<Partial<ShotInput> & { method: Method }>('extract', { method: 'POST', body: JSON.stringify({ kind: 'coffee', text }) }),

  uploadPhoto: (full: Blob, thumb: Blob) => {
    const form = new FormData();
    form.append('full', full, 'full');
    form.append('thumb', thumb, 'thumb');
    return req<{ photo: string; thumb: string }>('photo', { method: 'POST', body: form });
  },

  async exportCsv() {
    const res = await req<Response>('shots/export', { raw: true } as RequestInit);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `coffee-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export const photoUrl = (key: string | null) => (key ? `/api/photo/${key}` : '');

export const formatDate = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};
