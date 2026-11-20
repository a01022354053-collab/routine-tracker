// 일상 매니저 — 한 화면 앱. 주소의 #뒤 이름으로 화면을 바꾼다.
const DAY = ['일', '월', '화', '수', '목', '금', '토'];
const WEEK_HEAD = ['월', '화', '수', '목', '금', '토', '일'];
const PAL = ['var(--yellow)', 'var(--cyan)', 'var(--pink)', 'var(--lime)', 'var(--orange)', 'var(--violet)'];
const XP_PER_LEVEL = 500;

const MENU = [
  { id: 'today', emoji: '📅', name: '오늘 루틴' },
  { id: 'archive', emoji: '🗂️', name: '저장소' },
  { id: 'money', emoji: '💰', name: '돈 관리' },
  { id: 'fixed', emoji: '🧾', name: '고정 지출' },
  { id: 'items', emoji: '🎒', name: '내 물건' },
  { id: 'shopping', emoji: '🛒', name: '필요한 물건' },
];

/* ---------- 날짜·계산 ---------- */
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dotDate = k => { const d = parseKey(k); return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
const dowOf = k => `${DAY[parseKey(k).getDay()]}요일`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMin = m => { const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`; };

function rateOf(day) {
  const t = day.todos || [];
  if (t.length) return Math.round((t.filter(x => x.done).length / t.length) * 100);
  return day.rate ?? 0;
}
function monthStats(days, y, m) {
  const prefix = `${y}-${pad(m + 1)}-`;
  const checked = days.filter(d => d.date.startsWith(prefix) && d.checked);
  const tasks = checked.flatMap(d => d.todos || []);
  return {
    count: checked.length,
    rate: checked.length ? Math.round(checked.reduce((s, d) => s + rateOf(d), 0) / checked.length) : null,
    done: tasks.filter(t => t.done).length,
    total: tasks.length,
    xp: checked.reduce((s, d) => s + xpOfDay(d), 0),
  };
}
// 경험치: 끝낸 할 일은 걸린 분만큼(시간이 없으면 30), 결과만 기록된 날은 달성률만큼
const xpOfTask = t => t.minutes || 30;
function xpOfDay(d) {
  if (!d.checked) return 0;
  const t = d.todos || [];
  return t.length ? t.filter(x => x.done).reduce((s, x) => s + xpOfTask(x), 0) : (d.rate ?? 0);
}
function streakOf(days, today) {
  const ok = new Set(days.filter(d => d.checked).map(d => d.date));
  let d = ok.has(keyOf(today)) ? today : addDays(today, -1), n = 0;
  while (ok.has(keyOf(d))) { n++; d = addDays(d, -1); }
  return n;
}

async function loadDays() {
  const res = await fetch('data/days.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  const json = await res.json();
  return (json.days || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ---------- 조각 ---------- */
const ICON = {
  check: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0Q13.9 10.1 24 12 13.9 13.9 12 24 10.1 13.9 0 12 10.1 10.1 12 0Z" fill="currentColor"/></svg>',
};
const starSVG = (cls, style = '') => `<svg class="${cls}" style="${style}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0Q13.9 10.1 24 12 13.9 13.9 12 24 10.1 13.9 0 12 10.1 10.1 12 0Z" fill="currentColor"/></svg>`;

function ringHTML(rate) {
  const r = 36, c = 2 * Math.PI * r;
  return `<div class="ring" role="img" aria-label="달성률 ${rate}%">
    <svg viewBox="0 0 84 84"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe81a"/><stop offset=".6" stop-color="#ff9a2e"/><stop offset="1" stop-color="#ff4fd8"/></linearGradient></defs>
      <circle class="bg" cx="42" cy="42" r="${r}"/>
      <circle class="fg" cx="42" cy="42" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-off="${(c * (1 - rate / 100)).toFixed(2)}"/></svg>
    <b data-count="${rate}" data-suffix="%">0%</b></div>`;
}

function timeBarHTML(todos) {
  const timed = todos.map((t, i) => ({ t, i })).filter(x => x.t.minutes > 0);
  if (!timed.length) return '';
  return `<div class="timebar" role="img" aria-label="시간 배분">${timed.map(({ t, i }, n) =>
    `<i class="${t.done ? 'done' : ''}" style="--c:${PAL[i % PAL.length]}; --i:${n}; flex:${t.minutes}" title="${esc(t.title)} ${fmtMin(t.minutes)}"></i>`).join('')}</div>`;
}

function questsHTML(todos, future, start = 0) {
  return `<ul class="quests">${todos.map((t, i) => `
    <li class="panel quest tilt anim${t.done ? ' done' : ''}${future ? ' future' : ''}" style="--c:${PAL[i % PAL.length]}; --i:${start + i}">
      <span class="q-icon"><span class="emoji" aria-hidden="true">${esc(t.emoji || '📌')}</span></span>
      <span class="q-body">
        <b>${esc(t.title)}</b>
        <span class="q-meta">
          ${t.minutes ? `<span class="q-time">${fmtMin(t.minutes)}</span>` : ''}
          ${t.amount ? `<span class="q-amt">${esc(t.amount)}</span>` : ''}
          <span class="q-xp">+${xpOfTask(t)} XP</span>
        </span>
      </span>
      <span class="q-check" role="img" aria-label="${t.done ? '완료' : future ? '예정' : '미완료'}">${ICON.check}</span>
      ${t.done ? '<span class="stamp">CLEAR</span>' : ''}
    </li>`).join('')}</ul>`;
}

function calHTML(y, m, sel, opts = {}) {
  const map = Object.fromEntries(STATE.days.map(d => [d.date, d]));
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, last = new Date(y, m + 1, 0).getDate();
  let html = WEEK_HEAD.map(w => `<span class="wd">${w}</span>`).join('');
  for (let i = 0; i < lead; i++) html += '<span class="dtile blank"></span>';
  for (let d = 1; d <= last; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`, rec = map[k];
    let cls = 'dtile', style = `--i:${lead + d}`, label = `${m + 1}월 ${d}일`;
    if (rec && rec.checked) {
      const r = rateOf(rec);
      if (r >= 100) cls += ' full'; else { cls += ' part'; style += `; --p:${Math.round(15 + r * .6)}%`; }
      label += ` 달성률 ${r}%`;
    } else if (rec) { cls += ' plan'; label += ' 할 일 있음'; }
    if (k === STATE.todayKey) cls += ' today';
    html += opts.pick
      ? `<button class="${cls}" style="${style}" data-k="${k}" aria-pressed="${k === sel}" aria-label="${label}">${d}</button>`
      : `<span class="${cls}" style="${style}" aria-label="${label}">${d}</span>`;
  }
  return html;
}

