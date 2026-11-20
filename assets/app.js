// 모든 화면이 같이 쓰는 메뉴, 날짜·지표 계산, 할 일 그리기 도구
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

const MENU = [
  { id: 'today', href: './', emoji: '📅', name: '오늘 루틴' },
  { id: 'archive', href: 'archive.html', emoji: '🗂️', name: '저장소' },
  { id: 'money', href: 'money.html', emoji: '💰', name: '돈 관리' },
  { id: 'fixed', href: 'fixed.html', emoji: '🧾', name: '고정 지출' },
  { id: 'items', href: 'items.html', emoji: '🎒', name: '내 물건' },
  { id: 'shopping', href: 'shopping.html', emoji: '🛒', name: '필요한 물건' },
];

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayLabel = k => { const d = parseKey(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY_NAMES[d.getDay()]}요일`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMin = m => {
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`;
};

// 하루 달성률: 할 일 목록이 있으면 완료 비율, 없으면 기록된 rate
function rateOf(day) {
  const t = day.todos || [];
  if (t.length) return Math.round((t.filter(x => x.done).length / t.length) * 100);
  return day.rate ?? 0;
}

// 한 달 지표: 체크가 끝난 날만 센다. 달성률은 하루 달성률의 평균
function monthStats(days, y, m) {
  const prefix = `${y}-${pad(m + 1)}-`;
  const checked = days.filter(d => d.date.startsWith(prefix) && d.checked);
  const tasks = checked.flatMap(d => d.todos || []);
  return {
    count: checked.length,
    rate: checked.length ? Math.round(checked.reduce((s, d) => s + rateOf(d), 0) / checked.length) : null,
    done: tasks.filter(t => t.done).length,
    total: tasks.length,
  };
}

async function loadDays() {
  const res = await fetch('data/days.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  const json = await res.json();
  return (json.days || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ---------- 그리기 ---------- */
const ICON = {
  menu: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// 상단 바(3줄 메뉴 + 화면 이름)와 왼쪽에서 나오는 메뉴
function mountTopbar(current) {
  const page = MENU.find(m => m.id === current);
  const bar = document.createElement('header');
  bar.className = 'topbar';
  bar.innerHTML = `<div class="topbar-in">
      <button class="icon-btn" id="menuOpen" aria-label="메뉴 열기" aria-controls="drawer" aria-expanded="false">${ICON.menu}</button>
      <span class="topbar-title">${page ? page.name : ''}</span>
    </div>`;
  document.body.prepend(bar);

  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.id = 'drawer';
  drawer.inert = true;
  drawer.innerHTML = `<div class="scrim" data-close></div>
    <nav class="sheet" aria-label="메뉴">
      <div class="sheet-head">
        <span class="sheet-brand">일상 매니저</span>
        <button class="icon-btn" data-close aria-label="메뉴 닫기">${ICON.close}</button>
      </div>
      <ul>${MENU.map(m => `
        <li><a href="${m.href}"${m.id === current ? ' aria-current="page"' : ''}>
          <span class="tile"><span class="emoji" aria-hidden="true">${m.emoji}</span></span>${m.name}
        </a></li>`).join('')}
      </ul>
    </nav>`;
  document.body.append(drawer);

  const btn = bar.querySelector('#menuOpen');
  const setOpen = open => {
    drawer.classList.toggle('open', open);
    drawer.inert = !open;
    btn.setAttribute('aria-expanded', open);
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) drawer.querySelector('[aria-current], a')?.focus();
    else btn.focus();
  };
  btn.onclick = () => setOpen(true);
  drawer.querySelectorAll('[data-close]').forEach(n => (n.onclick = () => setOpen(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')) setOpen(false); });
}

function ringHTML(rate) {
  const r = 28, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, rate)) / 100);
  return `<div class="ring" role="img" aria-label="달성률 ${rate}%">
    <svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="${r}"/><circle class="fg" cx="32" cy="32" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/></svg>
    <b class="num">${rate}%</b></div>`;
}

// 할 일마다 색을 하나씩: 타일과 시간 막대가 같은 색을 쓴다
const hue = i => `--c: var(--c${i % 6}); --t: var(--t${i % 6})`;

function timeBarHTML(todos) {
  const timed = todos.map((t, i) => ({ t, i })).filter(x => x.t.minutes > 0);
  if (!timed.length) return '';
  return `<div class="timebar" role="img" aria-label="시간 배분">${timed.map(({ t, i }) =>
    `<i class="${t.done ? 'is-done' : ''}" style="${hue(i)}; flex: ${t.minutes}" title="${esc(t.title)} ${fmtMin(t.minutes)}"></i>`).join('')}</div>`;
}

function tasksHTML(todos) {
  return `<ul class="tasks">${todos.map((t, i) => `
    <li class="task${t.done ? ' is-done' : ''}" style="${hue(i)}">
      <span class="tile"><span class="emoji" aria-hidden="true">${esc(t.emoji || '📌')}</span></span>
      <span class="name"><b>${esc(t.title)}</b>${t.amount ? `<span>${esc(t.amount)}</span>` : ''}</span>
      ${t.minutes ? `<span class="time num">${fmtMin(t.minutes)}</span>` : '<span></span>'}
      <span class="check" role="img" aria-label="${t.done ? '완료' : '미완료'}">${ICON.check}</span>
    </li>`).join('')}</ul>`;
}

// 하루 카드: 달성률 링 + 개수·계획 시간 + 시간 막대 + 목록
function dayCardHTML(day) {
  if (!day) return '<p class="empty">등록된 할 일이 없어요</p>';
  const todos = day.todos || [];
  const rate = rateOf(day);
  if (!todos.length) {
    return `<div class="summary">${ringHTML(rate)}<div><div class="big">${esc(day.memo || `${rate}% 달성`)}</div></div></div>`;
  }
  const done = todos.filter(t => t.done).length;
  const total = todos.reduce((s, t) => s + (t.minutes || 0), 0);
  const doneMin = todos.reduce((s, t) => s + (t.done ? t.minutes || 0 : 0), 0);
  const sub = [total ? `계획 ${fmtMin(total)}` : '', doneMin ? `${fmtMin(doneMin)} 해냄` : '', day.checked ? '체크 완료' : ''].filter(Boolean).join(' · ');
  return `<div class="summary">${ringHTML(rate)}<div><div class="big num">${todos.length}개 중 ${done}개 완료</div>${sub ? `<div class="sub num">${sub}</div>` : ''}</div></div>
    ${timeBarHTML(todos)}${tasksHTML(todos)}`;
}
