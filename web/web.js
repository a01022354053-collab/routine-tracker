// 일상 매니저 — 웹(leeseung06.kro.kr)에서 돌 때만 쓰는 연결 코드.
// Claude 아티팩트 안에서는 window.claude가 이미 있어서 아무것도 하지 않는다.
// 웹에서는 같은 모양의 window.claude를 만들어 준다:
//   db        → Supabase 테이블 app_docs (로그인한 본인 기록만)
//   sample    → /api/manager (서버에서 Anthropic API를 부름, 도구는 이 페이지에서 실행)
//   downloads → 브라우저 내려받기
(() => {
  if (window.claude) return;
  window.__webMode = true;

  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const T = 'app_docs';
  const S = { sb: null, session: null };

  /* ---------- 로그인 ---------- */
  function loginOverlay() {
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.className = 'login';
      box.innerHTML = `
        <form class="login-card panel" autocomplete="on">
          <svg class="login-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0Q13.9 10.1 24 12 13.9 13.9 12 24 10.1 13.9 0 12 10.1 10.1 12 0Z" fill="currentColor"/></svg>
          <h1>일상 매니저</h1>
          <label>이메일<input class="field" id="lgEmail" type="email" autocomplete="email" required></label>
          <label>비밀번호<input class="field" id="lgPw" type="password" autocomplete="current-password" minlength="6" required></label>
          <p class="login-msg" id="lgMsg" role="status"></p>
          <button class="btn" type="submit" id="lgGo">로그인</button>
          <button class="login-alt" type="button" id="lgNew">처음이에요 · 가입하기</button>
        </form>`;
      document.body.append(box);
      const $ = q => box.querySelector(q);
      let signup = false;
      const say = (t, bad) => { $('#lgMsg').textContent = t; $('#lgMsg').classList.toggle('bad', !!bad); };
      $('#lgNew').addEventListener('click', () => {
        signup = !signup;
        $('#lgGo').textContent = signup ? '가입하기' : '로그인';
        $('#lgNew').textContent = signup ? '이미 가입했어요 · 로그인' : '처음이에요 · 가입하기';
        $('#lgPw').autocomplete = signup ? 'new-password' : 'current-password';
        say('');
      });
      $('form').addEventListener('submit', async e => {
        e.preventDefault();
        const email = $('#lgEmail').value.trim(), password = $('#lgPw').value;
        $('#lgGo').disabled = true;
        say(signup ? '가입하는 중…' : '로그인하는 중…');
        try {
          const r = signup ? await S.sb.auth.signUp({ email, password }) : await S.sb.auth.signInWithPassword({ email, password });
          if (r.error) throw r.error;
          if (!r.data.session) { say('메일함에서 확인 링크를 누른 뒤 로그인해 주세요.'); signup = false; $('#lgGo').textContent = '로그인'; return; }
          box.classList.add('out');
          setTimeout(() => box.remove(), 400);
          resolve(r.data.session);
        } catch (err) {
          say(/Invalid login/i.test(err.message) ? '이메일이나 비밀번호가 맞지 않아요.' : `안 됐어요: ${err.message}`, true);
        } finally { $('#lgGo').disabled = false; }
      });
      setTimeout(() => $('#lgEmail').focus(), 300);
    });
  }

  const ready = (async () => {
    const cfg = await (await fetch('/api/config', { cache: 'no-store' })).json();
    if (!cfg.url || !cfg.anonKey) throw new Error('저장소 설정이 없어요');
    S.sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    let { data: { session } } = await S.sb.auth.getSession();
    if (!session) session = await loginOverlay();
    S.session = session;
    S.sb.auth.onAuthStateChange((_e, s) => { if (s) S.session = s; });
    startRealtime();
    return S;
  })();
  window.__webSignOut = async () => { await ready; await S.sb.auth.signOut(); location.reload(); };

  /* ---------- 저장소(db): 아티팩트 db와 같은 모양 ---------- */
  const cache = new Map();          // path → data
  const listeners = new Set();      // { type, path, filters, next, error }
  const colOf = p => p.split('/').slice(0, -1).join('/');
  const cmp = {
    '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b,
    '>': (a, b) => a > b, '>=': (a, b) => a >= b, in: (a, b) => b.includes(a), 'not-in': (a, b) => !b.includes(a),
  };
  const pgOp = { '==': 'eq', '!=': 'neq', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte' };
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
  const fail = e => ({ code: 'unavailable', message: e?.message || String(e) });

  async function fetchDoc(path) {
    await ready;
    const { data, error } = await S.sb.from(T).select('path,data').eq('path', path).maybeSingle();
    if (error) throw fail(error);
    if (data) cache.set(path, data.data); else cache.delete(path);
  }
  async function fetchCol(path, filters) {
    await ready;
    let q = S.sb.from(T).select('path,data').eq('col', path);
    for (const [f, op, v] of filters) if (pgOp[op]) q = q[pgOp[op]](`data->>${f}`, v);
    const { data, error } = await q;
    if (error) throw fail(error);
    const seen = new Set();
    for (const row of data || []) { cache.set(row.path, row.data); seen.add(row.path); }
    // 다른 기기에서 지운 문서(앱은 지우지 않지만 혹시 모를 때)
    for (const k of [...cache.keys()]) if (colOf(k) === path && matches(cache.get(k), filters) && !seen.has(k)) cache.delete(k);
  }
  async function write(path, data) {
    await ready;
    const { error } = await S.sb.from(T).upsert(
      { owner: S.session.user.id, path, col: colOf(path), data, updated_at: new Date().toISOString() },
      { onConflict: 'owner,path' });
    if (error) throw fail(error);
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
      delete: async () => {
        cache.delete(path); emit();
        await ready;
        const { error } = await S.sb.from(T).delete().eq('path', path);
        if (error) throw fail(error);
      },
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

  // 다른 기기에서 바뀐 것: 실시간 알림 + 화면이 다시 보일 때 다시 읽기
  function startRealtime() {
    try {
      S.sb.channel('app_docs').on('postgres_changes', { event: '*', schema: 'public', table: T }, p => {
        const row = p.new && p.new.path ? p.new : null;
        if (row) cache.set(row.path, row.data); else if (p.old?.path) cache.delete(p.old.path);
        emit();
      }).subscribe();
    } catch (e) { /* 실시간이 안 되면 다시 읽기로만 */ }
  }
  async function refetchAll() {
    const seen = new Set();
    for (const l of listeners) {
      const key = `${l.type}:${l.path}:${JSON.stringify(l.filters)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try { l.type === 'doc' ? await fetchDoc(l.path) : await fetchCol(l.path, l.filters); } catch (e) { /* 다음에 */ }
    }
    emit();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refetchAll(); });
  setInterval(() => { if (!document.hidden) refetchAll(); }, 60000);

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
    const { data: fresh } = await S.sb.auth.getSession(); // 만료된 토큰이면 새로 받아 둔다
    if (fresh?.session) S.session = fresh.session;
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
      const res = await fetch('/api/manager', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${S.session.access_token}` },
        body: JSON.stringify({ system, messages, tools: apiTools }),
        signal: opts.signal,
      }).catch(e => { throw { code: e?.name === 'AbortError' ? 'cancelled' : 'upstream_error', message: String(e), text: full || undefined }; });
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
  sample.json = async (input, opts) => JSON.parse((await sample(input, opts)).text.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, ''));

  /* ---------- 백업 불러오기: 아티팩트에서 내려받은 JSON을 이 계정에 넣는다 ---------- */
  // 같은 경로에 이미 다른 기록이 있으면 덮어쓰기 전에 restored/<시각> 문서에 남겨 둔다(지우지 않는다)
  const COLS = ['days', 'workout', 'settings', 'money', 'spend', 'transfers', 'balhist', 'savings', 'stocks', 'items', 'shopping', 'chatlog', 'log', 'chat'];
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
          if (data && typeof data === 'object') rows.push({ path: `${col}/${id}`, data });
        }
        if (!rows.length) throw new Error('백업 파일에 기록이 없어요');
        if (!confirm(`기록 ${rows.length}개를 넣을까요?\n이미 있는 같은 날 기록은 백업 내용으로 바뀌고, 바뀌기 전 내용은 따로 남겨 둬요.`)) return;
        const { data: existing, error } = await S.sb.from(T).select('path,data');
        if (error) throw error;
        const now = new Map((existing || []).map(r => [r.path, r.data]));
        const replaced = {};
        for (const r of rows) if (now.has(r.path) && JSON.stringify(now.get(r.path)) !== JSON.stringify(r.data)) replaced[r.path] = now.get(r.path);
        const at = new Date().toISOString();
        if (Object.keys(replaced).length) await write(`restored/${at.replace(/[:.]/g, '-')}`, { at, file: file.name, replaced });
        const uid = S.session.user.id;
        for (let i = 0; i < rows.length; i += 200) {
          const part = rows.slice(i, i + 200).map(r => ({ owner: uid, path: r.path, col: colOf(r.path), data: r.data, updated_at: at }));
          const { error: e2 } = await S.sb.from(T).upsert(part, { onConflict: 'owner,path' });
          if (e2) throw e2;
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