const monthNav = (y, m) => `
  <button class="nav-btn" data-shift="-1" aria-label="이전 달">${ICON.prev}</button>
  <b class="disp">${y}.${pad(m + 1)}</b>
  <button class="nav-btn" data-shift="1" aria-label="다음 달">${ICON.next}</button>`;

/* ---------- 상태 ---------- */
const now = new Date();
const STATE = {
  days: [], loaded: false, error: false,
  todayKey: keyOf(now),
  sel: keyOf(now), y: now.getFullYear(), m: now.getMonth(),
  ay: now.getFullYear(), am: now.getMonth(),
};
const REL = { [keyOf(addDays(now, -1))]: '어제', [keyOf(now)]: '오늘', [keyOf(addDays(now, 1))]: '내일' };

/* ---------- 화면들 ---------- */
function dayBlock(day, key, i0) {
  if (!STATE.loaded) return `<div class="panel anim" style="--i:${i0}"><p class="empty">${STATE.error ? '기록을 불러오지 못했어요. 새로고침해 주세요.' : '불러오는 중…'}</p></div>`;
  if (!day) return `<div class="panel anim" style="--i:${i0}"><p class="empty">등록된 할 일이 없어요</p></div>`;
  const todos = day.todos || [];
  const rate = rateOf(day);
  const future = !day.checked && key > STATE.todayKey;
  let out = '';
  if (day.checked && rate >= 100) {
    out += `<div class="panel allclear anim" style="--i:${i0}">
      ${starSVG('s', 'left:12%;top:22%')}${starSVG('s', 'right:14%;top:16%;animation-delay:.6s')}${starSVG('s', 'right:26%;bottom:18%;width:10px;height:10px;animation-delay:1.1s')}
      <b>ALL CLEAR</b>${day.memo ? `<span>${esc(day.memo)}</span>` : ''}</div>`;
  } else if (day.memo) {
    out += `<div class="panel anim" style="--i:${i0}"><p class="empty">${esc(day.memo)}</p></div>`;
  }
  if (todos.length) {
    out += `<div class="anim" style="--i:${i0 + 1}">${timeBarHTML(todos)}</div>`;
    out += questsHTML(todos, future, i0 + 2);
  }
  return out;
}

