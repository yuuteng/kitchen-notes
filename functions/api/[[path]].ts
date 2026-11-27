/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  AI: Ai;
}

const AI_DAILY_LIMIT = 40;
const AI_MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct-fast'];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const KINDS = ['recipe', 'cocktail'];
const METHODS = ['espresso', 'pourover'];
const SHOT_COLS = ['method', 'bean', 'roast_date', 'grind', 'dose', 'time_s', 'yield_g', 'pressure', 'temp', 'score', 'taste', 'note'] as const;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

function getUser(request: Request): string {
  let raw = request.headers.get('x-user') || '';
  try {
    raw = decodeURIComponent(raw);
  } catch {
    throw new HttpError(400, '用户名格式无效');
  }
  const user = raw.trim().toLowerCase();
  if (!user || user.length > 24) throw new HttpError(401, '请输入用户名');
  return user;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const photoKey = (v: unknown): string | null => (typeof v === 'string' && /^[a-f0-9-]{36}(-t)?\.(webp|jpg)$/.test(v) ? v : null);

/** Keep only the fields the app knows about, so stored JSON stays predictable. */
function cleanData(input: any) {
  const d = input && typeof input === 'object' ? input : {};
  const ingredients = (Array.isArray(d.ingredients) ? d.ingredients : [])
    .slice(0, 60)
    .map((g: any) => ({ name: str(g?.name, 60), amount: str(g?.amount, 60) }))
    .filter((g: { name: string }) => g.name);
  const steps = (Array.isArray(d.steps) ? d.steps : [])
    .slice(0, 60)
    .map((s: unknown) => str(s, 1000))
    .filter(Boolean);
  return { ingredients, steps, note: str(d.note), glass: str(d.glass, 40), method: str(d.method, 40) };
}

function shotValues(b: any) {
  if (!METHODS.includes(b?.method)) throw new HttpError(400, '冲煮方式无效');
  const score = num(b.score);
  const taste = num(b.taste);
  return [
    b.method,
    str(b.bean, 60),
    /^\d{4}-\d{2}-\d{2}$/.test(b.roast_date || '') ? b.roast_date : null,
    num(b.grind),
    num(b.dose),
    num(b.time_s),
    num(b.yield_g),
    num(b.pressure),
    num(b.temp),
    score === null ? null : Math.max(1, Math.min(10, Math.round(score))),
    taste === null ? null : Math.max(-2, Math.min(2, Math.round(taste))),
    str(b.note),
  ];
}

const rowToEntry = (r: any) => ({ ...r, data: JSON.parse(r.data || '{}') });

async function deletePhotos(env: Env, ...keys: (string | null | undefined)[]) {
  const real = keys.filter((k): k is string => !!k);
  if (real.length) await env.PHOTOS.delete(real);
}

// ---------- AI extraction ----------

const PROMPTS: Record<string, string> = {
  recipe: `你是菜谱整理助手。把用户随手写的做菜文字整理成 JSON，只输出 JSON，不要解释。
格式：{"name":"菜名","ingredients":[{"name":"食材","amount":"用量"}],"steps":["步骤"],"note":"备注"}
规则：
- 只用原文里出现的信息。原文没写用量的食材，amount 填空字符串 ""，绝对不要自己估计。
- 用量保留原文的数字和单位，例如 "300 g"、"3 勺"。
- 步骤按做菜顺序拆成短句，每步一句或两句。
- 调味料也算食材。没有备注就填 ""。`,
  cocktail: `你是鸡尾酒配方整理助手。把用户随手写的调酒文字整理成 JSON，只输出 JSON，不要解释。
格式：{"name":"酒名","ingredients":[{"name":"材料","amount":"用量"}],"steps":["步骤"],"glass":"杯型","method":"调制方式","note":"备注"}
规则：
- 只用原文里出现的信息。原文没写用量的材料，amount 填空字符串 ""，绝对不要自己估计。
- 用量保留原文的数字和单位，例如 "30 ml"、"2 dash"。
- method 填 摇和、搅拌、直调、捣压 之一；原文没提就填 ""。glass 没提就填 ""。
- 装饰物（橙皮、薄荷等）也列进 ingredients。`,
  coffee: `你是咖啡记录助手。把用户写的一句咖啡记录整理成 JSON，只输出 JSON，不要解释。
格式：{"method":"espresso 或 pourover","bean":"豆子名","grind":数字,"dose":数字,"time_s":数字,"yield_g":数字,"pressure":数字,"temp":数字,"score":数字,"taste":数字,"note":"备注"}
规则：
- 原文没提到的字段一律填 null，绝对不要自己估计。
- method：提到手冲、滤杯、V60、注水、水温就是 pourover，否则是 espresso。
- grind 研磨度刻度；dose 粉量（克）；time_s 萃取时间换算成秒（"2分30秒" 是 150）；yield_g 意式是出液克数，手冲是注水克数；pressure 压力（bar）；temp 水温（摄氏度）；score 评分 1 到 10。
- taste：很酸 -2，偏酸或有点酸 -1，平衡或好喝 0，偏苦或有点苦 1，很苦 2；没提就 null。`,
};

function parseJsonLoose(raw: unknown): any {
  if (raw && typeof raw === 'object') return raw;
  const text = String(raw ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 没有返回可用的结果');
  return JSON.parse(text.slice(start, end + 1));
}

async function extract(env: Env, user: string, body: any) {
  const kind = String(body?.kind || '');
  const text = str(body?.text, 4000);
  if (!PROMPTS[kind]) throw new HttpError(400, '不支持该记录类型');
  if (text.length < 4) throw new HttpError(400, '内容过短，无法整理');

  const day = new Date().toISOString().slice(0, 10);
  const used = await env.DB.prepare('SELECT count FROM ai_usage WHERE user = ? AND day = ?').bind(user, day).first<{ count: number }>();
  if ((used?.count ?? 0) >= AI_DAILY_LIMIT) throw new HttpError(429, `今日 AI 整理次数已达上限（${AI_DAILY_LIMIT} 次），请手动填写`);
  await env.DB.prepare('INSERT INTO ai_usage (user, day, count) VALUES (?, ?, 1) ON CONFLICT (user, day) DO UPDATE SET count = count + 1').bind(user, day).run();

  let lastError: unknown;
  for (const model of AI_MODELS) {
    try {
      const out: any = await env.AI.run(model as any, {
        messages: [
          { role: 'system', content: PROMPTS[kind] },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1500,
      } as any);
      const parsed = parseJsonLoose(out?.response ?? out);
      if (kind === 'coffee') {
        return {
          method: METHODS.includes(parsed.method) ? parsed.method : 'espresso',
          bean: str(parsed.bean, 60),
          grind: num(parsed.grind),
          dose: num(parsed.dose),
          time_s: num(parsed.time_s),
          yield_g: num(parsed.yield_g),
          pressure: num(parsed.pressure),
          temp: num(parsed.temp),
          score: num(parsed.score),
          taste: num(parsed.taste),
          note: str(parsed.note),
        };
      }
      return { name: str(parsed.name, 80), data: cleanData(parsed) };
    } catch (e) {
      lastError = e;
    }
  }
  console.error('AI extract failed', lastError);
  throw new HttpError(502, 'AI 服务暂不可用，请手动填写');
}

// ---------- CSV ----------

function toCsv(rows: any[]): string {
  const head = ['时间', '方式', '咖啡豆', '研磨度', '粉量g', '时间s', '液量g', '压力bar', '水温C', '评分', '口感(-2很酸~2很苦)', '备注'];
  const cols = ['created_at', 'method', 'bean', 'grind', 'dose', 'time_s', 'yield_g', 'pressure', 'temp', 'score', 'taste', 'note'];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))];
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads UTF-8 correctly
}

