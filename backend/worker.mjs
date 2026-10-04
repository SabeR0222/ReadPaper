const encoder = new TextEncoder();
const MAX_BODY = 2 * 1024 * 1024;
const MAX_RECORDS = 1000;
const MAX_FILE_BYTES = 900 * 1024;
const SESSION_SECONDS = 900;
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new ApiError(status, message); };
const base64 = bytes => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
const from64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const url64 = bytes => base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl64 = text => from64(text.replace(/-/g, '+').replace(/_/g, '/'));

function settings(env) {
  if (!env.GITHUB_TOKEN || !env.EDIT_KEY || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32)
    fail(503, '后端密钥尚未配置完成。');
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO || '') || !env.GITHUB_BRANCH)
    fail(503, '后端仓库配置不完整。');
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!origins.length || origins.some(x => { try { return new URL(x).origin !== x; } catch { return true; } }))
    fail(503, '后端网站来源配置不完整。');
  return { origins, repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH };
}

export function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(400, '文章格式不正确。');
  const record = {};
  const limits = { id:100, title:400, url:1500, authors:1500, team:500, date:10, venue:500,
    family:20, kind:30, credibility:200, model:500, hardware:500, contribution:12000, context:12000 };
  for (const [key, limit] of Object.entries(limits)) {
    if (typeof raw[key] !== 'string' || raw[key].length > limit) fail(400, `文章字段 ${key} 不正确。`);
    record[key] = raw[key].trim();
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(record.id) || !record.title) fail(400, '请检查记录 ID 和标题。');
  try { const u = new URL(record.url); if (u.protocol !== 'https:' || u.username || u.password) throw Error(); }
  catch { fail(400, '论文原文链接必须为有效的 HTTPS 地址。'); }
  if (!['VLA','WAM','VLA / WAM'].includes(record.family) || !['综述','模型论文','加速方法','部署实测'].includes(record.kind))
    fail(400, '研究对象或论文类型不正确。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !Number.isFinite(Date.parse(record.date)) || new Date(record.date).toISOString().slice(0,10) !== record.date)
    fail(400, '发表日期不正确。');
  if (!Number.isInteger(raw.year) || raw.year < 2000 || raw.year > 2100) fail(400, '年份不正确。');
  record.year = raw.year;
  if (!Array.isArray(raw.methods) || raw.methods.length > 30 || raw.methods.some(x => typeof x !== 'string' || !x.trim() || x.length > 100))
    fail(400, '方法标签不正确。');
  if (!Array.isArray(raw.metrics) || raw.metrics.length > 30 || raw.metrics.some(x => !Array.isArray(x) || x.length !== 2 || x.some(v => typeof v !== 'string' || v.length > 1000)))
    fail(400, '部署指标不正确。');
  record.methods = [...new Set(raw.methods.map(x => x.trim()))];
  record.metrics = raw.metrics.map(x => x.map(v => v.trim()));
  return record;
}
function normalizeList(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_RECORDS) fail(400, `文章数量不得超过 ${MAX_RECORDS}。`);
  const records = raw.map(normalizeRecord);
  if (new Set(records.map(x => x.id)).size !== records.length) fail(400, '记录 ID 不能重复。');
  return records;
}

async function jsonBody(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) fail(415, '请使用 JSON 请求。');
  const reader = request.body?.getReader();
  if (!reader) fail(400, '请求内容为空。');
  const chunks = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length;
    if (length > MAX_BODY) { await reader.cancel(); fail(413, '请求内容过大。'); } chunks.push(value); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value; } catch { fail(400, 'JSON 格式不正确。'); }
}
async function equalSecrets(a, b) {
  const [x,y] = await Promise.all([a,b].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const xx = new Uint8Array(x), yy = new Uint8Array(y); let difference = 0;
  for (let i=0; i<xx.length; i++) difference |= xx[i] ^ yy[i];
  return difference === 0;
}
async function signingKey(env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET), { name:'HMAC', hash:'SHA-256' }, false, ['sign','verify']);
}
async function issueSession(env, origin, repo) {
  const expires = Math.floor(Date.now()/1000) + SESSION_SECONDS;
  const payload = url64(encoder.encode(JSON.stringify({ expires, origin, repo, nonce:crypto.randomUUID() })));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(payload));
  return { token:`${payload}.${url64(new Uint8Array(signature))}`, expires };
}
async function verifySession(request, env, origin, repo) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ') || header.length > 2000) fail(401, '请重新输入编辑密钥。');
  try {
    const parts = header.slice(7).split('.'); if (parts.length !== 2) throw Error();
    const [payload,signature] = parts;
    if (!await crypto.subtle.verify('HMAC', await signingKey(env), fromUrl64(signature), encoder.encode(payload))) throw Error();
    const value = JSON.parse(new TextDecoder().decode(fromUrl64(payload)));
    const now = Math.floor(Date.now()/1000);
    if (!Number.isInteger(value.expires) || value.expires <= now || value.expires > now + SESSION_SECONDS || value.origin !== origin || value.repo !== repo) throw Error();
  } catch { fail(401, '验证已失效，请重新输入编辑密钥。'); }
}

