import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { api, emptyData, photoUrl, type Entry, type EntryData, type Kind } from '../lib/api';
import { compressPhoto, type CompressedPhoto } from '../lib/image';
import { EASE } from '../lib/hooks';

interface Props {
  kind: Kind;
  /** Present when editing an existing entry; absent for a new one. */
  entry?: Entry;
  onClose: () => void;
  onSaved: (entry: Entry) => void;
}

const COPY = {
  recipe: { title: '食谱', name: '菜名', ph: '示例：番茄炒蛋。鸡蛋 3 个、番茄 2 个。先炒蛋盛出，再炒番茄至出汁，倒回鸡蛋，加盐和少许糖。', item: '用料' },
  cocktail: { title: '鸡尾酒', name: '酒名', ph: '示例：Negroni。金酒、金巴利、甜味美思各 30 ml，加冰搅拌，倒入古典杯，以橙皮装饰。', item: '材料' },
};

const closeIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current [stroke-linecap:round] [stroke-width:2.4]">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export default function EntryEditor({ kind, entry, onClose, onSaved }: Props) {
  const copy = COPY[kind];
  const [stage, setStage] = useState<'text' | 'form'>(entry ? 'form' : 'text');
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [name, setName] = useState(entry?.name ?? '');
  const [data, setData] = useState<EntryData>(entry?.data ?? emptyData());
  const [newPhoto, setNewPhoto] = useState<CompressedPhoto | null>(null);
  const [preview, setPreview] = useState('');
  const [keepPhoto, setKeepPhoto] = useState(!!entry?.photo);
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const organise = async () => {
    setThinking(true);
    setError('');
    try {
      const out = await api.extractEntry(kind, text);
      setName(out.name);
      setData({ ...emptyData(), ...out.data });
      setStage('form');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setCompressing(true);
    setError('');
    try {
      const out = await compressPhoto(file);
      setNewPhoto(out);
      setPreview(URL.createObjectURL(out.thumb));
      setKeepPhoto(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCompressing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!name.trim()) return setError(`请填写${copy.name}`);
    setSaving(true);
    setError('');
    try {
      // The photo is uploaded only now, so cancelling never leaves an orphan file behind.
      let photo = keepPhoto ? (entry?.photo ?? null) : null;
      let thumb = keepPhoto ? (entry?.thumb ?? null) : null;
      if (newPhoto) ({ photo, thumb } = await api.uploadPhoto(newPhoto.full, newPhoto.thumb));
      const body = { name: name.trim(), data, photo, thumb };
      onSaved(entry ? await api.updateEntry(entry.id, body) : await api.createEntry({ kind, ...body }));
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const setIng = (i: number, patch: Partial<EntryData['ingredients'][number]>) =>
    setData((d) => ({ ...d, ingredients: d.ingredients.map((g, j) => (j === i ? { ...g, ...patch } : g)) }));
  const setStep = (i: number, value: string) => setData((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? value : s)) }));

  const shownPhoto = preview || (keepPhoto ? photoUrl(entry?.thumb ?? null) : '');
  const rise = (i: number) => ({
    initial: { opacity: 0, y: 20, filter: 'blur(10px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { duration: 0.5, ease: EASE, delay: Math.min(i * 0.05, 0.6) },
  });

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${entry ? '编辑' : '新建'}${copy.title}`}
      initial={{ clipPath: 'circle(0% at 50% 94%)' }}
      animate={{ clipPath: 'circle(150% at 50% 94%)' }}
      exit={{ clipPath: 'circle(0% at 50% 94%)' }}
      transition={{ duration: 0.7, ease: EASE }}
      className="fixed inset-0 z-50 flex flex-col bg-[rgba(13,10,20,.86)] backdrop-blur-3xl"
    >
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-2 pt-8 lg:pt-6">
        <button onClick={onClose} className="h-11 px-3 text-base text-accent">
          取消
        </button>
        <span className="text-base font-bold">
          {entry ? '编辑' : '新建'}
          {copy.title}
        </span>
        <span className="w-14" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-5 pb-10 pt-3">
          {stage === 'text' ? (
            <div className="flex flex-col gap-3.5">
              <label htmlFor="raw" className="text-2xl font-extrabold">
                输入或粘贴内容
              </label>
              <p className="-mt-2 text-sm text-sub">无需区分{copy.item}与步骤，AI 将自动整理，确认后保存。</p>
              <div className="relative overflow-hidden rounded-[22px] border border-white/20 bg-white/[.07]">
                <textarea
                  id="raw"
                  value={text}
                  disabled={thinking}
                  placeholder={copy.ph}
                  onChange={(e) => setText(e.target.value)}
                  className={`block h-64 w-full resize-none border-0 bg-transparent p-4 text-base leading-relaxed outline-none transition-opacity duration-300 placeholder:text-[#a79fb3] ${thinking ? 'opacity-45' : ''}`}
                />
                {thinking && <span aria-hidden="true" className="absolute inset-x-0 h-[3px] bg-accent shadow-[0_0_26px_8px_rgba(255,138,101,.7)] [animation:scan_1.1s_ease-in-out_infinite_alternate]" />}
              </div>
              {error && (
                <p role="alert" className="text-sm text-accent">
                  {error}
                </p>
              )}
              <button onClick={organise} disabled={thinking || text.trim().length < 4} className="btn-accent flex h-[58px] items-center justify-center gap-2 text-lg">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
                </svg>
                {thinking ? '正在整理…' : 'AI 整理'}
              </button>
              <button onClick={() => setStage('form')} disabled={thinking} className="h-11 text-[15px] text-sub">
                手动填写
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <motion.div {...rise(0)} className="flex flex-col gap-2">
                <label htmlFor="name" className="text-sm font-semibold text-sub">
                  {copy.name}
                </label>
                <input id="name" className="field !text-2xl !font-extrabold" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </motion.div>

              <motion.div {...rise(1)} className="flex items-center gap-3">
                {shownPhoto && <img src={shownPhoto} alt="已选照片" className="h-20 w-20 rounded-2xl object-cover" />}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
                <button onClick={() => fileRef.current?.click()} disabled={compressing} className="h-12 flex-1 rounded-2xl border border-dashed border-white/35 text-[15px] text-sub">
                  {compressing ? '正在处理照片…' : shownPhoto ? '更换照片' : '添加照片（可选）'}
                </button>
                {shownPhoto && (
                  <button
                    aria-label="移除照片"
                    onClick={() => {
                      setNewPhoto(null);
                      setPreview('');
                      setKeepPhoto(false);
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 text-sub"
                  >
                    {closeIcon}
                  </button>
                )}
              </motion.div>

              {kind === 'cocktail' && (
                <motion.div {...rise(2)} className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="glass" className="text-sm font-semibold text-sub">
                      杯型
                    </label>
                    <input id="glass" className="field" value={data.glass} placeholder="例如：古典杯" onChange={(e) => setData({ ...data, glass: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="method" className="text-sm font-semibold text-sub">
                      调制方式
                    </label>
                    <input id="method" className="field" value={data.method} placeholder="例如：搅拌" onChange={(e) => setData({ ...data, method: e.target.value })} />
                  </div>
                </motion.div>
              )}

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-sub">{copy.item}</h3>
                {data.ingredients.map((g, i) => (
                  <motion.div {...rise(i + 2)} key={i} className="flex gap-2">
                    <input aria-label={`${copy.item}名`} className="field min-w-0 flex-[3]" value={g.name} placeholder="名称" onChange={(e) => setIng(i, { name: e.target.value })} />
                    <input
                      aria-label="用量"
                      className="field min-w-0 flex-[2]"
                      value={g.amount}
                      placeholder="用量（可选）"
                      onChange={(e) => setIng(i, { amount: e.target.value })}
                    />
                    <button aria-label={`删除${g.name || copy.item}`} onClick={() => setData((d) => ({ ...d, ingredients: d.ingredients.filter((_, j) => j !== i) }))} className="flex h-12 w-11 shrink-0 items-center justify-center text-sub">
                      {closeIcon}
                    </button>
                  </motion.div>
                ))}
                <button onClick={() => setData((d) => ({ ...d, ingredients: [...d.ingredients, { name: '', amount: '' }] }))} className="h-11 rounded-2xl border border-white/15 text-[15px] text-sub">
                  添加{copy.item}
                </button>
                {data.ingredients.some((g) => !g.amount) && <p className="text-xs text-sub">用量可留空。AI 整理时不会补全原文未提及的用量。</p>}
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-sub">步骤</h3>
                {data.steps.map((s, i) => (
                  <motion.div {...rise(data.ingredients.length + i + 3)} key={i} className="flex items-start gap-2">
                    <span className="w-6 shrink-0 pt-3 text-center text-xl font-extrabold text-accent">{i + 1}</span>
                    <textarea aria-label={`第 ${i + 1} 步`} className="field min-h-[76px] flex-1 resize-y leading-relaxed" value={s} onChange={(e) => setStep(i, e.target.value)} />
                    <button aria-label={`删除第 ${i + 1} 步`} onClick={() => setData((d) => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))} className="flex h-12 w-11 shrink-0 items-center justify-center text-sub">
                      {closeIcon}
                    </button>
                  </motion.div>
                ))}
                <button onClick={() => setData((d) => ({ ...d, steps: [...d.steps, ''] }))} className="h-11 rounded-2xl border border-white/15 text-[15px] text-sub">
                  添加步骤
                </button>
              </section>

              <div className="flex flex-col gap-2">
                <label htmlFor="note" className="text-sm font-semibold text-sub">
                  备注
                </label>
                <textarea id="note" className="field min-h-[76px] resize-y leading-relaxed" value={data.note} placeholder="可选，例如下次的调整方向" onChange={(e) => setData({ ...data, note: e.target.value })} />
              </div>

              {error && (
                <p role="alert" className="text-sm text-accent">
                  {error}
                </p>
              )}
              <button onClick={save} disabled={saving || compressing} className="btn-accent h-[58px] text-lg">
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