function heroHTML(day, key, i) {
  const todos = day?.todos || [];
  const done = todos.filter(t => t.done).length;
  const total = todos.reduce((s, t) => s + (t.minutes || 0), 0);
  const parts = [];
  if (todos.length) parts.push(`${todos.length}개 중 ${done}개 완료`);
  if (total) parts.push(`계획 ${fmtMin(total)}`);
  return `<div class="dayhero anim" style="--i:${i}">
    <div class="text">
      <span class="eyebrow">${REL[key] ? `${REL[key]} 할 일` : '할 일'}</span>
      <div class="dh-date"><b class="disp">${dotDate(key)}</b><span>${dowOf(key)}</span></div>
      ${parts.length ? `<span class="dh-sub num">${parts.join(' · ')}</span>` : ''}
    </div>
    ${day && (day.checked || key <= STATE.todayKey) ? ringHTML(rateOf(day)) : ''}
  </div>`;
}

function calHeadHTML() {
  const st = monthStats(STATE.days, STATE.y, STATE.m);
  return `${monthNav(STATE.y, STATE.m)}${st.rate != null ? `<span class="chip num">달성률 ${st.rate}%</span>` : ''}`;
}

function dayAreaHTML() {
  const map = Object.fromEntries(STATE.days.map(d => [d.date, d]));
  const day = map[STATE.sel];
  let html = heroHTML(day, STATE.sel, 0) + dayBlock(day, STATE.sel, 1);
  const tk = keyOf(addDays(parseKey(STATE.sel), 1)), tmr = map[tk];
  if (STATE.sel === STATE.todayKey && tmr && (tmr.todos || []).length) {
    const total = tmr.todos.reduce((s, t) => s + (t.minutes || 0), 0);
    html += `<div class="sec anim" style="--i:4"><h2>내일 할 일</h2><span class="num">${dotDate(tk)} ${dowOf(tk)}${total ? ` · 계획 ${fmtMin(total)}` : ''}</span></div>
      <div class="anim" style="--i:5">${timeBarHTML(tmr.todos)}</div>
      ${questsHTML(tmr.todos, true, 6)}`;
  }
  return html;
}

function viewToday() {
  return `
    <div class="view-title anim" style="--i:0">${ICON.star}<h1>오늘 루틴</h1></div>
    <section class="panel anim" style="--i:1" aria-label="달력">
      <div class="map-head" id="calHead">${calHeadHTML()}</div>
      <div class="mcal" id="cal">${calHTML(STATE.y, STATE.m, STATE.sel, { pick: true })}</div>
    </section>
    <div class="stack" id="dayArea">${dayAreaHTML()}</div>`;
}