async function github(env, config, init) {
  const endpoint = `https://api.github.com/repos/${config.repo}/contents/papers.json`;
  let response;
  try { response = await fetch(endpoint + (init?.method === 'PUT' ? '' : `?ref=${encodeURIComponent(config.branch)}`), {
    ...init, headers:{ Authorization:`Bearer ${env.GITHUB_TOKEN}`, Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'ReadPaper-Editor', 'Content-Type':'application/json' },
    signal:AbortSignal.timeout(15000), redirect:'error'
  }); } catch (error) {
    // Emit only fixed diagnostic codes: never log credentials or raw exceptions.
    const detail = String(error?.message || '');
    const code = /AbortSignal|\.timeout.*function/i.test(detail) ? 'RUNTIME_TIMEOUT_UNSUPPORTED'
      : /header|ByteString|character/i.test(detail) ? 'INVALID_AUTH_HEADER'
      : /timeout|abort/i.test(detail) ? 'GITHUB_TIMEOUT' : 'GITHUB_NETWORK_ERROR';
    console.error('ReadPaper GitHub request failed:', code);
    fail(502, `连接 GitHub 失败（${code}）；请维护者检查后端日志。`);
  }
  if (response.status === 409 || response.status === 422) fail(409, '仓库已发生变化，请刷新并核对记录后重试。');
  if (!response.ok) fail(502, `GitHub 返回 ${response.status}；请维护者检查令牌权限、有效期和仓库分支。`);
  return response.json();
}
async function readPapers(env, config) {
  const file = await github(env, config);
  if (!file.sha || file.encoding !== 'base64' || typeof file.content !== 'string') fail(502, 'GitHub 文献数据格式不正确。');
  try { return { papers:normalizeList(JSON.parse(new TextDecoder().decode(from64(file.content.replace(/\s/g,''))))), sha:file.sha }; }
  catch { fail(502, '仓库中的 papers.json 数据不完整，请维护者检查。'); }
}
export function applyMutation(papers, body) {
  const { action } = body; const map = new Map(papers.map(p => [p.id,p])); let label;
  if (action === 'add' || action === 'update') {
    const record = normalizeRecord(body.record);
    if (action === 'add' && map.has(record.id)) fail(409, '该记录 ID 已存在。');
    if (action === 'update' && !map.has(record.id)) fail(409, '文章已经被删除，请刷新。');
    map.set(record.id,record); label = `${action}: ${record.title.replace(/[\r\n]/g,' ').slice(0,160)}`;
  } else if (action === 'delete') {
    if (typeof body.id !== 'string' || !map.has(body.id)) fail(409, '文章不存在或已经被删除。');
    label = `delete: ${body.id}`; map.delete(body.id);
  } else if (action === 'import') {
    const incoming = normalizeList(body.records); if (!incoming.length) fail(400, '导入文件没有文章。');
    for (const record of incoming) map.set(record.id,record);
    label = `import: ${incoming.length} records`;
  } else fail(400, '不支持的编辑操作。');
  const result = [...map.values()].sort((a,b) => b.year-a.year || b.date.localeCompare(a.date));
  if (result.length > MAX_RECORDS) fail(400, `文章数量不得超过 ${MAX_RECORDS}。`);
  return { papers:result, message:`[papers] ${label}` };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const path = new URL(request.url).pathname.replace(/\/$/,'') || '/';
    let config; let cors = {};
    const reply = (status,data) => new Response(JSON.stringify(data), { status, headers:{ ...cors,
      'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Vary':'Origin' } });
    try {
      config = settings(env);
      if (origin && !config.origins.includes(origin)) fail(403, '不允许的网站来源。');
      if (origin) cors = { 'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type, Authorization', 'Access-Control-Max-Age':'600' };
      if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors });
      if (path === '/health' && request.method === 'GET') return reply(200,{ ready:true });
      if (path === '/auth' && request.method === 'POST') {
        if (!origin) fail(403, '需要有效的网站来源。');
        if (!env.AUTH_LIMITER) fail(503, '密钥验证限流配置尚未完成。');
        const limit = await env.AUTH_LIMITER.limit({ key:'readpaper-editor-auth' });
        if (!limit.success) fail(429, '密钥验证过于频繁，请一分钟后重试。');
        const body = await jsonBody(request);
        if (typeof body.key !== 'string' || body.key.length > 200 || !await equalSecrets(body.key,env.EDIT_KEY)) fail(401, '密钥不正确，请重新输入。');
        return reply(200,await issueSession(env,origin,config.repo));
      }
      if (path === '/papers' && request.method === 'GET') {
        if (env.READ_PUBLIC !== 'true') await verifySession(request,env,origin,config.repo);
        return reply(200,await readPapers(env,config));
      }
      if (path === '/papers' && request.method === 'POST') {
        if (!origin) fail(403, '需要有效的网站来源。');
        await verifySession(request,env,origin,config.repo);
        const body = await jsonBody(request);
        if (!body || typeof body.sha !== 'string' || !/^[a-f0-9]{40}$/.test(body.sha)) fail(400, '需要文献版本编号。');
        const current = await readPapers(env,config);
        if (body.sha !== current.sha) fail(409, '其他人已经修改了文献，请刷新并核对后重试。');
        const next = applyMutation(current.papers,body);
        const text = JSON.stringify(next.papers,null,2)+'\n';
        if (encoder.encode(text).length > MAX_FILE_BYTES) fail(413, '文献文件不得超过 900 KB。');
        if (JSON.stringify(next.papers) === JSON.stringify(current.papers)) return reply(200,{ ...current, unchanged:true });
        const result = await github(env,config,{ method:'PUT', body:JSON.stringify({ message:next.message,
          content:base64(encoder.encode(text)), sha:current.sha, branch:config.branch }) });
        if (!result.content?.sha || !result.commit?.sha) fail(502, 'GitHub 提交结果不完整，请刷新确认保存状态。');
        return reply(200,{ papers:next.papers, sha:result.content.sha, commit:result.commit.sha });
      }
      return reply(404,{ error:'接口不存在。' });
    } catch (error) {
      return reply(error instanceof ApiError ? error.status : 500,
        { error:error instanceof ApiError ? error.message : '服务器处理失败，请稍后重试。' });
    }
  }
};
