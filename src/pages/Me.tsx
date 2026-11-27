import { useState } from 'react';
import { motion } from 'motion/react';
import { api } from '../lib/api';
import { EASE } from '../lib/hooks';

export default function Me({ user, onLeave }: { user: string; onLeave: () => void }) {
  const [error, setError] = useState('');
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="flex max-w-md flex-col gap-4">
      <h1 className="text-[34px] font-extrabold lg:text-4xl">我</h1>
      <div className="glass flex flex-col gap-1 rounded-[26px] p-5">
        <span className="text-sm text-sub">当前用户</span>
        <span className="break-all text-2xl font-extrabold">{user}</span>
        <p className="mt-2 text-sm leading-relaxed text-sub">在别的手机或电脑上输入同一个用户名，就能看到这些记录。没有密码，知道用户名的人都能看到和修改。</p>
      </div>
      <button onClick={() => api.exportCsv().catch((e: Error) => setError(e.message))} className="btn-ghost h-14 text-base">
        导出全部咖啡记录（CSV）
      </button>
      <button onClick={onLeave} className="btn-ghost h-14 text-base">
        换一个用户名
      </button>
      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}
    </motion.div>
  );
}