function viewArchive() {
  const { ay: y, am: m } = STATE;
  const st = monthStats(STATE.days, y, m);
  const prefix = `${y}-${pad(m + 1)}-`;
  const days = STATE.days.filter(d => d.date.startsWith(prefix)).reverse();
  const stats = [`<span class="chip soft num">기록 ${st.count}일</span>`];
  if (st.total) stats.push(`<span class="chip soft num">할 일 ${st.done}/${st.total}</span>`);
  stats.push(`<span class="chip num">+${st.xp} XP</span>`);

  const logs = !STATE.loaded
    ? `<div class="panel anim" style="--i:3"><p class="empty">${STATE.error ? '기록을 불러오지 못했어요. 새로고침해 주세요.' : '불러오는 중…'}</p></div>`
    : !days.length ? '<div class="panel anim" style="--i:3"><p class="empty">이 달에는 기록이 없어요</p></div>'
    : days.map((d, i) => {
      const todos = d.todos || [], thanks = (d.thanks || []).filter(Boolean);
      const total = todos.reduce((s, t) => s + (t.minutes || 0), 0);
      return `<article class="panel log tilt anim" style="--i:${3 + i}">
        <div class="log-head"><b class="disp">${dotDate(d.date)}</b><span>${dowOf(d.date)}</span>
          ${d.checked ? `<span class="chip num">${rateOf(d)}%</span>` : '<span class="chip soft">예정</span>'}</div>
        ${todos.length ? `<p class="meta num">할 일 ${todos.length}개${total ? ` · 계획 ${fmtMin(total)}` : ''}</p>` : ''}
        ${d.memo ? `<p class="memo">${esc(d.memo)}</p>` : ''}
        ${todos.length ? `<ul class="mini">${todos.map((t, j) => `
          <li class="${t.done ? 'done' : ''}" style="--c:${PAL[j % PAL.length]}">
            <span class="emoji" aria-hidden="true">${esc(t.emoji || '📌')}</span>
            <span class="n">${esc(t.title)}</span>
            <span class="t">${t.minutes ? fmtMin(t.minutes) : esc(t.amount || '')}</span>
            <span class="ck" role="img" aria-label="${t.done ? '완료' : '미완료'}">${ICON.check}</span>
          </li>`).join('')}</ul>` : ''}
        ${thanks.length ? `<div class="thanks"><p>감사한 점</p><ol>${thanks.map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>` : ''}
      </article>`;
    }).join('');

  return `
    <div class="view-title anim" style="--i:0">${ICON.star}<h1>저장소</h1></div>
    <section class="panel season anim" style="--i:1">
      <div class="map-head" style="margin:0">${monthNav(y, m)}</div>
      <div>
        <span class="eyebrow">달성률</span>
        <div class="disp mega" ${st.rate != null ? `data-count="${st.rate}" data-suffix="%"` : ''}>${st.rate != null ? '0%' : '–'}</div>
      </div>
      <div class="stats">${stats.join('')}</div>
      <div class="mcal heat">${calHTML(y, m, null)}</div>
      <div class="legend"><span><i class="l-part"></i>조금</span><span><i class="l-full"></i>전부</span><span><i class="l-plan"></i>예정</span></div>
    </section>
    <div class="sec anim" style="--i:2"><h2>기록</h2></div>
    <div class="log">${logs}</div>`;
}

function viewSoon(item) {
  return `
    <div class="view-title anim" style="--i:0">${ICON.star}<h1>${item.name}</h1></div>
    <section class="panel soon anim" style="--i:1">
      <span class="emoji big" aria-hidden="true">${item.emoji}</span>
      <p class="empty">아직 비어 있어요</p>
    </section>`;
}

/* ---------- 그리기·전환 ---------- */
const $view = document.getElementById('view');
let current = null;

function countUp(root) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count, suf = el.dataset.suffix || '';
    if (reduce) { el.textContent = to + suf; return; }
    const t0 = performance.now(), dur = 1100;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    setTimeout(() => requestAnimationFrame(step), 250);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll('.ring .fg').forEach(c => (c.style.strokeDashoffset = c.dataset.off));
  }));
}

function shiftMonth(n, ky, km) {
  STATE[km] += n;
  if (STATE[km] < 0) { STATE[km] = 11; STATE[ky]--; }
  if (STATE[km] > 11) { STATE[km] = 0; STATE[ky]++; }
}

