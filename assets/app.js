// 두 화면이 같이 쓰는 날짜·지표 계산과 그리기 도구
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayLabel = k => { const d = parseKey(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY_NAMES[d.getDay()]}요일`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function ringHTML(rate) {
  const r = 28, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, rate)) / 100);
  return `<div class="ring" role="img" aria-label="달성률 ${rate}%">
    <svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="${r}"/><circle class="fg" cx="32" cy="32" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/></svg>
    <b class="num">${rate}%</b></div>`;
}

function tasksHTML(todos) {
  return `<ul class="tasks">${todos.map(t => `
    <li class="task${t.done ? ' is-done' : ''}">
      <span class="tile"><span class="emoji" aria-hidden="true">${esc(t.emoji || '📌')}</span></span>
      <span class="name"><b>${esc(t.title)}</b>${t.amount ? `<span>${esc(t.amount)}</span>` : ''}</span>
      <span class="check" role="img" aria-label="${t.done ? '완료' : '미완료'}">${CHECK_SVG}</span>
    </li>`).join('')}</ul>`;
}
