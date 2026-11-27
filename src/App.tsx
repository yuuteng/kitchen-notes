import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { getUser, setUser } from './lib/api';
import { EASE } from './lib/hooks';
import Entries from './pages/Entries';
import Coffee from './pages/Coffee';
import Me from './pages/Me';

const icon = 'h-6 w-6 fill-none stroke-current [stroke-width:1.9] [stroke-linecap:round] [stroke-linejoin:round]';

const TABS: { to: string; label: string; svg: ReactNode }[] = [
  {
    to: '/',
    label: '食谱',
    svg: (
      <>
        <path d="M4 11h16a8 8 0 0 1-16 0z" />
        <path d="M9 7c0-1 1-1 1-2M14 7c0-1 1-1 1-2" />
      </>
    ),
  },
  {
    to: '/coffee',
    label: '咖啡',
    svg: (
      <>
        <path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
        <path d="M16 10h2a2 2 0 0 1 0 4h-2" />
      </>
    ),
  },
  {
    to: '/cocktail',
    label: '调酒',
    svg: (
      <>
        <path d="M6 4h12l-6 8z" />
        <path d="M12 12v7M8 20h8" />
      </>
    ),
  },
  {
    to: '/me',
    label: '我',
    svg: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20a8 8 0 0 1 16 0" />
      </>
    ),
  },
];

function Blobs() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -left-16 top-8 h-80 w-80 rounded-full bg-accent opacity-[.22] blur-[90px] [animation:drift-a_15s_ease-in-out_infinite_alternate] lg:left-[18%] lg:h-[460px] lg:w-[460px] lg:opacity-[.16]" />
      <div className="absolute -right-24 bottom-16 h-80 w-80 rounded-full bg-accent opacity-[.14] blur-[100px] [animation:drift-b_18s_ease-in-out_infinite_alternate]" />
    </div>
  );
}

function Login({ onEnter }: { onEnter: (name: string) => void }) {
  const [name, setName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (clean) onEnter(clean);
  };
  return (
    <div className="relative flex min-h-full items-center justify-center p-6">
      <Blobs />
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24, filter: 'blur(12px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.7, ease: EASE }}
        className="glass relative flex w-full max-w-sm flex-col gap-4 rounded-[30px] p-7"
      >
        <h1 className="text-3xl font-extrabold">厨房手记</h1>
        <p className="text-sm leading-relaxed text-sub">记录食谱、咖啡参数与鸡尾酒配方。输入用户名即可开始使用。</p>
        <label htmlFor="user" className="text-sm font-semibold">
          用户名
        </label>
        <input id="user" className="field" value={name} maxLength={24} autoFocus autoComplete="username" placeholder="请输入用户名" onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={!name.trim()} className="btn-accent h-14 text-lg">
          进入
        </button>
        <p className="text-xs leading-relaxed text-sub">本应用不设密码，数据按用户名区分。请使用不易被他人猜到的用户名。</p>
      </motion.form>
    </div>
  );
}

function Shell({ user, children }: { user: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onPlus = () => {
    if (pathname === '/me') navigate('/', { state: { create: true } });
    else window.dispatchEvent(new Event('kn:new'));
  };
  const tab = (t: (typeof TABS)[number]) => (
    <NavLink
      key={t.to}
      to={t.to}
      end
      className={({ isActive }) => `flex h-[52px] w-[60px] flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${isActive ? 'text-accent' : 'text-sub'}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className={icon}>
        {t.svg}
      </svg>
      {t.label}
    </NavLink>
  );
  return (
    <div className="relative min-h-full lg:flex">
      <Blobs />
      <nav className="relative hidden w-[220px] shrink-0 flex-col gap-1.5 border-r border-white/10 bg-white/[.04] px-4 py-8 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="px-3 pb-6 text-xl font-extrabold">厨房手记</div>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end
            className={({ isActive }) =>
              `flex h-12 items-center gap-3 rounded-[14px] px-3.5 text-base transition-colors ${isActive ? 'bg-accent/[.18] font-bold text-accent' : 'font-semibold text-sub hover:bg-white/[.06]'}`
            }
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className={icon}>
              {t.svg}
            </svg>
            {t.label}
          </NavLink>
        ))}
        <div className="mt-auto px-3 text-sm text-sub">当前用户：{user}</div>
      </nav>

      <main className="relative min-w-0 flex-1 px-4 pb-32 pt-10 lg:p-8">{children}</main>

      <nav className="fixed inset-x-4 bottom-5 z-30 flex h-[66px] items-center justify-around rounded-[33px] border border-white/15 bg-[rgba(24,21,31,.88)] px-2 backdrop-blur-2xl lg:hidden">
        {tab(TABS[0])}
        {tab(TABS[1])}
        <div className="relative h-[54px] w-[54px]">
          <span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-accent [animation:ring_2.2s_ease-out_infinite]" />
          <button aria-label="新建记录" onClick={onPlus} className="btn-accent absolute inset-0 flex items-center justify-center !rounded-full">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current [stroke-linecap:round] [stroke-width:2.6]">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        {tab(TABS[2])}
        {tab(TABS[3])}
      </nav>
    </div>
  );
}

export default function App() {
  const [user, setUserState] = useState(getUser);
  const enter = (name: string) => {
    setUser(name);
    setUserState(name);
  };
  const leave = () => {
    setUser('');
    setUserState('');
  };
  if (!user) return <Login onEnter={enter} />;
  return (
    <Shell user={user}>
      <Routes>
        <Route path="/" element={<Entries key="recipe" kind="recipe" />} />
        <Route path="/cocktail" element={<Entries key="cocktail" kind="cocktail" />} />
        <Route path="/coffee" element={<Coffee />} />
        <Route path="/me" element={<Me user={user} onLeave={leave} />} />
        <Route path="*" element={<Entries key="recipe" kind="recipe" />} />
      </Routes>
    </Shell>
  );
}