function bind() {
  if (current === 'archive') {
    $view.querySelectorAll('[data-shift]').forEach(b => (b.onclick = () => { shiftMonth(+b.dataset.shift, 'ay', 'am'); paint(false); }));
    return;
  }
  if (current !== 'today') return;
  const cal = document.getElementById('cal'), head = document.getElementById('calHead'), area = document.getElementById('dayArea');
  const bindCal = () => {
    head.querySelectorAll('[data-shift]').forEach(b => (b.onclick = () => {
      shiftMonth(+b.dataset.shift, 'y', 'm');
      head.innerHTML = calHeadHTML();
      cal.innerHTML = calHTML(STATE.y, STATE.m, STATE.sel, { pick: true });
      bindCal();
    }));
    cal.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => {
      if (STATE.sel === b.dataset.k) return;
      STATE.sel = b.dataset.k;
      cal.querySelectorAll('[data-k]').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === STATE.sel));
      area.innerHTML = dayAreaHTML();
      countUp(area);
    }));
  };
  bindCal();
}

function paint(withLeave) {
  const id = (location.hash.slice(1) || 'today');
  const item = MENU.find(x => x.id === id) || MENU[0];
  const draw = () => {
    $view.classList.remove('leave');
    $view.innerHTML = item.id === 'today' ? viewToday() : item.id === 'archive' ? viewArchive() : viewSoon(item);
    current = item.id;
    document.title = item.id === 'today' ? '일상 매니저' : `${item.name} · 일상 매니저`;
    document.querySelectorAll('.menu nav a').forEach(a => (a.dataset.id === item.id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    bind();
    countUp($view);
  };
  if (withLeave && current && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $view.classList.add('leave');
    setTimeout(() => { draw(); scrollTo({ top: 0 }); }, 220);
  } else draw();
}

function paintHud() {
  const xp = STATE.days.reduce((s, d) => s + xpOfDay(d), 0);
  const lv = Math.floor(xp / XP_PER_LEVEL) + 1, into = xp % XP_PER_LEVEL;
  document.getElementById('lvNum').textContent = lv;
  document.getElementById('lvLabel').textContent = `LV.${lv}`;
  document.getElementById('xpText').textContent = `${into} / ${XP_PER_LEVEL} XP`;
  document.getElementById('streak').textContent = streakOf(STATE.days, now);
  requestAnimationFrame(() => (document.getElementById('xpFill').style.width = `${(into / XP_PER_LEVEL) * 100}%`));
}

/* ---------- 메뉴 ---------- */
function setupMenu() {
  const menu = document.getElementById('menu'), btn = document.getElementById('menuBtn');
  menu.querySelector('nav').innerHTML = MENU.map((x, i) => `
    <a href="#${x.id}" data-id="${x.id}" style="--i:${i}">
      <span class="m-icon"><span class="emoji" aria-hidden="true">${x.emoji}</span></span>${x.name}
      <svg class="m-go" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>`).join('');
  const set = open => {
    if (open) {
      const r = btn.getBoundingClientRect();
      menu.style.setProperty('--ox', `${r.left + r.width / 2}px`);
      menu.style.setProperty('--oy', `${r.top + r.height / 2}px`);
    }
    menu.classList.toggle('open', open);
    menu.inert = !open;
    btn.setAttribute('aria-expanded', open);
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) setTimeout(() => menu.querySelector('[aria-current="page"]')?.focus(), 200);
  };
  btn.onclick = () => set(true);
  menu.querySelector('[data-close]').onclick = () => set(false);
  menu.querySelectorAll('nav a').forEach(a => (a.onclick = () => set(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('open')) set(false); });
}

/* ---------- 시작 ---------- */
setupMenu();
addEventListener('hashchange', () => paint(true));
const firstPaint = setTimeout(() => paint(false), 800);
loadDays()
  .then(d => { STATE.days = d; STATE.loaded = true; paintHud(); })
  .catch(() => { STATE.error = true; })
  .finally(() => { clearTimeout(firstPaint); paint(false); });

const boot = document.getElementById('boot');
if (boot) {
  try { sessionStorage.setItem('booted', '1'); } catch (e) { /* 저장이 막혀 있어도 그냥 넘어간다 */ }
  boot.addEventListener('pointerdown', () => boot.classList.add('skip'));
}