// ---------- router ----------

async function handle(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method;
  const url = new URL(request.url);
  const [head, arg] = path.split('/');

  // Photos are fetched by <img>, which cannot send headers; keys are random UUIDs.
  if (head === 'photo' && method === 'GET') {
    const key = photoKey(arg);
    const obj = key ? await env.PHOTOS.get(key) : null;
    if (!obj) return new Response('not found', { status: 404 });
    return new Response(obj.body, {
      headers: {
        'content-type': obj.httpMetadata?.contentType || 'image/webp',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  }

  const user = getUser(request);

  if (head === 'photo' && method === 'POST') {
    const form = await request.formData();
    const full = form.get('full') as unknown as File | null;
    const thumb = form.get('thumb') as unknown as File | null;
    if (!full || typeof full === 'string' || !thumb || typeof thumb === 'string') throw new HttpError(400, '未收到图片');
    if (full.size > MAX_PHOTO_BYTES || thumb.size > MAX_PHOTO_BYTES) throw new HttpError(413, '图片大小超出限制');
    if (!/^image\/(webp|jpeg)$/.test(full.type) || !/^image\/(webp|jpeg)$/.test(thumb.type)) throw new HttpError(415, '不支持该图片格式');
    const id = crypto.randomUUID();
    const ext = full.type === 'image/webp' ? 'webp' : 'jpg';
    const text = thumb.type === 'image/webp' ? 'webp' : 'jpg';
    const photo = `${id}.${ext}`;
    const thumbKey = `${id}-t.${text}`;
    const meta = { user };
    await env.PHOTOS.put(photo, full.stream(), { httpMetadata: { contentType: full.type }, customMetadata: meta });
    await env.PHOTOS.put(thumbKey, thumb.stream(), { httpMetadata: { contentType: thumb.type }, customMetadata: meta });
    return json({ photo, thumb: thumbKey });
  }

  if (head === 'extract' && method === 'POST') return json(await extract(env, user, await request.json()));

  if (head === 'entries') {
    if (method === 'GET') {
      const kind = url.searchParams.get('kind') || 'recipe';
      const { results } = await env.DB.prepare('SELECT * FROM entries WHERE user = ? AND kind = ? ORDER BY created_at DESC, id DESC').bind(user, kind).all();
      return json(results.map(rowToEntry));
    }
    if (method === 'POST') {
      const b: any = await request.json();
      const name = str(b.name, 80);
      if (!KINDS.includes(b.kind)) throw new HttpError(400, '记录类型无效');
      if (!name) throw new HttpError(400, '请填写名称');
      const row = await env.DB.prepare('INSERT INTO entries (user, kind, name, data, photo, thumb) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
        .bind(user, b.kind, name, JSON.stringify(cleanData(b.data)), photoKey(b.photo), photoKey(b.thumb))
        .first();
      return json(rowToEntry(row), 201);
    }
    const id = Number(arg);
    const old = await env.DB.prepare('SELECT * FROM entries WHERE id = ? AND user = ?').bind(id, user).first<any>();
    if (!old) throw new HttpError(404, '记录不存在');
    if (method === 'PUT') {
      const b: any = await request.json();
      const name = str(b.name, 80);
      if (!name) throw new HttpError(400, '请填写名称');
      const photo = photoKey(b.photo);
      const thumb = photoKey(b.thumb);
      const row = await env.DB.prepare('UPDATE entries SET name = ?, data = ?, photo = ?, thumb = ? WHERE id = ? AND user = ? RETURNING *')
        .bind(name, JSON.stringify(cleanData(b.data)), photo, thumb, id, user)
        .first();
      if (old.photo && old.photo !== photo) await deletePhotos(env, old.photo, old.thumb);
      return json(rowToEntry(row));
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM entries WHERE id = ? AND user = ?').bind(id, user).run();
      await deletePhotos(env, old.photo, old.thumb);
      return json({ ok: true });
    }
  }

  if (head === 'shots') {
    if (method === 'GET' && arg === 'export') {
      const { results } = await env.DB.prepare('SELECT * FROM shots WHERE user = ? ORDER BY created_at ASC, id ASC').bind(user).all();
      return new Response(toCsv(results), {
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="coffee.csv"' },
      });
    }
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM shots WHERE user = ? ORDER BY created_at ASC, id ASC').bind(user).all();
      return json(results);
    }
    if (method === 'POST') {
      const row = await env.DB.prepare(`INSERT INTO shots (user, ${SHOT_COLS.join(', ')}) VALUES (?, ${SHOT_COLS.map(() => '?').join(', ')}) RETURNING *`)
        .bind(user, ...shotValues(await request.json()))
        .first();
      return json(row, 201);
    }
    if (method === 'PUT') {
      const row = await env.DB.prepare(`UPDATE shots SET ${SHOT_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND user = ? RETURNING *`)
        .bind(...shotValues(await request.json()), Number(arg), user)
        .first();
      if (!row) throw new HttpError(404, '记录不存在');
      return json(row);
    }
    if (method === 'DELETE') {
      const res = await env.DB.prepare('DELETE FROM shots WHERE id = ? AND user = ?').bind(Number(arg), user).run();
      if (!res.meta.changes) throw new HttpError(404, '记录不存在');
      return json({ ok: true });
    }
  }

  throw new HttpError(404, '接口不存在');
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const raw = params.path;
  const path = Array.isArray(raw) ? raw.join('/') : String(raw || '');
  try {
    return await handle(request, env, path);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: '服务异常，请稍后重试' }, 500);
  }
};
