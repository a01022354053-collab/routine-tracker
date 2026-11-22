// 일상 매니저 — 웹(leeseung06.kro.kr)에서 돌 때만 쓰는 연결 코드.
// Claude 아티팩트 안에서는 window.claude가 이미 있어서 아무것도 하지 않는다.
// 웹에서는 같은 모양의 window.claude를 만들어 준다:
//   db        → /api/db (서버가 Supabase에 읽고 씀, 비밀번호로 들어온 사람만)
//   sample    → /api/manager (서버에서 Anthropic API를 부름, 도구는 이 페이지에서 실행)
//   downloads → 브라우저 내려받기
// 들어오기: 비밀번호 하나(Vercel 환경 변수 APP_PASSWORD). 맞추면 1년 동안 이 기기에서 그대로 열린다.
(() => {
  if (window.claude) return;
  window.__webMode = true;

  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const STAR = '<svg class="login-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0Q13.9 10.1 24 12 13.9 13.9 12 24 10.1 13.9 0 12 10.1 10.1 12 0Z" fill="currentColor"/></svg>';

  /* ---------- 들어오기: 비밀번호 하나 ---------- */
  let gate = null; // 비밀번호 화면이 떠 있으면 그 약속
  function askPassword(missing = []) {
    if (gate) return gate;
    gate = new Promise(resolve => {
      const box = document.createElement('div');
      box.className = 'login';
      box.innerHTML = `
        <form class="login-card panel" autocomplete="on">
          ${STAR}
          <h1>일상 매니저</h1>
          <input type="text" name="username" autocomplete="username" value="일상 매니저" hidden>
          <input class="field login-pw" id="lgPw" name="password" type="password" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호" required>
          <p class="login-msg" id="lgMsg" role="status"></p>
          <button class="btn" type="submit" id="lgGo">들어가기</button>
        </form>`;
      document.body.append(box);
      const $ = q => box.querySelector(q);
      const say = (t, bad) => { $('#lgMsg').textContent = t; $('#lgMsg').classList.toggle('bad', !!bad); };
      if (missing.length) {
        say(`Vercel 환경 변수를 넣어 주세요: ${missing.join(', ')}`, true);
        $('#lgPw').disabled = true;
        $('#lgGo').disabled = true;
      }
      $('form').addEventListener('submit', async e => {
        e.preventDefault();
        const pw = $('#lgPw').value;
        if (!pw) return;
        $('#lgGo').disabled = true;
        say('');
        try {
          const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
          const body = await r.json().catch(() => ({}));
          if (!r.ok) {
            say(body.error || '들어가지 못했어요', true);
            const card = $('.login-card');
            card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
            $('#lgPw').select();
            return;
          }
          box.classList.add('out');
          setTimeout(() => box.remove(), 400);
          gate = null;
          resolve();
        } catch (err) {
          say('연결이 안 돼요. 잠시 후 다시 해 주세요.', true);
        } finally { $('#lgGo').disabled = !!missing.length; }
      });
      setTimeout(() => $('#lgPw').focus(), 300);
    });
    return gate;
  }

  const ready = (async () => {
    const s = await fetch('/api/session', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ ok: false, missing: [] }));
    if (!s.ok) await askPassword(s.missing || []);
  })();
  window.__webSignOut = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  };

  // 서버 부르기. 쿠키가 만료됐으면(401) 비밀번호를 다시 묻고 한 번 더 한다
  async function api(url, init) {
    for (let tryNo = 0; ; tryNo++) {
      const r = await fetch(url, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
      if (r.status === 401 && tryNo === 0) { await askPassword(); continue; }
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw { code: r.status === 401 ? 'session_expired' : 'unavailable', message: body.error || r.statusText };
      return body;
    }
  }

  /* ---------- 저장소(db): 아티팩트 db와 같은 모양 ---------- */
  const cache = new Map();          // path → data
  const listeners = new Set();      // { type, path, filters, next, error }
  const colOf = p => p.split('/').slice(0, -1).join('/');
  const cmp = {
    '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b,
    '>': (a, b) => a > b, '>=': (a, b) => a >= b, in: (a, b) => b.includes(a), 'not-in': (a, b) => !b.includes(a),
  };
  const serverOps = new Set(['==', '!=', '<', '<=', '>', '>=']);
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = path => ({ id: path.split('/').pop(), exists: cache.has(path), data: () => clone(cache.get(path)), metadata: meta });
  const matches = (data, filters) => filters.every(([f, op, v]) => (cmp[op] || (() => true))(data?.[f], v));
  function colSnap(path, filters) {
    const docs = [...cache.keys()].filter(k => colOf(k) === path && matches(cache.get(k), filters)).sort().map(snapDoc);
    return { docs, size: docs.length, empty: !docs.length, metadata: meta, docChanges: () => [] };
  }
  const deliver = l => { try { l.next(l.type === 'doc' ? snapDoc(l.path) : colSnap(l.path, l.filters)); } catch (e) { console.error(e); } };
  let emitQueued = false;
  function emit() {
    if (emitQueued) return;
    emitQueued = true;
    queueMicrotask(() => { emitQueued = false; listeners.forEach(deliver); });
  }
  const pending = new Map(); // 아직 서버에 안 닿은 쓰기: 다시 읽기가 덮어쓰지 않게

  async function fetchDoc(path) {
    await ready;
    const { doc: row } = await api(`/api/db?path=${encodeURIComponent(path)}`);
    if (pending.has(path)) return;
    if (row) cache.set(path, row.data); else cache.delete(path);
  }
  async function fetchCol(path, filters) {
    await ready;
    const where = filters.filter(([, op]) => serverOps.has(op));
    const { docs } = await api(`/api/db?col=${encodeURIComponent(path)}${where.length ? `&where=${encodeURIComponent(JSON.stringify(where))}` : ''}`);
    const seen = new Set();
    for (const row of docs || []) { seen.add(row.path); if (!pending.has(row.path)) cache.set(row.path, row.data); }
    for (const k of [...cache.keys()]) if (colOf(k) === path && matches(cache.get(k), filters) && !seen.has(k) && !pending.has(k)) cache.delete(k);
  }
  async function write(path, data) {
    await ready;
    pending.set(path, (pending.get(path) || 0) + 1);
    try { await api('/api/db', { method: 'POST', body: JSON.stringify({ path, data }) }); }
    finally { const n = pending.get(path) - 1; n ? pending.set(path, n) : pending.delete(path); }
  }

  function doc(path) {
    return {
      id: path.split('/').pop(), path,
      get: async () => { await fetchDoc(path); return snapDoc(path); },
      set: async data => { cache.set(path, clone(data)); emit(); await write(path, clone(data)); },
      update: async data => {
        if (!cache.has(path)) await fetchDoc(path);
        if (!cache.has(path)) throw { code: 'invalid_argument', message: '없는 문서예요' };
        const merged = { ...cache.get(path), ...clone(data) };
        cache.set(path, merged); emit(); await write(path, merged);
      },
      // 기록은 지우지 않는다(removed 표시로 숨긴다)
      delete: async () => { throw { code: 'permission_denied', message: '기록은 지우지 않아요' }; },
      onSnapshot(next, error) {
        const l = { type: 'doc', path, filters: [], next, error };
        listeners.add(l);
        fetchDoc(path).then(() => deliver(l), e => error?.(e));
        return () => listeners.delete(l);
      },
      collection: sub => collection(`${path}/${sub}`),
    };
  }
  function query(path, filters) {
    return {
      path,
      where: (f, op, v) => query(path, [...filters, [f, op, v]]),
      orderBy: () => query(path, filters),
      limit: () => query(path, filters),
      get: async () => { await fetchCol(path, filters); return colSnap(path, filters); },
      onSnapshot(next, error) {
        const l = { type: 'col', path, filters, next, error };
        listeners.add(l);
        fetchCol(path, filters).then(() => deliver(l), e => error?.(e));
        return () => listeners.delete(l);
      },
    };
  }
  function collection(path) { return { ...query(path, []), doc: id => doc(`${path}/${id ?? Math.random().toString(36).slice(2, 12)}`) }; }
  const db = { doc, collection };

  // 다른 기기에서 바뀐 것: 화면이 다시 보일 때, 그리고 30초마다 다시 읽는다
  let refetching = false;
  async function refetchAll() {
    if (refetching) return;
    refetching = true;
    try {
      const seen = new Set();
      for (const l of listeners) {
        const key = `${l.type}:${l.path}:${JSON.stringify(l.filters)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try { l.type === 'doc' ? await fetchDoc(l.path) : await fetchCol(l.path, l.filters); } catch (e) { /* 다음에 */ }
      }
      emit();
    } finally { refetching = false; }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !gate) refetchAll(); });
  setInterval(() => { if (!document.hidden && !gate) refetchAll(); }, 30000);

  /* ---------- 매니저: /api/manager로 Claude를 부르고 도구는 여기서 실행 ---------- */
  const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });
  // 큰 캡처는 줄여서 보낸다(서버로 보낼 수 있는 크기 제한)
  async function shrink(blob) {
    const img = await createImageBitmap(blob);
    const k = Math.min(1, 1568 / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return { media_type: 'image/jpeg', data: await blobToB64(out) };
  }

  async function sample(input, opts = {}) {
    await ready;
    const turns = typeof input === 'string' ? [{ role: 'user', content: input }] : input.slice();
    let system = '';
    if (turns.length > 1 && turns[0].role === 'user') system = turns.shift().content;
    while (turns.length && turns[0].role !== 'user') turns.shift();
    const messages = turns.map(t => ({ role: t.role, content: t.content }));
    const imgs = opts.images ? [...(opts.images.length != null ? opts.images : [opts.images])] : [];
    if (imgs.length) {
      const last = messages[messages.length - 1];
      const blocks = [];
      for (const b of imgs) { const s = await shrink(b); blocks.push({ type: 'image', source: { type: 'base64', ...s } }); }
      last.content = [...blocks, { type: 'text', text: String(last.content) }];
    }
    const tools = opts.tools || [];
    const apiTools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } }));
    let full = '', out = null;
    for (let round = 0; round < 8; round++) {
      let res;
      for (let tryNo = 0; ; tryNo++) {
        res = await fetch('/api/manager', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ system, messages, tools: apiTools }),
          signal: opts.signal,
        }).catch(e => { throw { code: e?.name === 'AbortError' ? 'cancelled' : 'upstream_error', message: String(e), text: full || undefined }; });
        if (res.status === 401 && tryNo === 0) { await askPassword(); continue; }
        break;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw { code: res.status === 401 ? 'session_expired' : res.status === 429 ? 'rate_limited' : res.status === 503 ? 'sampling_disabled' : 'upstream_error', message: body.error || res.statusText, text: full || undefined };
      }
      out = await res.json();
      messages.push({ role: 'assistant', content: out.content });
      const said = out.content.filter(b => b.type === 'text').map(b => b.text).join('');
      if (said) {
        const delta = (full ? '\n\n' : '') + said;
        full += delta;
        opts.onText?.({ text: full, delta });
      }
      if (out.stop_reason === 'refusal') throw { code: 'refused', message: '거절됨' };
      if (out.stop_reason !== 'tool_use') break;
      const uses = out.content.filter(b => b.type === 'tool_use');
      const results = await Promise.all(uses.map(async u => {
        const tool = tools.find(t => t.name === u.name);
        try {
          if (!tool) throw new Error(`없는 도구: ${u.name}`);
          const r = await tool.execute(u.input || {}, { signal: opts.signal || new AbortController().signal });
          return { type: 'tool_result', tool_use_id: u.id, content: typeof r === 'string' ? r : JSON.stringify(r ?? { ok: true }) };
        } catch (e) {
          return { type: 'tool_result', tool_use_id: u.id, content: `Error: ${e?.message || e}`, is_error: true };
        }
      }));
      messages.push({ role: 'user', content: results });
    }
    if (!full) throw { code: 'empty_completion', message: '답이 비었어요' };
    return { text: full, truncated: out?.stop_reason === 'max_tokens', modelTierApplied: 'default' };
  }
  sample.limits = async () => ({
    maxPromptBytes: 262144, tools: { maxCount: 32 },
    images: { maxCount: 4, maxInputBytes: 20000000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  });

  /* ---------- 백업 불러오기: 아티팩트에서 내려받은 JSON을 넣는다 ---------- */
  // 같은 경로에 이미 다른 기록이 있으면 덮어쓰기 전에 restored/<시각> 문서에 남겨 둔다(지우지 않는다)
  const COLS = ['days', 'workout', 'settings', 'money', 'spend', 'transfers', 'balhist', 'savings', 'stocks', 'items', 'shopping', 'fixed', 'budget', 'chatlog', 'log', 'chat'];
  window.__webRestore = btn => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = '넣는 중…';
      try {
        await ready;
        const json = JSON.parse(await file.text());
        const rows = [];
        for (const col of COLS) for (const [id, data] of Object.entries(json[col] || {})) {
          if (data && typeof data === 'object' && !Array.isArray(data)) rows.push({ path: `${col}/${id}`, data });
        }
        if (!rows.length) throw new Error('백업 파일에 기록이 없어요');
        if (!confirm(`기록 ${rows.length}개를 넣을까요?\n이미 있는 같은 날 기록은 백업 내용으로 바뀌고, 바뀌기 전 내용은 따로 남겨 둬요.`)) return;
        const { docs: existing } = await api('/api/db?all=1');
        const now = new Map((existing || []).map(r => [r.path, r.data]));
        const replaced = {};
        for (const r of rows) if (now.has(r.path) && JSON.stringify(now.get(r.path)) !== JSON.stringify(r.data)) replaced[r.path] = now.get(r.path);
        const at = new Date().toISOString();
        if (Object.keys(replaced).length) await write(`restored/${at.replace(/[:.]/g, '-')}`, { at, file: file.name, replaced });
        for (let i = 0; i < rows.length; i += 100) {
          await api('/api/db', { method: 'POST', body: JSON.stringify({ rows: rows.slice(i, i + 100) }) });
        }
        alert(`기록 ${rows.length}개를 넣었어요.`);
        location.reload();
      } catch (e) {
        alert(`넣지 못했어요: ${e?.message || e}`);
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
    input.click();
  };

  /* ---------- 내려받기 ---------- */
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return { status: 'saved' };
    },
  };

  window.claude = {
    use: async name => {
      if (name === 'downloads') return downloads;
      if (name === 'db' || name === 'sample') {
        try { await ready; } catch (e) { console.error(e); return null; }
        return name === 'db' ? db : sample;
      }
      return null;
    },
  };
})();
