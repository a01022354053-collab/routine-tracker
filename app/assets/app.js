// 일상 매니저 — Claude 아티팩트로 여는 한 화면 앱.
// 기록은 아티팩트 저장소(db)에 두고, 체크·감사한 점·운동·잔액은 화면에서 바로 고친다.
// 매니저 대화는 sample 기능으로 Claude를 불러, 아래 도구로만 기록을 바꾼다.

/* ---------- 고정 값 ---------- */
const DAY = ['일', '월', '화', '수', '목', '금', '토'];
const WEEK_HEAD = ['월', '화', '수', '목', '금', '토', '일'];
const PAL = ['var(--yellow)', 'var(--cyan)', 'var(--pink)', 'var(--lime)', 'var(--orange)', 'var(--violet)'];
const XP_PER_LEVEL = 500;
const PARTS = ['등', '가슴', '하체', '휴식'];
// 요일(0=일)별 운동 부위: 금 등, 토 가슴, 일 하체, 월 등, 화 가슴, 수 하체, 목 휴식
const DEFAULT_SPLIT = { 0: '하체', 1: '등', 2: '가슴', 3: '하체', 4: '휴식', 5: '등', 6: '가슴' };
const BANKS = [
  { id: 'nh', name: '농협', short: '농', color: '#01a54e', logo: 'private/bank-nh.png' },
  { id: 'kakao', name: '카카오뱅크', short: '카', color: '#ffe300', logo: 'private/bank-kakao.png' },
  { id: 'shinhan', name: '신한', short: '신', color: '#0046ff', logo: 'private/bank-shinhan.png' },
];
// 은행 아이콘: 로고 사진을 동그랗게 (사진이 없으면 첫 글자)
const bankLogo = b => (b.logo ? `<img src="${b.logo}" alt="" draggable="false">` : b.short);
const DEFAULT_MONEY = { payday: 10, savings: 550000, spend: 650000, balances: { nh: null, kakao: null, shinhan: null } };
// 통장마다 하는 일: 농협은 월급, 신한은 나라사랑카드, 카카오뱅크는 따로 모으는 돈. 쓸 수 있는 돈 = 농협 + 신한
const ACCT_ROLE = { nh: '월급 통장', shinhan: '나라사랑 통장 · 카드', kakao: '따로 모으는 돈' };
const USABLE = ['nh', 'shinhan'];
// 군적금(장병내일준비적금): 매달 월급날에 자동 입금, 만기 때 넣은 돈만큼 정부가 더 준다(100% 매칭, 이자 별도)
const DEFAULT_SAVINGS = { payday: 10, lastMonth: null, match: 1, accounts: [] };
const DEFAULT_STOCKS = { holdings: [] };

const MENU = [
  { id: 'today', emoji: '📅', name: '오늘 루틴' },
  { id: 'archive', emoji: '🗂️', name: '저장소' },
  { id: 'chat', emoji: '💬', name: '매니저와 대화' },
  { id: 'money', emoji: '💰', name: '돈 관리' },
  { id: 'fixed', emoji: '🧾', name: '고정 지출' },
  { id: 'items', emoji: '🎒', name: '내 물건' },
  { id: 'shopping', emoji: '🛒', name: '필요한 물건' },
];

/* ---------- 작은 도구 ---------- */
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const shiftKey = (k, n) => keyOf(addDays(parseKey(k), n));
const dotDate = k => { const d = parseKey(k); return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
const dowOf = k => `${DAY[parseKey(k).getDay()]}요일`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMin = m => { const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}시간 ${r}분` : h ? `${h}시간` : `${r}분`; };
const won = n => `${Math.round(n).toLocaleString('ko-KR')}원`;
const manwon = n => (n % 10000 === 0 ? `${(n / 10000).toLocaleString('ko-KR')}만원` : won(n));
const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
// 키 순서와 상관없이 같은 내용인지 비교한다 (내가 방금 쓴 값이 돌아올 때 다시 그리지 않으려고)
const stable = v => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : JSON.stringify(v ?? null));
const same = (a, b) => stable(a) === stable(b);

/* ---------- 상태 ---------- */
let NOW = new Date();
let TODAY = keyOf(NOW);
// 모든 기록은 지우지 않는다: 할 일은 removed로 숨기고, 대화·변경·지출·잔액은 날짜/달마다 쌓는다
const S = {
  days: {}, workout: {}, split: { ...DEFAULT_SPLIT }, money: clone(DEFAULT_MONEY),
  chatDays: {},   // 날짜 → 그날 대화
  logDays: {},    // 날짜 → 그날 바꾼 것들
  spend: {},      // 'YYYY-MM' → 지출 목록
  balhist: {},    // 'YYYY-MM' → 잔액 기록
  savings: clone(DEFAULT_SAVINGS),   // 군적금
  transfers: {},  // 'YYYY-MM' → 통장끼리 옮긴 기록
  items: { list: [] },     // 내 물건(자주 쓰는 것)
  shopping: { list: [] },  // 필요한 물건(살 것)
  stocks: clone(DEFAULT_STOCKS),     // 주식
};
const UI = {
  status: 'loading', // loading | ok | slow | nodb
  sel: TODAY, y: NOW.getFullYear(), m: NOW.getMonth(), ay: NOW.getFullYear(), am: NOW.getMonth(),
  my: NOW.getFullYear(), mm: NOW.getMonth(), extras: {},
  view: null, dataPainted: false, still: false,
  pending: null, ctl: null, undo: {}, sample: undefined,
};
let DB = null, SAMPLE = null;

/* ---------- 계산 ---------- */
const rawTodos = date => S.days[date]?.todos || [];               // 숨긴 것까지 (저장할 때)
const todosOf = date => rawTodos(date).filter(t => !t.removed);   // 화면에 보이는 것
const monthKey = (y, m) => `${y}-${pad(m + 1)}`;
const spendOf = mk => (S.spend[mk]?.items || []).filter(x => !x.removed);
const spentIn = mk => spendOf(mk).filter(x => x.type !== 'in').reduce((s, x) => s + (Number(x.amount) || 0), 0);
const incomeIn = mk => spendOf(mk).filter(x => x.type === 'in').reduce((s, x) => s + (Number(x.amount) || 0), 0);
const allChat = () => Object.keys(S.chatDays).sort().flatMap(d => S.chatDays[d]?.messages || []);
const xpOfTask = t => t.minutes || 30;
const isFailed = (t, date) => t.kind === 'thanks' && !t.done && date < TODAY;
const partOf = date => S.workout[date]?.part || S.split[parseKey(date).getDay()] || '휴식';
function rateOf(date) {
  const t = todosOf(date);
  return t.length ? Math.round((t.filter(x => x.done).length / t.length) * 100) : null;
}
// 오늘까지의 날짜만 센다: 달성률은 하루 달성률의 평균
function monthStats(y, m) {
  const prefix = `${y}-${pad(m + 1)}-`;
  const dates = Object.keys(S.days).filter(d => d.startsWith(prefix) && d <= TODAY && todosOf(d).length);
  const tasks = dates.flatMap(todosOf);
  return {
    count: dates.length,
    rate: dates.length ? Math.round(dates.reduce((s, d) => s + rateOf(d), 0) / dates.length) : null,
    done: tasks.filter(t => t.done).length,
    total: tasks.length,
    xp: tasks.filter(t => t.done).reduce((s, t) => s + xpOfTask(t), 0),
  };
}
function totalXp() {
  return Object.keys(S.days).filter(d => d <= TODAY).flatMap(todosOf).filter(t => t.done).reduce((s, t) => s + xpOfTask(t), 0);
}
function streak() {
  let d = rateOf(TODAY) === 100 ? TODAY : shiftKey(TODAY, -1), n = 0;
  while (rateOf(d) === 100) { n++; d = shiftKey(d, -1); }
  return n;
}
function untilMidnight() {
  const end = addDays(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()), 1);
  const mins = Math.max(0, Math.ceil((end - NOW) / 60000));
  return fmtMin(mins);
}

/* ---------- 저장소 연결 ---------- */
const chains = {};
function queue(path, fn) {
  const p = (chains[path] || Promise.resolve()).then(fn);
  chains[path] = p.catch(() => {});
  return p;
}
function saveFail() { toast('저장하지 못했어요. 잠시 후 다시 해 주세요.'); }

async function putDay(date, todos) {
  if (!DB) { toast('기록을 저장할 수 없는 화면이에요'); throw new Error('저장소에 연결되지 않았어요'); }
  if (todos === null) todos = [];
  S.days[date] = { date, todos };
  refresh();
  return queue(`days/${date}`, () => DB.doc(`days/${date}`).set({ date, todos }));
}
async function putWorkout(date, data) {
  if (!DB) throw new Error('저장소에 연결되지 않았어요');
  if (data === null) data = { part: '', plan: '' };
  S.workout[date] = { date, ...data };
  refresh();
  return queue(`workout/${date}`, () => DB.doc(`workout/${date}`).set({ date, ...data }));
}
async function putSplit(split) {
  if (!DB) throw new Error('저장소에 연결되지 않았어요');
  S.split = { ...split };
  refresh();
  return queue('settings/main', () => DB.doc('settings/main').set({ split }));
}
async function putMoney(money) {
  if (!DB) throw new Error('저장소에 연결되지 않았어요');
  S.money = clone(money);
  refresh();
  return queue('money/main', () => DB.doc('money/main').set(money));
}
// 대화는 날짜마다 한 문서에 계속 쌓는다(지우지 않음)
async function addChat(messages) {
  const day = TODAY;
  const list = [...(S.chatDays[day]?.messages || []), ...messages];
  S.chatDays[day] = { date: day, messages: list };
  if (!DB) return;
  return queue(`chatlog/${day}`, () => DB.doc(`chatlog/${day}`).set({ date: day, messages: S.chatDays[day].messages })).catch(saveFail);
}

// 바꾼 것은 모두 그날의 변경 기록에 한 줄씩 남긴다
function logAct(text) {
  if (!DB || !text) return;
  const day = keyOf(new Date());
  const entries = [...(S.logDays[day]?.entries || []), { at: new Date().toISOString(), text: String(text).slice(0, 600) }];
  S.logDays[day] = { date: day, entries };
  queue(`log/${day}`, () => DB.doc(`log/${day}`).set({ date: day, entries: S.logDays[day].entries })).catch(() => {});
}

// 지출: 달마다 한 문서
async function putSpend(mk, items) {
  if (!DB) throw new Error('저장소에 연결되지 않았어요');
  S.spend[mk] = { month: mk, items };
  refresh();
  return queue(`spend/${mk}`, () => DB.doc(`spend/${mk}`).set({ month: mk, items }));
}
async function putSavings(v) {
  if (!DB) throw new Error('저장소에 연결되지 않았어요');
  S.savings = clone(v);
  refresh();
  return queue('savings/main', () => DB.doc('savings/main').set(v));
}
async function putTransfers(mk, items) {
  if (!DB) throw new Error('저장소에 연결되지 않았어요');
  S.transfers[mk] = { month: mk, items };
  refresh();
  return queue(`transfers/${mk}`, () => DB.doc(`transfers/${mk}`).set({ month: mk, items }));
}
const transfersOf = mk => (S.transfers[mk]?.items || []).filter(x => !x.removed);
// 계좌 이체: 실제로 옮긴 만큼 숫자만 옮긴다(소비나 수입으로 세지 않음)
async function doTransfer(from, to, amount, memo) {
  const money = clone(S.money), now = new Date().toISOString();
  money.balances[from] = (Number(money.balances[from]) || 0) - amount;
  money.balances[to] = (Number(money.balances[to]) || 0) + amount;
  money.balanceAt = { ...(money.balanceAt || {}), [from]: now, [to]: now };
  await putMoney(money);
  addBalHist(from, money.balances[from]);
  addBalHist(to, money.balances[to]);
  const mk = TODAY.slice(0, 7);
  const item = { id: newId(), date: TODAY, at: now, from, to, amount };
  if (memo) item.memo = memo;
  await putTransfers(mk, [...clone(S.transfers[mk]?.items || []), item]);
  logAct(`이체 · ${bankName(from)} → ${bankName(to)} ${won(amount)}${memo ? ` (${memo})` : ''}`);
  return item;
}
async function cancelTransfer(mk, id) {
  const items = clone(S.transfers[mk]?.items || []), x = items.find(i => i.id === id);
  if (!x || x.removed) return;
  const money = clone(S.money), now = new Date().toISOString();
  money.balances[x.from] = (Number(money.balances[x.from]) || 0) + x.amount;
  money.balances[x.to] = (Number(money.balances[x.to]) || 0) - x.amount;
  money.balanceAt = { ...(money.balanceAt || {}), [x.from]: now, [x.to]: now };
  await putMoney(money);
  addBalHist(x.from, money.balances[x.from]);
  addBalHist(x.to, money.balances[x.to]);
  Object.assign(x, { removed: true, removedAt: now });
  await putTransfers(mk, items);
  logAct(`이체 취소 · ${bankName(x.from)} → ${bankName(x.to)} ${won(x.amount)} (${dotDate(x.date)})`);
}

async function putItems(v) {
  if (!DB) throw new Error('저장소에 연결되지 않았어요');
  S.items = clone(v); refresh();
  return queue('items/main', () => DB.doc('items/main').set(v));
}
async function putShopping(v) {
  if (!DB) throw new Error('저장소에 연결되지 않았어요');
  S.shopping = clone(v); refresh();
  return queue('shopping/main', () => DB.doc('shopping/main').set(v));
}
const itemsOf = () => (S.items.list || []).filter(x => !x.removed);
const shopOf = () => (S.shopping.list || []).filter(x => !x.removed);

async function putStocks(v) {
  if (!DB) throw new Error('저장소에 연결되지 않았어요');
  S.stocks = clone(v);
  refresh();
  return queue('stocks/main', () => DB.doc('stocks/main').set(v));
}

/* ---------- 군적금 계산 ---------- */
const monthAdd = (mk, n) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return monthKey(d.getFullYear(), d.getMonth()); };
const monthsBetween = (a, b) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + (bm - am); };
const savBalance = a => (a.initial || 0) + (a.deposits || []).reduce((s, d) => s + (d.amount || 0), 0);
// 기준일 다음부터, 월급날이 지났고 만기 전인데 아직 안 넣은 달들
function dueMonths(a, sv) {
  const as = parseKey(a.asOf || TODAY);
  let mk = monthKey(as.getFullYear(), as.getMonth());
  if (as.getDate() >= sv.payday) mk = monthAdd(mk, 1);
  const have = new Set((a.deposits || []).map(d => d.month)), out = [];
  for (let i = 0; i < 40; i++, mk = monthAdd(mk, 1)) {
    if (sv.lastMonth && mk > sv.lastMonth) break;
    if (`${mk}-${pad(sv.payday)}` > TODAY) break;
    if (!have.has(mk)) out.push(mk);
  }
  return out;
}
// 매달 월급날이 지나면 정해진 금액을 저절로 넣고 기록을 남긴다(같은 달은 한 번만)
let depositing = false;
async function autoDeposit() {
  if (!DB || depositing || !(S.savings.accounts || []).length) return;
  const sv = clone(S.savings), added = [];
  for (const a of sv.accounts) {
    for (const mk of dueMonths(a, sv)) {
      a.deposits = [...(a.deposits || []), { month: mk, date: `${mk}-${pad(sv.payday)}`, amount: a.monthly, auto: true, at: new Date().toISOString() }];
      added.push(`${Number(mk.slice(5))}월 ${a.short} ${won(a.monthly)}`);
    }
  }
  if (!added.length) return;
  depositing = true;
  try { await putSavings(sv); logAct(`군적금 자동 입금 · ${added.join(', ')}`); } catch (e) { /* 다음에 다시 */ }
  depositing = false;
}
function savPlan() {
  const sv = S.savings;
  const curMk = TODAY.slice(0, 7);
  const nextFromToday = parseKey(TODAY).getDate() < sv.payday ? curMk : monthAdd(curMk, 1);
  const accts = (sv.accounts || []).map(a => {
    const bal = savBalance(a);
    const as = parseKey(a.asOf || TODAY);
    let afterBase = monthKey(as.getFullYear(), as.getMonth());
    if (as.getDate() >= sv.payday) afterBase = monthAdd(afterBase, 1);
    const next = nextFromToday > afterBase ? nextFromToday : afterBase;
    const rem = sv.lastMonth ? Math.max(0, monthsBetween(next, sv.lastMonth) + 1) : 0;
    const end = bal + rem * (a.monthly || 0);
    return { ...a, bal, rem, end, payout: Math.round(end * (1 + (sv.match ?? 1))) };
  });
  const sum = k => accts.reduce((s, a) => s + a[k], 0);
  const monthly = accts.reduce((s, a) => s + (a.monthly || 0), 0);
  const nextDate = `${nextFromToday}-${pad(sv.payday)}`;
  return { accts, bal: sum('bal'), end: sum('end'), payout: sum('payout'), monthly, rem: Math.max(0, ...accts.map(a => a.rem)), nextDate };
}
function stockSum() {
  const hs = (S.stocks.holdings || []).filter(h => !h.removed);
  const rows = hs.map(h => {
    const cost = h.qty * h.avg, value = h.price != null ? h.qty * h.price : null;
    return { ...h, cost, value, pnl: value != null ? value - cost : null, rate: value != null && cost ? ((value - cost) / cost) * 100 : null,
      perShare: h.price != null ? h.price - h.avg : null, dayChange: h.quote?.change ?? null, dayRate: h.quote?.rate ?? null };
  });
  const priced = rows.filter(r => r.value != null);
  return { rows, cost: rows.reduce((s, r) => s + r.cost, 0), value: priced.length ? priced.reduce((s, r) => s + r.value, 0) : null,
    pnl: priced.length ? priced.reduce((s, r) => s + r.pnl, 0) : null, allPriced: priced.length === rows.length };
}

// 잔액이 바뀔 때마다 그 달 잔액 기록에 남긴다
function addBalHist(bankId, amount) {
  if (!DB) return;
  const mk = monthKey(new Date().getFullYear(), new Date().getMonth());
  const items = [...(S.balhist[mk]?.items || []), { at: new Date().toISOString(), bank: bankId, amount }];
  S.balhist[mk] = { month: mk, items };
  queue(`balhist/${mk}`, () => DB.doc(`balhist/${mk}`).set({ month: mk, items })).catch(() => {});
}
async function setBalance(bankId, amount) {
  const money = clone(S.money);
  money.balances[bankId] = amount;
  money.balanceAt = { ...(money.balanceAt || {}), [bankId]: new Date().toISOString() };
  await putMoney(money);
  addBalHist(bankId, amount);
  const b = BANKS.find(x => x.id === bankId);
  logAct(`${b.name} 잔액 ${amount == null ? '지움' : won(amount)}`);
}

async function connect() {
  const c = window.claude;
  const [db, sample] = await Promise.all([
    c?.use ? c.use('db').catch(() => null) : null,
    c?.use ? c.use('sample').catch(() => null) : null,
  ]);
  SAMPLE = sample;
  UI.sample = !!sample;
  // 사진을 보낼 수 있는 화면이면 캡처로 넣기 버튼을 켠다
  sample?.limits?.().then(l => {
    UI.imgOK = !!l?.images;
    document.getElementById('chatAttach').hidden = !UI.imgOK;
    if (UI.imgOK && l.images.mediaTypes) $file.accept = l.images.mediaTypes.join(',');
    if (UI.view === 'money') refresh();
  }).catch(() => {});
  if (!db) { UI.status = 'nodb'; refresh(true); return; }
  DB = db;
  const slow = setTimeout(() => { if (UI.status === 'loading') { UI.status = 'slow'; refresh(true); } }, 10000);
  const onErr = () => { clearTimeout(slow); if (UI.status !== 'ok') { UI.status = 'slow'; refresh(true); } };
  DB.collection('days').onSnapshot(snap => {
    const o = {};
    snap.docs.forEach(d => { o[d.id] = d.data(); });
    const wasReady = UI.status === 'ok';
    if (!snap.metadata.fromCache) clearTimeout(slow);
    UI.status = 'ok';
    if (wasReady && same(o, S.days)) return;
    S.days = o;
    refresh();
  }, onErr);
  DB.collection('workout').onSnapshot(snap => {
    const o = {};
    snap.docs.forEach(d => { o[d.id] = d.data(); });
    if (same(o, S.workout)) return;
    S.workout = o;
    refresh();
  }, () => {});
  DB.doc('settings/main').onSnapshot(d => {
    const split = { ...DEFAULT_SPLIT, ...(d.data()?.split || {}) };
    if (same(split, S.split)) return;
    S.split = split;
    refresh();
  }, () => {});
  DB.doc('money/main').onSnapshot(d => {
    const v = d.data() || {};
    const money = { ...clone(DEFAULT_MONEY), ...v, balances: { ...DEFAULT_MONEY.balances, ...(v.balances || {}) } };
    if (same(money, S.money)) return;
    S.money = money;
    refresh();
  }, () => {});
  // 대화와 변경 기록은 이번 달 것만 계속 받고, 지난 달 것은 저장소에서 열 때 불러온다
  const monthStart = `${monthKey(NOW.getFullYear(), NOW.getMonth())}-01`;
  const recentStart = shiftKey(TODAY, -7) < monthStart ? shiftKey(TODAY, -7) : monthStart;
  DB.collection('chatlog').where('date', '>=', recentStart).onSnapshot(snap => {
    const o = { ...S.chatDays };
    snap.docs.forEach(d => { o[d.id] = d.data(); });
    if (same(o, S.chatDays)) return;
    S.chatDays = o;
    if (!UI.pending && $mgr.classList.contains('open')) paintChat();
  }, () => {});
  DB.collection('log').where('date', '>=', recentStart).onSnapshot(snap => {
    const o = { ...S.logDays };
    snap.docs.forEach(d => { o[d.id] = d.data(); });
    if (same(o, S.logDays)) return;
    S.logDays = o;
    if (UI.view === 'archive') refresh();
  }, () => {});
  DB.collection('spend').onSnapshot(snap => {
    const o = {};
    snap.docs.forEach(d => { o[d.id] = d.data(); });
    if (same(o, S.spend)) return;
    S.spend = o;
    refresh();
  }, () => {});
  DB.doc('savings/main').onSnapshot(d => {
    const v = { ...clone(DEFAULT_SAVINGS), ...(d.data() || {}) };
    if (!same(v, S.savings)) { S.savings = v; refresh(); }
    autoDeposit();
  }, () => {});
  DB.doc('stocks/main').onSnapshot(d => {
    const v = { ...clone(DEFAULT_STOCKS), ...(d.data() || {}) };
    if (same(v, S.stocks)) return;
    S.stocks = v;
    refresh();
  }, () => {});
  DB.doc('items/main').onSnapshot(d => {
    const v = { list: [], ...(d.data() || {}) };
    if (same(v, S.items)) return;
    S.items = v;
    refresh();
  }, () => {});
  DB.doc('shopping/main').onSnapshot(d => {
    const v = { list: [], ...(d.data() || {}) };
    if (same(v, S.shopping)) return;
    S.shopping = v;
    refresh();
  }, () => {});
  DB.collection('transfers').onSnapshot(snap => {
    const o = {};
    snap.docs.forEach(d => { o[d.id] = d.data(); });
    if (same(o, S.transfers)) return;
    S.transfers = o;
    refresh();
  }, () => {});
  DB.collection('balhist').onSnapshot(snap => {
    const o = {};
    snap.docs.forEach(d => { o[d.id] = d.data(); });
    if (same(o, S.balhist)) return;
    S.balhist = o;
    refresh();
  }, () => {});
  migrateOldChat();
  if ($mgr.classList.contains('open')) paintChat();
}

// 예전 한 문서짜리 대화(chat/log)를 날짜별 대화 기록으로 옮긴다. 예전 문서는 그대로 둔다
async function migrateOldChat() {
  try {
    const old = await DB.doc('chat/log').get();
    const v = old.exists ? old.data() : null;
    if (!v || v.migrated || !(v.messages || []).length) return;
    const byDay = {};
    for (const m of v.messages) {
      const d = keyOf(new Date(String(m.at || '').replace(/u$/, '') || Date.now()));
      (byDay[d] = byDay[d] || []).push(m);
    }
    for (const [d, msgs] of Object.entries(byDay)) {
      const cur = (await DB.doc(`chatlog/${d}`).get()).data()?.messages || [];
      const have = new Set(cur.map(m => m.at));
      const key = m => [Date.parse(String(m.at || '').replace(/u$/, '')) || 0, m.role === 'user' ? 0 : 1];
      const merged = [...msgs.filter(m => !have.has(m.at)), ...cur].sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1]; });
      await queue(`chatlog/${d}`, () => DB.doc(`chatlog/${d}`).set({ date: d, messages: merged }));
    }
    await DB.doc('chat/log').set({ ...v, migrated: true });
  } catch (e) { /* 다음에 열 때 다시 시도한다 */ }
}

// 지난 달 대화·변경 기록은 저장소에서 그 달을 열 때 한 번 읽는다
async function loadMonthExtras(y, m) {
  const mk = monthKey(y, m);
  if (!DB || UI.extras[mk]) return;
  UI.extras[mk] = { loading: true, chat: {}, log: {} };
  const from = `${mk}-01`, to = `${mk}-31`;
  try {
    const [c, l] = await Promise.all([
      DB.collection('chatlog').where('date', '>=', from).where('date', '<=', to).get(),
      DB.collection('log').where('date', '>=', from).where('date', '<=', to).get(),
    ]);
    const chat = {}, log = {};
    c.docs.forEach(d => { chat[d.id] = d.data(); });
    l.docs.forEach(d => { log[d.id] = d.data(); });
    UI.extras[mk] = { chat, log };
  } catch (e) { UI.extras[mk] = { error: true, chat: {}, log: {} }; }
  if (UI.view === 'archive') refresh();
}

/* ---------- 조각 ---------- */
const ICON = {
  check: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg class="spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0Q13.9 10.1 24 12 13.9 13.9 12 24 10.1 13.9 0 12 10.1 10.1 12 0Z" fill="currentColor"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  starPlain: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0Q13.9 10.1 24 12 13.9 13.9 12 24 10.1 13.9 0 12 10.1 10.1 12 0Z" fill="currentColor"/></svg>',
};
const starSVG = (cls, style = '') => `<svg class="${cls}" style="${style}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0Q13.9 10.1 24 12 13.9 13.9 12 24 10.1 13.9 0 12 10.1 10.1 12 0Z" fill="currentColor"/></svg>`;
const wonAttr = n => (UI.still ? `>${won(n)}` : ` data-count="${n}" data-suffix="원" data-fmt="won">0원`);
const countAttr = (n, suf = '') => (UI.still ? `>${n}${suf}` : ` data-count="${n}" data-suffix="${suf}">0${suf}`);

function ringHTML(rate) {
  const r = 36, c = 2 * Math.PI * r, off = (c * (1 - rate / 100)).toFixed(2);
  return `<div class="ring" role="img" aria-label="달성률 ${rate}%">
    <svg viewBox="0 0 84 84"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe81a"/><stop offset=".6" stop-color="#ff9a2e"/><stop offset="1" stop-color="#ff4fd8"/></linearGradient></defs>
      <circle class="bg" cx="42" cy="42" r="${r}"/>
      <circle class="fg" cx="42" cy="42" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${UI.still ? off : c.toFixed(2)}" data-off="${off}"/></svg>
    <b${countAttr(rate, '%')}</b></div>`;
}

function timeBarHTML(todos) {
  const timed = todos.map((t, i) => ({ t, i })).filter(x => x.t.minutes > 0);
  if (!timed.length) return '';
  return `<div class="timebar" role="img" aria-label="시간 배분">${timed.map(({ t, i }, n) =>
    `<i class="${t.done ? 'done' : ''}" style="--c:${PAL[i % PAL.length]}; --i:${n}; flex:${t.minutes}" title="${esc(t.title)} ${fmtMin(t.minutes)}"></i>`).join('')}</div>`;
}

function cardHTML(t, i, date, n) {
  const failed = isFailed(t, date), future = date > TODAY;
  const cls = ['panel', 'qcard', 'tilt', 'anim', t.done && 'done', failed && 'failed', future && 'future'].filter(Boolean).join(' ');
  const meta = [];
  if (t.minutes) meta.push(`<span class="q-time">${fmtMin(t.minutes)}</span>`);
  if (t.amount) meta.push(`<span class="q-amt">${esc(t.amount)}</span>`);
  if (t.kind === 'workout') meta.push(`<span class="q-tag">${esc(partOf(date))}</span>`);
  if (t.kind === 'thanks' && !t.done && !failed && date === TODAY) {
    meta.push(`<span class="q-due">${(t.items || []).filter(Boolean).length}/3 · 자정까지</span>`);
  }
  const note = t.kind === 'dev' ? t.note : t.kind === 'workout' ? S.workout[date]?.plan : '';
  if (note) meta.push(`<span class="q-note">${esc(note)}</span>`);
  const lockCheck = future || failed || t.kind === 'thanks';
  const editing = UI.edit === date;
  return `<li class="${cls}${editing ? ' editing' : ''}" style="--c:${PAL[i % PAL.length]}; --i:${n}" data-date="${date}" data-id="${esc(t.id)}" tabindex="0">
    <div class="qc-top">
      <span class="q-icon"><span class="emoji" aria-hidden="true">${esc(t.emoji || '📌')}</span></span>
      ${editing ? `<span class="q-check q-pen" aria-hidden="true">${ICON.pen}</span>`
        : `<button class="q-check" data-check ${lockCheck ? 'disabled' : ''} aria-pressed="${!!t.done}" aria-label="${esc(t.title)} ${t.done ? '완료 취소' : '완료'}">${failed ? ICON.cross : ICON.check}</button>`}
    </div>
    <b class="qc-title">${esc(t.title)}</b>
    <div class="qc-meta">${meta.join('')}</div>
    <span class="q-xp">+${xpOfTask(t)} XP</span>
    ${t.done ? '<span class="stamp">CLEAR</span>' : failed ? '<span class="stamp fail">탈락</span>' : ''}
  </li>`;
}

function calHTML(y, m, sel, pick) {
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, last = new Date(y, m + 1, 0).getDate();
  let html = WEEK_HEAD.map(w => `<span class="wd">${w}</span>`).join('');
  for (let i = 0; i < lead; i++) html += '<span class="dtile blank"></span>';
  for (let d = 1; d <= last; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`, r = rateOf(k);
    let cls = 'dtile', style = `--i:${lead + d}`, label = `${m + 1}월 ${d}일`;
    if (r != null && k <= TODAY) {
      if (r >= 100) cls += ' full'; else { cls += ' part'; style += `; --p:${Math.round(15 + r * 0.6)}%`; }
      label += ` 달성률 ${r}%`;
    } else if (r != null) { cls += ' plan'; label += ' 할 일 있음'; }
    if (k === TODAY) cls += ' today';
    html += pick
      ? `<button class="${cls}" style="${style}" data-k="${k}" aria-pressed="${k === sel}" aria-label="${label}">${d}</button>`
      : `<span class="${cls}" style="${style}" aria-label="${label}">${d}</span>`;
  }
  return html;
}

const monthNav = (y, m, scope) => `
  <button class="nav-btn" data-shift="-1" data-scope="${scope}" aria-label="이전 달">${ICON.prev}</button>
  <b class="disp">${y}.${pad(m + 1)}</b>
  <button class="nav-btn" data-shift="1" data-scope="${scope}" aria-label="다음 달">${ICON.next}</button>`;

function statusPanel(i) {
  const msg = UI.status === 'nodb' ? '기록을 열 수 없어요. claude.ai에 로그인한 상태로 이 페이지를 열어 주세요.'
    : UI.status === 'slow' ? '기록을 아직 불러오지 못했어요. 연결이 돌아오면 저절로 보여요.'
    : '불러오는 중…';
  return `<div class="panel anim" style="--i:${i}"><p class="empty">${msg}</p></div>`;
}
const ready = () => UI.status === 'ok';

/* ---------- 화면: 오늘 루틴 ---------- */
function heroHTML(date, i) {
  const todos = todosOf(date);
  const done = todos.filter(t => t.done).length;
  const total = todos.reduce((s, t) => s + (t.minutes || 0), 0);
  const rel = { [shiftKey(TODAY, -1)]: '어제', [TODAY]: '오늘', [shiftKey(TODAY, 1)]: '내일' }[date];
  const parts = [];
  if (todos.length) parts.push(`${todos.length}개 중 ${done}개 완료`);
  if (total) parts.push(`계획 ${fmtMin(total)}`);
  const r = rateOf(date);
  return `<div class="dayhero anim" style="--i:${i}">
    <div class="text">
      <span class="eyebrow">${rel ? `${rel} 할 일` : '할 일'}</span>
      <div class="dh-date"><b class="disp">${dotDate(date)}</b><span>${dowOf(date)}</span></div>
      ${parts.length ? `<span class="dh-sub num">${parts.join(' · ')}</span>` : ''}
    </div>
    ${r != null && date <= TODAY ? ringHTML(r) : ''}
  </div>`;
}

// 할 일 줄: 시간 막대 + 고치기 버튼 + 카드들 + 맨 끝 '할 일 추가' 카드
function listHTML(date, i0) {
  const todos = todosOf(date), editing = UI.edit === date;
  const copyFrom = date > TODAY && todosOf(TODAY).length && date !== TODAY ? TODAY : null;
  if (!todos.length) {
    return `<div class="panel empty-day anim" style="--i:${i0}">
      <p class="empty">${date > TODAY ? '아직 정한 할 일이 없어요' : '등록된 할 일이 없어요'}</p>
      <div class="btn-col">
        <button class="btn" data-add="${date}">+ 할 일 추가</button>
        ${copyFrom ? `<button class="btn ghost" data-copy="${copyFrom}>${date}">오늘 목록 그대로 가져오기</button>` : ''}
      </div></div>`;
  }
  return `<div class="qtools anim" style="--i:${i0}">${timeBarHTML(todos) || '<span></span>'}
      <button class="chip ${editing ? '' : 'soft'} sec-btn" data-edit-toggle="${date}">${editing ? '다 고쳤어요' : '고치기'}</button></div>
    <ul class="qrow" aria-label="${dotDate(date)} 할 일">${todos.map((t, i) => cardHTML(t, i, date, i0 + 1 + i)).join('')}
      <li class="qadd anim" style="--i:${i0 + 1 + todos.length}"><button data-add="${date}" aria-label="${dotDate(date)} 할 일 추가"><span class="plus" aria-hidden="true">+</span><b>할 일 추가</b></button></li>
    </ul>`;
}

function dayAreaHTML() {
  if (!ready()) return heroHTML(UI.sel, 0) + statusPanel(1);
  const date = UI.sel, todos = todosOf(date);
  let html = heroHTML(date, 0);
  if (todos.length && rateOf(date) === 100 && date <= TODAY) {
    html += `<div class="panel allclear anim" style="--i:1">
      ${starSVG('s', 'left:12%;top:22%')}${starSVG('s', 'right:14%;top:16%;animation-delay:.6s')}${starSVG('s', 'right:26%;bottom:18%;width:10px;height:10px;animation-delay:1.1s')}
      <b>ALL CLEAR</b></div>`;
  }
  html += listHTML(date, 2);
  // 오늘을 보고 있으면 내일 목록을 늘 같이 보여 준다: 폰이 없는 날을 위해 오늘 미리 정해 둔다
  if (date === TODAY) {
    const tk = shiftKey(date, 1), tmr = todosOf(tk);
    const total = tmr.reduce((s, t) => s + (t.minutes || 0), 0);
    html += `<div class="sec anim" style="--i:6"><h2>내일 할 일</h2><span class="num">${dotDate(tk)} ${dowOf(tk)}${total ? ` · 계획 ${fmtMin(total)}` : ''}</span></div>
      ${listHTML(tk, 7)}`;
  }
  return html;
}

function calHeadHTML() {
  const st = monthStats(UI.y, UI.m);
  return `${monthNav(UI.y, UI.m, 'home')}${st.rate != null ? `<span class="chip num">달성률 ${st.rate}%</span>` : ''}`;
}

function viewToday() {
  return `
    <div class="view-title anim" style="--i:0">${ICON.star}<h1>오늘 루틴</h1></div>
    <div class="home">
      <div class="home-left">
        <section class="panel anim" style="--i:1" aria-label="달력">
          <div class="map-head" id="calHead">${calHeadHTML()}</div>
          <div class="mcal" id="cal">${calHTML(UI.y, UI.m, UI.sel, true)}</div>
        </section>
      </div>
      <div class="home-right" id="dayArea">${dayAreaHTML()}</div>
    </div>`;
}

/* ---------- 화면: 저장소 ---------- */
function viewArchive() {
  const { ay: y, am: m } = UI;
  const st = monthStats(y, m);
  const prefix = `${y}-${pad(m + 1)}-`;
  const dates = Object.keys(S.days).filter(d => d.startsWith(prefix) && todosOf(d).length).sort().reverse();
  const mk = monthKey(y, m);
  const stats = [`<span class="chip soft num">기록 ${st.count}일</span>`];
  if (st.total) stats.push(`<span class="chip soft num">할 일 ${st.done}/${st.total}</span>`);
  stats.push(`<span class="chip num">+${st.xp} XP</span>`);
  const spent = spentIn(mk), nSpend = spendOf(mk).length;
  stats.push(`<button class="chip soft num" data-money-month="${mk}">쓴 돈 ${won(spent)}${nSpend ? ` · ${nSpend}건` : ''}</button>`);

  // 이번 달·지난 달 대화와 변경 기록: 이번 주 것은 이미 받아 두었고, 나머지는 열 때 불러온다
  if (ready() && mk < TODAY.slice(0, 7)) loadMonthExtras(y, m);
  const ex = UI.extras[mk];
  const pick = (live, loaded) => {
    const o = {};
    for (const [d, v] of Object.entries(loaded || {})) if (d.startsWith(mk)) o[d] = v;
    for (const [d, v] of Object.entries(live)) if (d.startsWith(mk)) o[d] = v;
    return o;
  };
  const chatM = pick(S.chatDays, ex?.chat), logM = pick(S.logDays, ex?.log);
  const time = iso => { const t = new Date(String(iso).replace(/u$/, '')); return isNaN(t) ? '' : `${pad(t.getHours())}:${pad(t.getMinutes())}`; };
  const histHTML = (obj, kind) => {
    const days = Object.keys(obj).sort().reverse().filter(d => (kind === 'chat' ? obj[d].messages : obj[d].entries)?.length);
    if (ex?.loading && !days.length) return '<p class="empty">불러오는 중…</p>';
    if (!days.length) return '<p class="empty">이 달에는 없어요</p>';
    return days.map(d => {
      const rows = kind === 'chat' ? obj[d].messages : obj[d].entries;
      return `<details class="hist"><summary><b class="disp">${dotDate(d)}</b><span>${dowOf(d)}</span><span class="cnt num">${rows.length}${kind === 'chat' ? '개' : '건'}</span></summary>
        <ul>${rows.map(r => kind === 'chat'
          ? `<li class="${r.role === 'user' ? 'me' : ''}"><span class="tm num">${time(r.at)}</span><span class="who">${r.role === 'user' ? '나' : '매니저'}</span><span class="tx">${esc(r.content)}</span></li>`
          : `<li><span class="tm num">${time(r.at)}</span><span class="tx">${esc(r.text)}</span></li>`).join('')}</ul></details>`;
    }).join('');
  };

  const logs = !ready() ? statusPanel(3)
    : !dates.length ? '<div class="panel anim" style="--i:3"><p class="empty">이 달에는 기록이 없어요</p></div>'
    : dates.map((d, i) => {
      const todos = todosOf(d), r = rateOf(d), future = d > TODAY;
      const total = todos.reduce((s, t) => s + (t.minutes || 0), 0);
      const thanks = todos.find(t => t.kind === 'thanks');
      const items = (thanks?.items || []).filter(Boolean);
      return `<article class="panel log tilt anim" style="--i:${3 + i}">
        <div class="log-head"><b class="disp">${dotDate(d)}</b><span>${dowOf(d)}</span>
          ${future ? '<span class="chip soft">예정</span>' : `<span class="chip num">${r}%</span>`}</div>
        <p class="meta num">할 일 ${todos.length}개${total ? ` · 계획 ${fmtMin(total)}` : ''}</p>
        <ul class="mini">${todos.map((t, j) => {
          const failed = isFailed(t, d);
          const right = t.minutes ? fmtMin(t.minutes) : t.kind === 'workout' ? partOf(d) : (t.amount || '');
          return `<li class="${t.done ? 'done' : ''}${failed ? ' failed' : ''}" style="--c:${PAL[j % PAL.length]}">
            <span class="emoji" aria-hidden="true">${esc(t.emoji || '📌')}</span>
            <span class="n">${esc(t.title)}${failed ? ' · 탈락' : ''}</span>
            <span class="t">${esc(right)}</span>
            <span class="ck" role="img" aria-label="${t.done ? '완료' : failed ? '탈락' : '미완료'}">${failed ? ICON.cross : ICON.check}</span>
          </li>`;
        }).join('')}</ul>
        ${items.length ? `<div class="thanks"><p>감사한 점</p><ol>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>` : ''}
      </article>`;
    }).join('');

  return `
    <div class="view-title anim" style="--i:0">${ICON.star}<h1>저장소</h1></div>
    <div class="arch">
      <section class="panel season anim" style="--i:1">
        <div class="map-head" style="margin:0">${monthNav(y, m, 'archive')}</div>
        <div>
          <span class="eyebrow">달성률</span>
          <div class="disp mega"${st.rate != null ? countAttr(st.rate, '%') : '>–'}</div>
        </div>
        <div class="stats">${stats.join('')}</div>
        <div class="mcal heat">${calHTML(y, m, null, false)}</div>
        <div class="legend"><span><i class="l-part"></i>조금</span><span><i class="l-full"></i>전부</span><span><i class="l-plan"></i>예정</span></div>
      </section>
      <div class="log">
        <div class="sec anim" style="--i:2"><h2>할 일 기록</h2></div>
        ${logs}
        <div class="sec anim" style="--i:4"><h2>대화 기록</h2></div>
        <section class="panel anim hist-box" style="--i:5">${ready() ? histHTML(chatM, 'chat') : '<p class="empty">불러오는 중…</p>'}</section>
        <div class="sec anim" style="--i:6"><h2>바꾼 기록</h2></div>
        <section class="panel anim hist-box" style="--i:7">${ready() ? histHTML(logM, 'log') : '<p class="empty">불러오는 중…</p>'}</section>
        <section class="panel anim backup" style="--i:8">
          <div><b>전체 기록 내려받기</b><small>할 일, 감사한 점, 운동, 돈, 대화, 바꾼 기록 전부를 한 파일로</small></div>
          <button class="btn ghost" data-backup>내려받기</button>
        </section>
      </div>
    </div>`;
}

/* ---------- 화면: 돈 관리 ---------- */
function payInfo() {
  const pd = S.money.payday || 10;
  const d = NOW.getDate(), y = NOW.getFullYear(), m = NOW.getMonth();
  const next = d < pd ? new Date(y, m, pd) : d === pd ? new Date(y, m, pd) : new Date(y, m + 1, pd);
  const prev = d >= pd ? new Date(y, m, pd) : new Date(y, m - 1, pd);
  const today0 = new Date(y, m, d);
  const left = Math.round((next - today0) / 86400000);
  const span = Math.round((next - prev) / 86400000) || 30;
  const passed = d === pd ? 0 : Math.round((today0 - prev) / 86400000);
  return { next, left, pct: Math.min(100, Math.round((passed / span) * 100)) };
}

// 토스처럼: 내 자산(통장별 잔액) → 이번 달 소비(예산·분류) → 월급날 → 입출금 내역
const CATS = [
  { id: 'food', name: '식비', emoji: '🍚', c: 'var(--orange)' },
  { id: 'snack', name: '간식', emoji: '🍫', c: 'var(--pink)' },
  { id: 'life', name: '생활', emoji: '🧴', c: 'var(--cyan)' },
  { id: 'move', name: '교통', emoji: '🚌', c: 'var(--lime)' },
  { id: 'shop', name: '쇼핑', emoji: '🛍️', c: 'var(--violet)' },
  { id: 'phone', name: '통신', emoji: '📱', c: 'var(--yellow)' },
  { id: 'fun', name: '여가', emoji: '🎮', c: '#5b8cff' },
  { id: 'etc', name: '기타', emoji: '💸', c: 'var(--ink-3)' },
];
const catOf = id => CATS.find(c => c.id === id) || CATS[CATS.length - 1];
const bankName = id => (id === 'cash' ? '현금' : BANKS.find(b => b.id === id)?.name || '');
function ago(iso) {
  if (!iso) return '아직 입력 안 함';
  const t = new Date(iso), days = Math.floor((new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
  return days <= 0 ? `오늘 ${pad(t.getHours())}:${pad(t.getMinutes())} 입력` : days === 1 ? '어제 입력' : `${days}일 전 입력`;
}

// 돈 관리 화면만 토스 다크 모드처럼: 납작한 카드, 큰 숫자, 토스 파랑, 친근한 문장
const latestAt = () => Object.values(S.money.balanceAt || {}).filter(Boolean).sort().pop();
const shortAgo = iso => (iso ? ago(iso).replace(' 입력', ' 업데이트') : '');
const dayLabelT = d => `${parseKey(d).getDate()}일 ${DAY[parseKey(d).getDay()]}요일`;

function txRowHTML(mk, x) {
  const inc = x.type === 'in', c = inc ? { emoji: '💵', name: '입금' } : catOf(x.cat);
  const t = x.at ? new Date(x.at) : null;
  const sub = [bankName(x.bank), c.name].filter(Boolean).join(' · ');
  return `<button class="t-row tx" data-exp="${mk}|${esc(x.id)}">
    <span class="ico"><span class="emoji" aria-hidden="true">${c.emoji}</span></span>
    <span class="txt"><b>${esc(x.title)}</b><small>${esc(sub)}</small></span>
    <span class="amt num ${inc ? 'in' : ''}">${inc ? '+' : '-'}${won(x.amount)}</span>
  </button>`;
}

const updown = (n, unit = '원') => `${n > 0 ? '+' : n < 0 ? '-' : ''}${unit === '%' ? Math.abs(n).toFixed(1) : Math.abs(Math.round(n)).toLocaleString('ko-KR')}${unit}`;
const CARD_IMG = 'private/card-narasarang.png';

function cardItems(mk) { return spendOf(mk).filter(x => x.method === 'card' && x.type !== 'in'); }

function jarSVG(pct, id, color) {
  const top = 34, bottom = 132, y = bottom - (bottom - top) * Math.max(0, Math.min(1, pct));
  return `<svg class="jar" viewBox="0 0 120 140" role="img" aria-label="${Math.round(pct * 100)}% 모임">
    <defs>
      <clipPath id="jc-${id}"><path d="M30 26h60v8c12 6 16 16 16 30v52c0 14-8 20-22 20H36c-14 0-22-6-22-20V64c0-14 4-24 16-30z"/></clipPath>
      <linearGradient id="jl-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".95"/><stop offset="1" stop-color="${color}" stop-opacity=".55"/></linearGradient>
    </defs>
    <g clip-path="url(#jc-${id})">
      <rect width="120" height="140" fill="rgba(255,255,255,.05)"/>
      <g class="liquid" style="--y:${y.toFixed(1)}px">
        <path class="wave" d="M-60 0q15-7 30 0t30 0t30 0t30 0t30 0t30 0t30 0v150h-210z" fill="url(#jl-${id})"/>
      </g>
    </g>
    <path d="M30 26h60v8c12 6 16 16 16 30v52c0 14-8 20-22 20H36c-14 0-22-6-22-20V64c0-14 4-24 16-30z" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
    <rect x="26" y="14" width="68" height="13" rx="5" fill="#ffd34d"/><rect x="48" y="18" width="24" height="4" rx="2" fill="#a07a00"/>
    <ellipse cx="44" cy="70" rx="6" ry="18" fill="rgba(255,255,255,.14)"/>
  </svg>`;
}

function viewMoney() {
  const M = S.money, p = payInfo();
  const bal = id => (M.balances[id] == null ? null : Number(M.balances[id]));
  const usable = USABLE.reduce((s, id) => s + (bal(id) || 0), 0), usableKnown = USABLE.some(id => bal(id) != null);
  const saveCash = bal('kakao');
  const sv = savPlan(), st = stockSum();
  const total = usable + (saveCash || 0) + sv.bal + (st.value || 0);
  const mk = monthKey(UI.my, UI.mm), isNow = mk === TODAY.slice(0, 7);
  const items = spendOf(mk), out = items.filter(x => x.type !== 'in');
  const spent = spentIn(mk), income = incomeIn(mk), budget = M.spend || 0;
  const left = budget - spent, pct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

  // 지난달 같은 기간과 비교 (지난 달을 보고 있으면 그 전 달 전체와)
  const prev = new Date(UI.my, UI.mm - 1, 1), pk = monthKey(prev.getFullYear(), prev.getMonth());
  const upto = isNow ? parseKey(TODAY).getDate() : 31;
  const prevItems = spendOf(pk).filter(x => x.type !== 'in' && parseKey(x.date).getDate() <= upto);
  const diff = spent - prevItems.reduce((s, x) => s + x.amount, 0);
  const compare = !prevItems.length ? '' : diff === 0 ? '지난달과 똑같이 썼어요'
    : `${isNow ? '지난달 같은 기간보다' : '전달보다'} <em class="${diff < 0 ? 'good' : 'bad'}">${won(Math.abs(diff))} ${diff < 0 ? '덜' : '더'}</em> 썼어요`;
  const catsOf = list => {
    const by = {};
    list.forEach(x => { by[x.cat || 'etc'] = (by[x.cat || 'etc'] || 0) + x.amount; });
    return Object.entries(by).sort((a, b) => b[1] - a[1]);
  };
  const catsHTML = (cats, sum) => `<div class="t-cats">${cats.map(([c, v]) => `
    <div class="t-cat"><span class="ico" style="--cc:${catOf(c).c}"><span class="emoji" aria-hidden="true">${catOf(c).emoji}</span></span>
      <span class="nm">${catOf(c).name}<small class="num">${Math.round((v / sum) * 100)}%</small></span>
      <span class="num">${won(v)}</span></div>`).join('')}</div>`;
  const byDay = {};
  items.forEach(x => (byDay[x.date] = byDay[x.date] || []).push(x));
  transfersOf(mk).forEach(x => (byDay[x.date] = byDay[x.date] || []).push({ ...x, isTransfer: true }));
  Object.values(byDay).forEach(list => list.sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))));
  const days = Object.keys(byDay).sort().reverse();

  const cards = cardItems(mk), cardSum = cards.reduce((s, x) => s + x.amount, 0);
  const uncategorized = cards.filter(x => !x.cat).length;

  const acctRow = b => {
    const v = bal(b.id);
    return `<div class="t-row acct" style="--b:${b.color}">
      <button class="acct-main" data-acct="${b.id}">
        <span class="ico bank">${bankLogo(b)}</span>
        <span class="txt"><small>${b.name} · ${ACCT_ROLE[b.id]}</small><b class="num">${v == null ? '잔액을 넣어 주세요' : won(v)}</b></span>
      </button>
      <button class="t-send" data-transfer="${b.id}">이체</button>
    </div>`;
  };

  return `
    <div class="view-title anim" style="--i:0">${ICON.star}<h1>돈 관리</h1></div>
    ${ready() ? '' : statusPanel(1)}
    <div class="money-grid toss-view">
      <div class="money-col">
        <section class="t-card anim" style="--i:1">
          <span class="t-label">내 자산</span>
          <div class="t-big num"${wonAttr(total)}</div>
          <div class="t-kv"><span>쓸 수 있는 돈 <small>농협 + 신한</small></span><b class="num">${usableKnown ? won(usable) : '–'}</b></div>
          <div class="t-kv"><span>따로 모으는 돈 <small>카카오뱅크</small></span><b class="num">${saveCash == null ? '–' : won(saveCash)}</b></div>
          <div class="t-kv"><span>군적금</span><b class="num">${sv.accts.length ? won(sv.bal) : '–'}</b></div>
          <div class="t-kv"><span>주식</span><b class="num">${st.rows.length ? (st.value != null ? won(st.value) : '현재가 필요') : '–'}</b></div>
          <div class="t-btns three">
            <button class="t-btn primary" data-transfer="">이체</button>
            <button class="t-btn" data-bal-all>잔액 입력</button>
            <button class="t-btn" data-add-expense="${TODAY.slice(0, 7)}">내역 추가</button>
          </div>
        </section>

        <section class="t-card anim" style="--i:2">
          <div class="t-head"><b>쓸 수 있는 돈</b><span class="num">${usableKnown ? won(usable) : ''}</span></div>
          ${BANKS.filter(b => USABLE.includes(b.id)).map(acctRow).join('')}
          <div class="t-head small"><b>따로 모으는 돈</b></div>
          ${BANKS.filter(b => !USABLE.includes(b.id)).map(acctRow).join('')}
          ${UI.imgOK ? `<button class="t-row link" data-capture><span class="ico"><span class="emoji" aria-hidden="true">📷</span></span><span class="txt"><b>은행 앱 캡처로 넣기</b><small>사진을 보내면 매니저가 읽어 넣어요</small></span>${ICON.next}</button>` : ''}
        </section>

        <section class="t-card anim piggy" style="--i:3">
          <div class="t-head"><b>군적금 저금통</b><button class="t-mini" data-savings>설정</button></div>
          ${sv.accts.length ? `
            <span class="t-label">지금 모인 돈</span>
            <div class="t-big num"${wonAttr(sv.bal)}</div>
            <p class="t-say">만기에 <em class="good num">${won(sv.payout)}</em> 받아요 <small class="t-sub">이자 별도</small></p>
            <div class="jars">${sv.accts.map((a, i) => `
              <button class="jar-box" data-savings style="--jc:${a.color}">
                ${jarSVG(a.end ? a.bal / a.end : 0, a.id, a.color)}
                <b>${esc(a.short)}</b>
                <span class="num">${won(a.bal)}</span>
                <small class="num">매달 ${manwon(a.monthly)}</small>
              </button>`).join('')}</div>
            <div class="t-kv"><span>다음 자동 입금</span><b class="num">${sv.rem ? `${Number(sv.nextDate.slice(5, 7))}월 ${Number(sv.nextDate.slice(8))}일 · ${won(sv.monthly)}` : '끝났어요'}</b></div>
            <div class="t-kv"><span>남은 입금${S.savings.lastMonthGuess ? ' <small>전역 달 추정</small>' : ''}</span><b class="num">${S.savings.lastMonth ? `${sv.rem}번 · ${S.savings.lastMonth.slice(2, 4)}년 ${Number(S.savings.lastMonth.slice(5))}월까지` : '만기 달을 넣어 주세요'}</b></div>
            <div class="t-kv"><span>만기 원금 <small>넣은 돈</small></span><b class="num">${won(sv.end)}</b></div>
            <div class="t-kv"><span>정부 매칭 <small>${Math.round((S.savings.match ?? 1) * 100)}%</small></span><b class="num in">+${won(sv.payout - sv.end)}</b></div>`
          : '<p class="t-empty">아직 적금을 넣지 않았어요</p><button class="t-btn primary" data-savings>적금 넣기</button>'}
        </section>

        <section class="t-card anim" style="--i:4">
          <div class="t-head"><b>주식</b><button class="t-mini" data-stock>${st.rows.length ? '고치기' : '종목 추가'}</button></div>
          ${st.rows.length ? `
            <span class="t-label">평가 금액</span>
            <div class="t-big num">${st.value != null ? won(st.value) : '현재가를 기다리는 중'}</div>
            ${st.pnl != null ? `<p class="t-say">산 가격보다 <em class="${st.pnl >= 0 ? 'up' : 'down'} num">${won(Math.abs(st.pnl))} ${st.pnl >= 0 ? '올랐어요' : '떨어졌어요'}</em> <span class="${st.pnl >= 0 ? 'up' : 'down'} num">${updown((st.pnl / st.cost) * 100, '%')}</span></p>
              ${st.rows.length === 1 && st.rows[0].perShare != null ? `<span class="t-sub num">한 주에 ${won(Math.abs(st.rows[0].perShare))} ${st.rows[0].perShare >= 0 ? '올랐어요' : '내렸어요'} (${won(st.rows[0].avg)} → ${won(st.rows[0].price)})</span>` : ''}` : ''}
            <div class="tbl-wrap"><table class="t-table">
              <thead><tr><th>종목</th><th>산 가격</th><th>지금 가격</th><th>손익</th></tr></thead>
              <tbody>${st.rows.map(r => {
                const cls = v => (v == null ? '' : v >= 0 ? 'up' : 'down');
                return `<tr data-stock="${esc(r.id)}">
                <td><b>${esc(r.name)}</b><small>${r.qty}주</small></td>
                <td class="num">${won(r.avg)}<small>총 ${won(r.cost)}</small></td>
                <td class="num">${r.price != null ? won(r.price) : '–'}${r.dayRate != null ? `<small class="${cls(r.dayChange)}">전일 ${updown(r.dayRate, '%')}</small>` : ''}</td>
                <td class="num ${cls(r.pnl)}">${r.pnl == null ? '–' : `${updown(r.pnl)}<small>${updown(r.rate, '%')}</small>`}</td>
              </tr>`;
              }).join('')}</tbody>
              ${st.rows.length > 1 ? `<tfoot><tr><td>합계</td><td class="num">${won(st.cost)}</td><td class="num">${st.value != null ? won(st.value) : '–'}</td>
                <td class="num ${st.pnl == null ? '' : st.pnl >= 0 ? 'up' : 'down'}">${st.pnl == null ? '–' : updown(st.pnl)}</td></tr></tfoot>` : ''}
            </table></div>
            <span class="t-sub">${(() => {
              const q = st.rows.map(r => r.quote).filter(Boolean).sort((a, b) => String(a.tradedAt).localeCompare(String(b.tradedAt))).pop();
              if (!q) { const at = st.rows.map(r => r.priceAt).filter(Boolean).sort().pop(); return at ? `현재가 ${ago(at)} · 직접 넣은 값` : '현재가를 기다리는 중'; }
              const t = new Date(q.tradedAt);
              const when = `${t.getMonth() + 1}월 ${t.getDate()}일 ${DAY[t.getDay()]}`;
              const sess = q.session && q.session !== '정규장' ? `${q.session} ` : '';
              return `${when} ${q.status === 'OPEN' ? `${sess}${pad(t.getHours())}:${pad(t.getMinutes())} 시세` : `${sess || ''}${sess ? '' : '장 '}마감 가격`} · 평일 9:47·11:47·13:47·15:47 자동 갱신`;
            })()}</span>`
          : '<p class="t-empty">아직 넣은 종목이 없어요</p>'}
        </section>
      </div>

      <div class="money-col">
        <section class="t-card anim nara" style="--i:5">
          <div class="t-head"><b>나라사랑카드</b><span>신한 체크</span></div>
          <div class="card3d" data-card3d>
            <div class="card3d-float"><div class="card3d-in">
              <img src="${CARD_IMG}" alt="신한 나라사랑카드" draggable="false">
              <span class="card3d-shine" aria-hidden="true"></span>
            </div></div>
          </div>
          <div class="t-month">${monthNav(UI.my, UI.mm, 'money')}</div>
          <span class="t-label">${UI.mm + 1}월 카드 사용</span>
          <div class="t-big num"${wonAttr(cardSum)}</div>
          <span class="t-sub num">${cards.length ? `${cards.length}번 썼어요 · 한 번에 평균 ${won(Math.round(cardSum / cards.length))}` : '아직 카드 사용 기록이 없어요'}</span>
          ${cards.length ? catsHTML(catsOf(cards), cardSum) : ''}
          <div class="t-btns">
            <button class="t-btn primary" data-add-card="${mk}">카드 사용 기록</button>
            <button class="t-btn" data-card-sort="${mk}">${uncategorized ? `정리하기 · ${uncategorized}` : '이번 달 정리'}</button>
          </div>
        </section>

        <section class="t-card anim" style="--i:6">
          <span class="t-label">월급날까지</span>
          <div class="t-big num">${p.left === 0 ? '오늘이에요' : `${p.left}일`}</div>
          <span class="t-sub num">${p.next.getMonth() + 1}월 ${p.next.getDate()}일 ${DAY[p.next.getDay()]}요일 · 매달 ${M.payday}일</span>
          <div class="t-bar"><i style="width:${p.pct}%"></i></div>
          <div class="t-kv"><span>군적금 자동이체</span><b class="num">${won(M.savings)}</b></div>
          <div class="t-kv"><span>한 달 쓸 수 있는 돈</span><b class="num">${won(M.spend)}</b></div>
        </section>

        <section class="t-card anim" style="--i:7">
          <div class="t-month">${monthNav(UI.my, UI.mm, 'money')}</div>
          <span class="t-label">${UI.mm + 1}월 소비</span>
          <div class="t-big num"${wonAttr(spent)}</div>
          ${compare ? `<p class="t-say">${compare}</p>` : ''}
          ${budget ? `<div class="t-bar ${left < 0 ? 'over' : ''}"><i style="width:${pct}%"></i></div>
            <p class="t-sub">${left >= 0 ? `예산 ${manwon(budget)} 중 <b class="num">${won(left)}</b> 남았어요` : `예산 ${manwon(budget)}을 <b class="num bad">${won(-left)}</b> 넘었어요`}</p>` : ''}
          ${out.length ? catsHTML(catsOf(out), spent) : ''}
          ${income ? `<div class="t-kv"><span>${UI.mm + 1}월 들어온 돈</span><b class="num in">+${won(income)}</b></div>` : ''}
        </section>

        <section class="t-card anim" style="--i:8">
          <div class="t-head"><b>${UI.mm + 1}월 내역</b><span class="num">${items.length}</span><button class="t-mini" data-add-expense="${mk}">추가</button></div>
          ${days.length ? days.map(d => `
            <div class="t-day">${dayLabelT(d)}</div>
            ${byDay[d].slice().reverse().map(x => (x.isTransfer ? trRowHTML(mk, x) : txRowHTML(mk, x))).join('')}`).join('')
            : `<p class="t-empty">${isNow ? '아직 기록한 내역이 없어요' : '이 달에는 내역이 없어요'}</p>`}
        </section>
      </div>
    </div>`;
}

function trRowHTML(mk, x, forBank) {
  const sign = forBank ? (x.to === forBank ? '+' : '-') : '';
  return `<button class="t-row tx" data-tr="${mk}|${esc(x.id)}">
    <span class="ico"><span class="emoji" aria-hidden="true">🔁</span></span>
    <span class="txt"><b>${bankName(x.from)} → ${bankName(x.to)}</b><small>이체${x.memo ? ` · ${esc(x.memo)}` : ''}</small></span>
    <span class="amt num move ${sign === '+' ? 'in' : ''}">${sign}${won(x.amount)}</span>
  </button>`;
}

// 토스 송금 화면처럼: 어디서 → 어디로, 큰 금액, 빠른 금액 버튼
function transferSheet(fromId) {
  const f = { from: fromId || 'nh', to: fromId === 'kakao' ? 'nh' : fromId === 'shinhan' ? 'kakao' : 'kakao', amount: 0 };
  if (f.to === f.from) f.to = BANKS.find(b => b.id !== f.from).id;
  const balOf = id => S.money.balances[id];
  const pickHTML = (name, sel, other) => `<div class="tr-pick" data-side="${name}">${BANKS.map(b => `
      <button class="tr-acct" data-b="${b.id}" style="--b:${b.color}" aria-pressed="${b.id === sel}" ${b.id === other ? 'data-other' : ''}>
        <span class="ico bank">${bankLogo(b)}</span><b>${b.name}</b><small class="num">${balOf(b.id) == null ? '잔액 모름' : won(balOf(b.id))}</small></button>`).join('')}</div>`;
  openSheet(`<div class="tr-head"><h3>계좌 이체</h3><p>실제로 옮긴 돈을 여기서도 똑같이 옮겨요</p></div>
    <div class="sh-sec"><span class="label">어디서</span><div id="trFrom">${pickHTML('from', f.from, f.to)}</div></div>
    <button class="tr-swap" id="trSwap" aria-label="보내는 곳과 받는 곳 바꾸기">⇅</button>
    <div class="sh-sec"><span class="label">어디로</span><div id="trTo">${pickHTML('to', f.to, f.from)}</div></div>
    <div class="tr-amt"><input id="trAmt" inputmode="numeric" size="1" placeholder="얼마나 옮길까요?" aria-label="옮길 금액"><span id="trWon" hidden>원</span></div>
    <p class="tr-hint num" id="trHint"></p>
    <div class="parts tr-quick">${[10000, 50000, 100000].map(v => `<button class="pchip" data-add="${v}">+${manwon(v)}</button>`).join('')}<button class="pchip" data-all>전액</button></div>
    <input class="field" id="trMemo" maxlength="30" placeholder="메모 (선택)">
    <button class="btn" id="trGo" disabled>이체하기</button>`, body => {
    const $ = q => body.querySelector(q);
    const amt = $('#trAmt');
    const draw = () => {
      body.querySelectorAll('#trFrom .tr-acct').forEach(b => { b.setAttribute('aria-pressed', b.dataset.b === f.from); b.toggleAttribute('data-other', b.dataset.b === f.to); });
      body.querySelectorAll('#trTo .tr-acct').forEach(b => { b.setAttribute('aria-pressed', b.dataset.b === f.to); b.toggleAttribute('data-other', b.dataset.b === f.from); });
      amt.value = f.amount ? f.amount.toLocaleString('ko-KR') : '';
      amt.style.width = f.amount ? `${amt.value.length * 0.62 + 0.4}em` : '100%';
      $('#trWon').hidden = !f.amount;
      const fb = balOf(f.from);
      $('#trHint').textContent = !f.amount ? `${bankName(f.from)} 잔액 ${fb == null ? '모름' : won(fb)}`
        : fb != null && f.amount > fb ? `${bankName(f.from)} 잔액보다 ${won(f.amount - fb)} 많아요` : `${bankName(f.to)}(으)로 ${won(f.amount)} 옮겨요`;
      $('#trHint').classList.toggle('warn', fb != null && f.amount > fb);
      $('#trGo').disabled = !f.amount || f.from === f.to;
    };
    const pick = (side, id) => {
      if (side === 'from') { if (id === f.to) f.to = f.from; f.from = id; } else { if (id === f.from) f.from = f.to; f.to = id; }
      draw();
    };
    $('#trFrom').addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (b) pick('from', b.dataset.b); });
    $('#trTo').addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (b) pick('to', b.dataset.b); });
    $('#trSwap').addEventListener('click', () => { [f.from, f.to] = [f.to, f.from]; draw(); });
    amt.addEventListener('input', () => { f.amount = Number(amt.value.replace(/[^\d]/g, '')) || 0; draw(); });
    body.querySelector('.tr-quick').addEventListener('click', e => {
      const b = e.target.closest('[data-add], [data-all]'); if (!b) return;
      f.amount = b.dataset.add ? f.amount + Number(b.dataset.add) : Math.max(0, Number(balOf(f.from)) || 0);
      draw();
    });
    $('#trGo').addEventListener('click', async e => {
      if (!f.amount || f.from === f.to) return;
      e.currentTarget.disabled = true;
      try {
        await doTransfer(f.from, f.to, f.amount, $('#trMemo').value.trim());
        window.FX?.burst(innerWidth / 2, innerHeight * 0.55, 18);
        $sheetBody.innerHTML = `<div class="grip" aria-hidden="true"></div><div class="tr-done">
          <span class="tr-check">${ICON.check}</span>
          <h3>${bankName(f.to)}(으)로<br><span class="num">${won(f.amount)}</span> 옮겼어요</h3>
          <div class="t-kv"><span>${bankName(f.from)}</span><b class="num">${won(S.money.balances[f.from])}</b></div>
          <div class="t-kv"><span>${bankName(f.to)}</span><b class="num">${won(S.money.balances[f.to])}</b></div>
          <button class="btn" id="trOk">확인</button></div>`;
        $sheetBody.querySelector('#trOk').addEventListener('click', closeSheet);
      } catch (err) { saveFail(); e.currentTarget.disabled = false; }
    });
    draw();
    setTimeout(() => amt.focus(), 320);
  }, 'toss');
}

function transferDetailSheet(mk, id) {
  const x = (S.transfers[mk]?.items || []).find(i => i.id === id);
  if (!x) return;
  openSheet(`<div class="tr-head"><h3>${bankName(x.from)} → ${bankName(x.to)}</h3><p class="num">${dotDate(x.date)} ${x.at ? `${pad(new Date(x.at).getHours())}:${pad(new Date(x.at).getMinutes())}` : ''} 이체${x.memo ? ` · ${esc(x.memo)}` : ''}</p></div>
    <div class="t-big num">${won(x.amount)}</div>
    <p class="t-sub">잘못 옮겼으면 취소하세요. 두 통장 잔액이 원래대로 돌아가고, 기록은 남아요.</p>
    <div class="btn-row"><button class="btn ghost" id="trCancel">이체 취소</button><button class="btn" id="trClose">닫기</button></div>`, body => {
    body.querySelector('#trClose').addEventListener('click', closeSheet);
    body.querySelector('#trCancel').addEventListener('click', async () => {
      try { await cancelTransfer(mk, id); toast('이체를 취소했어요'); closeSheet(); } catch (e) { saveFail(); }
    });
  }, 'toss');
}

/* ---------- 군적금 · 주식 · 카드 시트 ---------- */
function savingsSheet() {
  const sv = clone(S.savings);
  if (!sv.accounts.length) sv.accounts = [
    { id: 'ibk', name: 'IBK 장병내일준비적금', short: 'IBK', color: '#2f7cf6', monthly: 300000, initial: 0, asOf: TODAY, deposits: [] },
    { id: 'shinhan', name: '신한 장병내일준비적금', short: '신한', color: '#7b61ff', monthly: 250000, initial: 0, asOf: TODAY, deposits: [] },
  ];
  openSheet(`<div class="sh-head"><span class="q-icon"><span class="emoji" aria-hidden="true">🐷</span></span>
      <div><h3>군적금 설정</h3><p>매달 ${sv.payday}일에 저절로 채워져요</p></div></div>
    ${sv.accounts.map(a => `<div class="sh-sec sav-ed" data-sav="${a.id}">
      <span class="label">${esc(a.name)}</span>
      <div class="sav-grid">
        <label>지금 모인 돈<span class="numfield"><input class="field" data-k="bal" inputmode="numeric" value="${savBalance(a)}"><span>원</span></span></label>
        <label>매달 넣는 돈<span class="numfield"><input class="field" data-k="monthly" inputmode="numeric" value="${a.monthly}"><span>원</span></span></label>
      </div></div>`).join('')}
    <div class="sh-sec"><span class="label">마지막 입금 달 (전역 전 마지막 월급날)</span><input class="field" id="svLast" type="month" value="${sv.lastMonth || ''}"></div>
    <div class="sh-sec"><span class="label">정부 매칭 비율</span><div class="numfield"><input class="field" id="svMatch" inputmode="numeric" value="${Math.round((sv.match ?? 1) * 100)}"><span>%</span></div></div>
    <button class="btn" id="svSave">저장</button>`, body => {
    body.querySelectorAll('input[inputmode="numeric"]').forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/[^\d]/g, ''); }));
    body.querySelector('#svSave').addEventListener('click', async () => {
      const lines = [];
      for (const a of sv.accounts) {
        const box = body.querySelector(`[data-sav="${a.id}"]`);
        const nb = Number(box.querySelector('[data-k="bal"]').value) || 0, nm = Number(box.querySelector('[data-k="monthly"]').value) || 0;
        if (nb !== savBalance(a)) {
          // 지금 금액을 고치면 오늘을 새 기준으로 삼고, 예전 기준은 history에 남긴다
          a.history = [...(a.history || []), { initial: a.initial, asOf: a.asOf, deposits: a.deposits, at: new Date().toISOString() }];
          a.initial = nb; a.asOf = TODAY; a.deposits = [];
          lines.push(`${a.short} ${won(nb)}`);
        }
        if (nm !== a.monthly) { a.monthly = nm; lines.push(`${a.short} 매달 ${won(nm)}`); }
      }
      const last = body.querySelector('#svLast').value;
      if ((last || null) !== (S.savings.lastMonth || null) || S.savings.lastMonthGuess) { sv.lastMonth = last || null; delete sv.lastMonthGuess; lines.push(`마지막 입금 ${last || '없음'}`); }
      const match = (Number(body.querySelector('#svMatch').value) || 0) / 100;
      if (match !== (S.savings.match ?? 1)) { sv.match = match; lines.push(`매칭 ${Math.round(match * 100)}%`); }
      try { await putSavings(sv); if (lines.length) logAct(`군적금 설정 · ${lines.join(', ')}`); toast('군적금을 저장했어요'); closeSheet(); } catch (e) { saveFail(); }
    });
  }, 'toss');
}

function stockSheet() {
  const st = clone(S.stocks);
  const hs = (st.holdings || []).filter(h => !h.removed);
  openSheet(`<div class="sh-head"><span class="q-icon"><span class="emoji" aria-hidden="true">📈</span></span>
      <div><h3>주식</h3><p>시세는 평일 장중에 자동으로 들어와요. 급하면 직접 넣어도 돼요</p></div></div>
    ${hs.map(h => `<div class="sh-sec" data-h="${esc(h.id)}"><span class="label">${esc(h.name)} · ${h.qty}주 · 평균 ${won(h.avg)}</span>
      <div class="sav-grid">
        <label>현재가<span class="numfield"><input class="field" data-k="price" inputmode="numeric" placeholder="0" value="${h.price ?? ''}"><span>원</span></span></label>
        <label>수량<span class="numfield"><input class="field" data-k="qty" inputmode="numeric" value="${h.qty}"><span>주</span></span></label>
        <label>평균 단가<span class="numfield"><input class="field" data-k="avg" inputmode="numeric" value="${h.avg}"><span>원</span></span></label>
      </div></div>`).join('')}
    <details class="add-stock"${hs.length ? '' : ' open'}><summary>종목 추가</summary>
      <div class="sav-grid">
        <label>종목 이름<input class="field" id="nsName" maxlength="20" placeholder="예: 삼성전자"></label>
        <label>종목 코드 <small>(자동 시세용 6자리)</small><input class="field" id="nsCode" inputmode="numeric" maxlength="6" placeholder="005930"></label>
        <label>수량<span class="numfield"><input class="field" id="nsQty" inputmode="numeric" placeholder="0"><span>주</span></span></label>
        <label>평균 단가<span class="numfield"><input class="field" id="nsAvg" inputmode="numeric" placeholder="0"><span>원</span></span></label>
      </div></details>
    <button class="btn" id="stSave">저장</button>`, body => {
    body.querySelectorAll('input[inputmode="numeric"]').forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/[^\d]/g, ''); }));
    body.querySelector('#stSave').addEventListener('click', async () => {
      const now = new Date().toISOString(), lines = [];
      for (const h of st.holdings.filter(x => !x.removed)) {
        const box = body.querySelector(`[data-h="${CSS.escape(h.id)}"]`);
        const price = box.querySelector('[data-k="price"]').value, qty = Number(box.querySelector('[data-k="qty"]').value), avg = Number(box.querySelector('[data-k="avg"]').value);
        if (price !== '' && Number(price) !== h.price) {
          h.price = Number(price); h.priceAt = now; h.history = [...(h.history || []), { at: now, price: h.price }];
          lines.push(`${h.name} 현재가 ${won(h.price)}`);
        }
        if ((qty && qty !== h.qty) || (avg && avg !== h.avg)) {
          h.changes = [...(h.changes || []), { at: now, qty: h.qty, avg: h.avg }];
          if (qty) h.qty = qty; if (avg) h.avg = avg;
          lines.push(`${h.name} ${h.qty}주 평균 ${won(h.avg)}`);
        }
      }
      const nn = body.querySelector('#nsName').value.trim(), nq = Number(body.querySelector('#nsQty').value), na = Number(body.querySelector('#nsAvg').value);
      const nc = body.querySelector('#nsCode').value.trim();
      if (nn && nq > 0 && na > 0) { const h = { id: newId(), name: nn, qty: nq, avg: na, price: null, priceAt: null, history: [], at: now }; if (/^\d{6}$/.test(nc)) h.code = nc; st.holdings = [...(st.holdings || []), h]; lines.push(`종목 추가 ${nn} ${nq}주 ${won(na)}`); }
      try { await putStocks(st); if (lines.length) logAct(`주식 · ${lines.join(', ')}`); toast('저장했어요'); closeSheet(); } catch (e) { saveFail(); }
    });
  }, 'toss');
}

// 이번 달 카드 사용 정리: 분류 안 된 것부터 하나씩 분류를 붙인다
function cardSortSheet(mk) {
  const list = cardItems(mk).slice().sort((a, b) => (a.cat ? 1 : 0) - (b.cat ? 1 : 0) || (a.date < b.date ? 1 : -1));
  const sum = list.reduce((s, x) => s + x.amount, 0);
  const byWeek = {};
  list.forEach(x => { const w = Math.ceil(parseKey(x.date).getDate() / 7); byWeek[w] = (byWeek[w] || 0) + x.amount; });
  openSheet(`<div class="sh-head"><span class="q-icon"><span class="emoji" aria-hidden="true">💳</span></span>
      <div><h3>${Number(mk.slice(5))}월 카드 사용 정리</h3><p class="num">${list.length}건 · ${won(sum)}</p></div></div>
    ${list.length ? `<div class="sh-sec"><span class="label">주마다 쓴 돈</span>${[1, 2, 3, 4, 5].filter(w => byWeek[w]).map(w => `<div class="t-kv"><span>${w}주차</span><b class="num">${won(byWeek[w])}</b></div>`).join('')}</div>
      <div class="sh-sec"><span class="label">분류 붙이기</span>${list.map(x => `
        <div class="sort-row" data-sid="${esc(x.id)}"><div class="t-kv"><span>${dotDate(x.date)} ${esc(x.title)}</span><b class="num">${won(x.amount)}</b></div>
          <div class="parts">${CATS.map(c => `<button class="pchip" data-c="${c.id}" aria-pressed="${x.cat === c.id}"><span class="emoji" aria-hidden="true">${c.emoji}</span> ${c.name}</button>`).join('')}</div></div>`).join('')}</div>
      <button class="btn" id="sortSave">저장</button>` : '<p class="t-empty">이 달에는 카드 사용 기록이 없어요</p>'}`, body => {
    const pick = {};
    body.querySelectorAll('.sort-row').forEach(row => row.addEventListener('click', e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      pick[row.dataset.sid] = b.dataset.c;
      row.querySelectorAll('[data-c]').forEach(x => x.setAttribute('aria-pressed', x === b));
    }));
    body.querySelector('#sortSave')?.addEventListener('click', async () => {
      const items = clone(S.spend[mk]?.items || []), lines = [];
      for (const [id, c] of Object.entries(pick)) {
        const x = items.find(i => i.id === id);
        if (x && x.cat !== c) { x.history = [...(x.history || []), { cat: x.cat, at: new Date().toISOString() }]; x.cat = c; lines.push(`${x.title} → ${catOf(c).name}`); }
      }
      if (!lines.length) { closeSheet(); return; }
      try { await putSpend(mk, items); logAct(`카드 사용 정리 · ${lines.join(', ')}`); toast(`${lines.length}건 정리했어요`); closeSheet(); } catch (e) { saveFail(); }
    });
  }, 'toss');
}

function balHistHTML(bankId) {
  const mk = monthKey(UI.my, UI.mm);
  const items = (S.balhist[mk]?.items || []).filter(x => !bankId || x.bank === bankId).slice().reverse();
  if (!items.length) return '';
  return `<div class="t-head small"><b>${UI.mm + 1}월 잔액 기록</b><span class="num">${items.length}</span></div>
    ${items.map(x => { const t = new Date(x.at); return `<div class="t-kv"><span class="num">${t.getMonth() + 1}.${t.getDate()} ${pad(t.getHours())}:${pad(t.getMinutes())}${bankId ? '' : ` · ${bankName(x.bank)}`}</span><b class="num">${x.amount == null ? '지움' : won(x.amount)}</b></div>`; }).join('')}`;
}

// 토스의 계좌 상세처럼: 큰 잔액, 고치기, 이 통장 내역과 잔액 기록
function accountSheet(bankId) {
  const b = BANKS.find(x => x.id === bankId), v = S.money.balances[bankId];
  const mk = monthKey(UI.my, UI.mm);
  const mine = spendOf(mk).filter(x => x.bank === bankId).slice().reverse();
  const moves = transfersOf(mk).filter(x => x.from === bankId || x.to === bankId).slice().reverse();
  openSheet(`<div class="t-acct-head" style="--b:${b.color}"><span class="ico bank">${bankLogo(b)}</span><b>${b.name}</b></div>
    <div class="t-big num">${v == null ? '잔액을 넣어 주세요' : won(v)}</div>
    <span class="t-sub">${ago(S.money.balanceAt?.[bankId]).replace(' 입력', ' 업데이트')}</span>
    <div class="t-btns three"><button class="t-btn primary" id="acMove">이체</button><button class="t-btn" id="acEdit">잔액 고치기</button><button class="t-btn" id="acAdd">내역 추가</button></div>
    ${mine.length ? `<div class="t-head small"><b>${UI.mm + 1}월 이 통장 내역</b><span class="num">${mine.length}</span></div>${mine.map(x => txRowHTML(mk, x)).join('')}` : ''}
    ${moves.length ? `<div class="t-head small"><b>${UI.mm + 1}월 이체</b><span class="num">${moves.length}</span></div>${moves.map(x => trRowHTML(mk, x, bankId)).join('')}` : ''}
    ${balHistHTML(bankId)}`, body => {
    body.querySelector('#acEdit').addEventListener('click', () => balanceSheet(bankId));
    body.querySelector('#acMove').addEventListener('click', () => transferSheet(bankId));
    body.querySelector('#acAdd').addEventListener('click', () => expenseSheet(TODAY.slice(0, 7), null, bankId));
    body.addEventListener('click', e => {
      const ex = e.target.closest('[data-exp]');
      if (ex) { const [m, id] = ex.dataset.exp.split('|'); expenseSheet(m, id); }
      const tr = e.target.closest('[data-tr]');
      if (tr) { const [m, id] = tr.dataset.tr.split('|'); transferDetailSheet(m, id); }
    });
  }, 'toss');
}

// 통장 셋을 한 화면에서 입력
function balanceAllSheet() {
  openSheet(`<div class="sh-head" style="--c:var(--lime)"><span class="q-icon"><span class="emoji" aria-hidden="true">🏦</span></span>
      <div><h3>잔액 한 번에 입력</h3><p>바뀐 통장만 고쳐도 돼요</p></div></div>
    <div class="sh-sec">${BANKS.map(b => `
      <label class="bal-in" style="--b:${b.color}"><span class="bank">${bankLogo(b)}</span><b>${b.name}</b>
        <span class="numfield"><input class="field" data-bal="${b.id}" inputmode="numeric" placeholder="0" value="${S.money.balances[b.id] ?? ''}"><span>원</span></span></label>`).join('')}
    </div>
    <button class="btn" id="balAllSave">저장</button>`, body => {
    setTimeout(() => body.querySelector('[data-bal]')?.focus(), 320);
    body.querySelectorAll('[data-bal]').forEach(i => i.addEventListener('input', () => { i.value = i.value.replace(/[^\d]/g, ''); }));
    body.querySelector('#balAllSave').addEventListener('click', async () => {
      try {
        let n = 0;
        for (const i of body.querySelectorAll('[data-bal]')) {
          const v = i.value.trim() === '' ? null : Number(i.value);
          if (v !== (S.money.balances[i.dataset.bal] ?? null)) { await setBalance(i.dataset.bal, v); n++; }
        }
        toast(n ? `통장 ${n}개 잔액을 저장했어요` : '바뀐 잔액이 없어요');
        closeSheet();
      } catch (e) { saveFail(); }
    });
  }, 'toss');
}

// 지출·입금 기록하기/고치기
function expenseSheet(mk, id, presetBank, presetMethod) {
  const cur = id ? (S.spend[mk]?.items || []).find(x => x.id === id) : null;
  const banks = [...BANKS.map(b => ({ id: b.id, name: b.name })), { id: 'cash', name: '현금' }];
  const f = { type: cur?.type === 'in' ? 'in' : 'out', bank: cur?.bank || presetBank || '', cat: cur?.cat || '', method: cur?.method || presetMethod || '' };
  if (f.method === 'card') f.bank = 'shinhan';
  const defDate = cur?.date || (mk === TODAY.slice(0, 7) ? TODAY : `${mk}-01`);
  openSheet(`<div class="sh-head" style="--c:var(--lime)"><span class="q-icon"><span class="emoji" aria-hidden="true" id="exIcon">${f.type === 'in' ? '💵' : '💸'}</span></span>
      <div><h3>${cur ? '내역 고치기' : '내역 기록'}</h3><p>${cur ? `${dotDate(cur.date)} 기록` : '기록해 두면 달마다 모여요'}</p></div></div>
    <div class="seg" id="exType"><button data-t="out" aria-pressed="${f.type === 'out'}">나간 돈</button><button data-t="in" aria-pressed="${f.type === 'in'}">들어온 돈</button></div>
    <div class="sh-sec"><span class="label">금액</span><div class="numfield"><input class="field" id="exAmt" inputmode="numeric" placeholder="0" value="${cur ? cur.amount : ''}"><span>원</span></div></div>
    <div class="sh-sec"><span class="label">내용</span><input class="field" id="exTitle" maxlength="40" placeholder="예: PX 간식" value="${esc(cur?.title || '')}"></div>
    <div class="sh-sec" id="exCatBox" ${f.type === 'in' ? 'hidden' : ''}><span class="label">분류</span><div class="parts" id="exCat">${CATS.map(c =>
      `<button class="pchip" data-c="${c.id}" aria-pressed="${c.id === f.cat}"><span class="emoji" aria-hidden="true">${c.emoji}</span> ${c.name}</button>`).join('')}</div></div>
    <div class="sh-sec"><span class="label">날짜</span><input class="field" id="exDate" type="date" value="${defDate}" max="${TODAY}"></div>
    <div class="sh-sec" id="exMethodBox" ${f.type === 'in' ? 'hidden' : ''}><span class="label">결제</span><div class="parts" id="exMethod">${[['card', '💳 나라사랑카드'], ['transfer', '계좌'], ['cash', '현금']].map(([m, n]) =>
      `<button class="pchip" data-m="${m}" aria-pressed="${m === f.method}">${n}</button>`).join('')}</div></div>
    <div class="sh-sec"><span class="label">통장</span><div class="parts" id="exBank">${banks.map(b => `<button class="pchip" data-b="${b.id}" aria-pressed="${b.id === f.bank}">${b.name}</button>`).join('')}</div></div>
    <div class="${cur ? 'btn-row' : ''}">${cur ? '<button class="btn ghost" id="exDel">기록에서 숨기기</button>' : ''}<button class="btn" id="exSave">저장</button></div>`, body => {
    const $ = q => body.querySelector(q);
    const press = (box, attr, val) => box.querySelectorAll(`[${attr}]`).forEach(x => x.setAttribute('aria-pressed', x.getAttribute(attr) === val));
    const amt = $('#exAmt');
    amt.addEventListener('input', () => { amt.value = amt.value.replace(/[^\d]/g, ''); });
    $('#exType').addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      f.type = b.dataset.t; press($('#exType'), 'data-t', f.type);
      $('#exCatBox').hidden = f.type === 'in';
      $('#exMethodBox').hidden = f.type === 'in';
      $('#exIcon').textContent = f.type === 'in' ? '💵' : '💸';
    });
    $('#exCat').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; f.cat = f.cat === b.dataset.c ? '' : b.dataset.c; press($('#exCat'), 'data-c', f.cat); });
    $('#exBank').addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (!b) return; f.bank = f.bank === b.dataset.b ? '' : b.dataset.b; press($('#exBank'), 'data-b', f.bank); });
    $('#exMethod').addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      f.method = f.method === b.dataset.m ? '' : b.dataset.m; press($('#exMethod'), 'data-m', f.method);
      if (f.method === 'card') { f.bank = 'shinhan'; press($('#exBank'), 'data-b', 'shinhan'); }
      if (f.method === 'cash') { f.bank = 'cash'; press($('#exBank'), 'data-b', 'cash'); }
    });
    $('#exDel')?.addEventListener('click', async () => {
      const items = clone(S.spend[mk].items);
      Object.assign(items.find(x => x.id === id), { removed: true, removedAt: new Date().toISOString() });
      try { await putSpend(mk, items); logAct(`내역 숨김 · ${cur.title} ${won(cur.amount)} (${dotDate(cur.date)})`); toast('기록에서 숨겼어요'); closeSheet(); } catch (e) { saveFail(); }
    });
    $('#exSave').addEventListener('click', async () => {
      const amount = Number(amt.value), title = $('#exTitle').value.trim() || (f.type === 'in' ? '입금' : '지출');
      const date = isDate($('#exDate').value) ? $('#exDate').value : TODAY;
      if (!(amount > 0)) { toast('금액을 넣어 주세요'); amt.focus(); return; }
      const nk = date.slice(0, 7);
      const fill = x => {
        Object.assign(x, { amount, title, date });
        if (f.type === 'in') { x.type = 'in'; delete x.cat; delete x.method; } else { delete x.type; if (f.cat) x.cat = f.cat; else delete x.cat; if (f.method) x.method = f.method; else delete x.method; }
        if (f.bank) x.bank = f.bank; else delete x.bank;
        return x;
      };
      const sign = f.type === 'in' ? '+' : '-';
      try {
        if (cur) {
          // 고치면 예전 값은 history에 남겨 둔다
          const items = clone(S.spend[mk].items), x = items.find(i => i.id === id);
          const prev = { amount: x.amount, title: x.title, date: x.date, bank: x.bank, cat: x.cat, type: x.type, at: x.editedAt || x.at };
          if (nk === mk) {
            fill(x); x.editedAt = new Date().toISOString(); x.history = [...(x.history || []), prev];
            await putSpend(mk, items);
          } else {
            Object.assign(x, { removed: true, removedAt: new Date().toISOString(), movedTo: nk });
            await putSpend(mk, items);
            await putSpend(nk, [...clone(S.spend[nk]?.items || []), fill({ id: newId(), at: new Date().toISOString(), history: [prev] })]);
          }
          logAct(`내역 고침 · ${prev.title} ${won(prev.amount)} → ${title} ${sign}${won(amount)} (${dotDate(date)})`);
        } else {
          await putSpend(nk, [...clone(S.spend[nk]?.items || []), fill({ id: newId(), at: new Date().toISOString() })]);
          logAct(`${f.type === 'in' ? '입금' : '지출'} · ${dotDate(date)} ${title} ${sign}${won(amount)}${f.bank ? ` (${bankName(f.bank)})` : ''}`);
        }
        toast('기록했어요');
        closeSheet();
      } catch (e) { saveFail(); }
    });
  }, 'toss');
}

// 저장소의 모든 기록을 한 JSON 파일로
async function backup(btn) {
  const c = window.claude;
  const dl = c?.use ? await c.use('downloads').catch(() => null) : null;
  if (!dl || !DB) { toast('이 화면에서는 내려받을 수 없어요'); return; }
  btn.disabled = true;
  btn.textContent = '모으는 중…';
  try {
    const out = { app: '일상 매니저', exportedAt: new Date().toISOString() };
    for (const col of ['days', 'workout', 'settings', 'money', 'spend', 'transfers', 'balhist', 'savings', 'stocks', 'items', 'shopping', 'chatlog', 'log', 'chat']) {
      const snap = await DB.collection(col).get();
      out[col] = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
    }
    await dl.save({ filename: `일상매니저-백업-${TODAY}.json`, data: JSON.stringify(out, null, 2) });
    toast('백업 파일을 저장했어요');
  } catch (e) {
    if (e?.code !== 'declined') toast('내려받지 못했어요. 잠시 후 다시 해 주세요.');
  } finally {
    btn.disabled = false;
    btn.textContent = '내려받기';
  }
}

function viewFixed() {
  const M = S.money;
  return `
    <div class="view-title anim" style="--i:0">${ICON.star}<h1>고정 지출</h1></div>
    <section class="panel anim" style="--i:1">
      <div class="sh-sec">
        <div class="total"><span class="eyebrow">매달 나가는 돈</span><b class="num">${manwon(M.savings)}</b></div>
        <div class="fixed-list">
          <div class="plan-row"><span class="tile"><span class="emoji" aria-hidden="true">🏦</span></span><div><b>적금</b><small>매달 ${M.payday}일 자동이체</small></div><span class="amt num" style="color:var(--cyan)">${manwon(M.savings)}</span></div>
        </div>
      </div>
    </section>`;
}

/* ---------- 내 물건 · 필요한 물건 ---------- */
// 사진이 있는 물건은 나라사랑카드처럼 손가락을 따라 기우는 입체 카드로
function prod3dHTML(x) {
  return `<div class="card3d prod" data-card3d><div class="card3d-float"><div class="card3d-in">
    <img src="${esc(x.image)}" alt="${esc(x.name)}" draggable="false"><span class="card3d-shine" aria-hidden="true"></span>
  </div></div></div>`;
}

function viewItems() {
  const list = itemsOf(), sum = list.reduce((s, x) => s + (Number(x.price) || 0), 0);
  return `
    <div class="view-title anim" style="--i:0">${ICON.star}<h1>내 물건</h1></div>
    ${ready() ? '' : statusPanel(1)}
    <div class="toss-view items-view">
      <section class="t-card anim" style="--i:1">
        <span class="t-label">자주 쓰는 물건 ${list.length}개</span>
        <div class="t-big num">${list.length ? won(sum) : '아직 없어요'}</div>
        <span class="t-sub">${list.length ? '하나씩 다 다시 사면 드는 돈이에요' : '쓰는 물건과 가격을 넣어 두면 떨어졌을 때 바로 살 것에 넣을 수 있어요'}</span>
      </section>
      <div class="item-grid">
        ${list.map((x, i) => `<article class="t-card item-card anim" style="--i:${2 + i}" data-item="${esc(x.id)}">
          ${x.image ? prod3dHTML(x) : `<div class="item-noimg"><span class="emoji" aria-hidden="true">${esc(x.emoji || '📦')}</span></div>`}
          <b>${esc(x.name)}</b>
          ${x.sub ? `<small>${esc(x.sub)}</small>` : ''}
          <span class="num price">${x.price ? won(x.price) : '가격 없음'}</span>
        </article>`).join('')}
        <button class="item-add anim" style="--i:${2 + list.length}" data-item-add><span class="plus" aria-hidden="true">+</span><b>물건 추가</b></button>
      </div>
    </div>`;
}

function viewShopping() {
  const list = shopOf();
  const todo = list.filter(x => !x.done), done = list.filter(x => x.done);
  const sum = arr => arr.reduce((s, x) => s + (Number(x.price) || 0) * (Number(x.qty) || 1), 0);
  const groups = {};
  todo.forEach(x => (groups[x.group || '기타'] = groups[x.group || '기타'] || []).push(x));
  const row = x => `<div class="shop-row${x.done ? ' done' : ''}">
      <button class="shop-check" data-shop-check="${esc(x.id)}" aria-pressed="${!!x.done}" aria-label="${esc(x.name)} ${x.done ? '산 것 취소' : '샀어요'}">${ICON.check}</button>
      <button class="shop-main" data-shop="${esc(x.id)}">
        <b>${esc(x.name)}</b>
        <small>${[x.option, (x.qty || 1) > 1 ? `${x.qty}개` : '', x.done && x.doneAt ? `${dotDate(keyOf(new Date(x.doneAt)))} 삼` : ''].filter(Boolean).map(esc).join(' · ')}</small>
      </button>
      <span class="num amt">${won((Number(x.price) || 0) * (Number(x.qty) || 1))}</span>
    </div>`;
  return `
    <div class="view-title anim" style="--i:0">${ICON.star}<h1>필요한 물건</h1></div>
    ${ready() ? '' : statusPanel(1)}
    <div class="toss-view shop-view">
      <section class="t-card anim" style="--i:1">
        <span class="t-label">살 것 ${todo.length}개</span>
        <div class="t-big num">${won(sum(todo))}</div>
        ${done.length ? `<span class="t-sub num">이미 산 것 ${done.length}개 · ${won(sum(done))}</span>` : ''}
        <div class="t-btns"><button class="t-btn primary" data-shop-add>살 것 추가</button><button class="t-btn" data-go-items>내 물건 보기</button></div>
      </section>
      ${Object.entries(groups).map(([g, arr], i) => `<section class="t-card anim" style="--i:${2 + i}">
        <div class="t-head"><b>${esc(g)}</b><span class="num">${arr.length}</span><span class="t-mini num" style="color:var(--t-sub)">${won(sum(arr))}</span></div>
        ${arr.map(row).join('')}
      </section>`).join('')}
      ${!todo.length ? '<section class="t-card anim" style="--i:2"><p class="t-empty">살 것이 없어요</p></section>' : ''}
      ${done.length ? `<section class="t-card anim" style="--i:6"><div class="t-head"><b>산 것</b><span class="num">${done.length}</span></div>${done.map(row).join('')}</section>` : ''}
    </div>`;
}

function itemSheet(id) {
  const x = id ? (S.items.list || []).find(i => i.id === id) : null;
  openSheet(`${x?.image ? `<div class="item-hero">${prod3dHTML(x)}</div>` : `<div class="tr-head"><h3>${x ? esc(x.name) : '물건 추가'}</h3><p>자주 쓰는 물건과 가격</p></div>`}
    <div class="sh-sec"><span class="label">이름</span><input class="field" id="itName" maxlength="30" placeholder="예: 바디워시" value="${esc(x?.name || '')}"></div>
    <div class="sh-sec"><span class="label">제품</span><input class="field" id="itSub" maxlength="40" placeholder="예: 도브 리밸런싱 1000g" value="${esc(x?.sub || '')}"></div>
    <div class="sh-sec"><span class="label">가격</span><div class="numfield"><input class="field" id="itPrice" inputmode="numeric" placeholder="0" value="${x?.price ?? ''}"><span>원</span></div></div>
    ${x ? `<button class="btn" id="itOut">다 떨어졌어요 · 살 것에 넣기</button>
      <div class="btn-row"><button class="btn ghost" id="itDel">목록에서 빼기</button><button class="btn ghost" id="itSave">저장</button></div>`
      : '<button class="btn" id="itSave">넣기</button>'}`, body => {
    const $ = q => body.querySelector(q);
    $('#itPrice').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^\d]/g, ''); });
    const read = () => ({ name: $('#itName').value.trim(), sub: $('#itSub').value.trim(), price: Number($('#itPrice').value) || 0 });
    $('#itSave').addEventListener('click', async () => {
      const v = read();
      if (!v.name) { toast('이름을 넣어 주세요'); return; }
      const it = clone(S.items), now = new Date().toISOString();
      if (x) {
        const t = it.list.find(i => i.id === id);
        t.history = [...(t.history || []), { name: t.name, sub: t.sub, price: t.price, at: now }];
        Object.assign(t, v);
        logAct(`내 물건 고침 · ${v.name} ${won(v.price)}`);
      } else {
        it.list = [...(it.list || []), { id: newId(), ...v, at: now }];
        logAct(`내 물건 추가 · ${v.name} ${won(v.price)}`);
      }
      try { await putItems(it); toast('저장했어요'); closeSheet(); } catch (e) { saveFail(); }
    });
    $('#itDel')?.addEventListener('click', async () => {
      const it = clone(S.items);
      Object.assign(it.list.find(i => i.id === id), { removed: true, removedAt: new Date().toISOString() });
      try { await putItems(it); logAct(`내 물건 뺌 · ${x.name}`); toast('목록에서 뺐어요 (기록은 남아요)'); closeSheet(); } catch (e) { saveFail(); }
    });
    $('#itOut')?.addEventListener('click', async () => {
      const sh = clone(S.shopping);
      if (shopOf().some(s => s.fromItem === id && !s.done)) { toast('이미 살 것에 있어요'); return; }
      sh.list = [...(sh.list || []), { id: newId(), name: x.name, option: x.sub || '', price: x.price || 0, qty: 1, group: '생활용품', fromItem: id, done: false, at: new Date().toISOString() }];
      try { await putShopping(sh); logAct(`살 것 추가 · ${x.name} (다 떨어짐)`); toast('필요한 물건에 넣었어요'); closeSheet(); } catch (e) { saveFail(); }
    });
  }, 'toss');
}

function shopSheet(id) {
  const x = id ? (S.shopping.list || []).find(i => i.id === id) : null;
  const groups = [...new Set(['옷', '생활용품', ...shopOf().map(s => s.group).filter(Boolean)])];
  let group = x?.group || '';
  openSheet(`<div class="tr-head"><h3>${x ? '살 것 고치기' : '살 것 추가'}</h3><p>${x ? esc(x.name) : '사야 할 물건을 글로 적어 두어요'}</p></div>
    <div class="sh-sec"><span class="label">이름</span><input class="field" id="spName" maxlength="60" placeholder="예: 크롭 후드 집업" value="${esc(x?.name || '')}"></div>
    <div class="sh-sec"><span class="label">옵션</span><input class="field" id="spOpt" maxlength="40" placeholder="예: 그레이 / FREE" value="${esc(x?.option || '')}"></div>
    <div class="sav-grid">
      <label>가격<span class="numfield"><input class="field" id="spPrice" inputmode="numeric" placeholder="0" value="${x?.price ?? ''}"><span>원</span></span></label>
      <label>수량<span class="numfield"><input class="field" id="spQty" inputmode="numeric" value="${x?.qty ?? 1}"><span>개</span></span></label>
    </div>
    <div class="sh-sec"><span class="label">묶음</span><div class="parts" id="spGroup">${groups.map(g => `<button class="pchip" data-g="${esc(g)}" aria-pressed="${g === group}">${esc(g)}</button>`).join('')}</div></div>
    <div class="${x ? 'btn-row' : ''}">${x ? '<button class="btn ghost" id="spDel">목록에서 빼기</button>' : ''}<button class="btn" id="spSave">${x ? '저장' : '넣기'}</button></div>`, body => {
    const $ = q => body.querySelector(q);
    ['#spPrice', '#spQty'].forEach(q => $(q).addEventListener('input', e => { e.target.value = e.target.value.replace(/[^\d]/g, ''); }));
    $('#spGroup').addEventListener('click', e => {
      const b = e.target.closest('[data-g]'); if (!b) return;
      group = group === b.dataset.g ? '' : b.dataset.g;
      body.querySelectorAll('#spGroup [data-g]').forEach(g => g.setAttribute('aria-pressed', g.dataset.g === group));
    });
    $('#spSave').addEventListener('click', async () => {
      const v = { name: $('#spName').value.trim(), option: $('#spOpt').value.trim(), price: Number($('#spPrice').value) || 0, qty: Math.max(1, Number($('#spQty').value) || 1), group };
      if (!v.name) { toast('이름을 넣어 주세요'); return; }
      const sh = clone(S.shopping), now = new Date().toISOString();
      if (x) {
        const t = sh.list.find(i => i.id === id);
        t.history = [...(t.history || []), { name: t.name, option: t.option, price: t.price, qty: t.qty, group: t.group, at: now }];
        Object.assign(t, v);
        logAct(`살 것 고침 · ${v.name} ${won(v.price * v.qty)}`);
      } else {
        sh.list = [...(sh.list || []), { id: newId(), ...v, done: false, at: now }];
        logAct(`살 것 추가 · ${v.name}${v.option ? ` (${v.option})` : ''} ${won(v.price * v.qty)}`);
      }
      try { await putShopping(sh); toast('저장했어요'); closeSheet(); } catch (e) { saveFail(); }
    });
    $('#spDel')?.addEventListener('click', async () => {
      const sh = clone(S.shopping);
      Object.assign(sh.list.find(i => i.id === id), { removed: true, removedAt: new Date().toISOString() });
      try { await putShopping(sh); logAct(`살 것 뺌 · ${x.name}`); toast('목록에서 뺐어요 (기록은 남아요)'); closeSheet(); } catch (e) { saveFail(); }
    });
  }, 'toss');
}

async function toggleShop(id, btn) {
  const sh = clone(S.shopping), t = sh.list.find(i => i.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) { t.doneAt = new Date().toISOString(); celebrate(btn, 0); } else delete t.doneAt;
  try { await putShopping(sh); logAct(`${t.done ? '샀어요' : '산 것 취소'} · ${t.name} ${won((t.price || 0) * (t.qty || 1))}`); } catch (e) { saveFail(); }
}

function viewSoon(item) {
  return `
    <div class="view-title anim" style="--i:0">${ICON.star}<h1>${item.name}</h1></div>
    <section class="panel soon anim" style="--i:1">
      <span class="emoji big" aria-hidden="true">${item.emoji}</span>
      <p class="empty">아직 비어 있어요</p>
    </section>`;
}

/* ---------- 매니저 패널 ---------- */
let seenMsgs = 0;
function msgHTML(m, fresh) {
  const me = m.role === 'user';
  const acts = (m.actions || []).map(a => `<span class="chip soft">${esc(a)}</span>`).join('');
  const undo = !me && UI.undo[m.at] ? `<button class="undo" data-undo="${m.at}">되돌리기</button>` : '';
  return `<div class="msg${me ? ' me' : ''}${fresh ? ' pop-in' : ''}">
    ${me ? '' : `<span class="av">${ICON.starPlain}</span>`}
    <div style="min-width:0">
      <div class="bubble">${esc(m.content)}</div>
      ${acts || undo ? `<div class="acts">${acts}${undo}</div>` : ''}
    </div>
  </div>`;
}

function chatHTML() {
  const list = allChat().slice(-40);
  let html = '';
  if (UI.sample === false) {
    html += '<p class="empty">이 화면에서는 매니저를 부를 수 없어요. claude.ai에서 열어 주세요.</p>';
  } else if (!list.length && !UI.pending) {
    html += msgHTML({ role: 'assistant', content: '넣을 걸 말해 주세요.\n할 일 추가·체크, 운동 루틴, 통장 잔액처럼 말하면 그 자리에 넣어 둘게요.' }, true);
  }
  list.forEach((m, i) => { html += msgHTML(m, i >= seenMsgs); });
  seenMsgs = list.length;
  if (UI.pending) {
    html += msgHTML({ role: 'user', content: UI.pending.user }, false);
    html += `<div class="msg"><span class="av">${ICON.starPlain}</span><div style="min-width:0"><div class="bubble" id="liveBubble">${UI.pending.text ? esc(UI.pending.text) : '<span class="thinking" aria-label="생각 중"><i></i><i></i><i></i></span>'}</div>
      ${UI.pending.acts.length ? `<div class="acts">${UI.pending.acts.map(a => `<span class="chip soft">${esc(a)}</span>`).join('')}</div>` : ''}</div></div>`;
  }
  return html;
}

const $mgr = document.getElementById('mgr');
const $mgrList = document.getElementById('mgrList');
function paintChat() {
  $mgrList.innerHTML = chatHTML();
  chatToBottom(true);
}
function openChat() {
  if ($mgr.classList.contains('open')) { $input.focus(); return; }
  const r = $fab.getBoundingClientRect();
  $mgr.style.setProperty('--fx', `${r.left + r.width / 2}px`);
  $mgr.style.setProperty('--fy', `${r.top + r.height / 2}px`);
  paintChat();
  $mgr.classList.add('open');
  $mgr.inert = false;
  $fab.setAttribute('aria-expanded', 'true');
  $fab.classList.add('on');
  if (matchMedia('(max-width: 959px)').matches) document.documentElement.style.overflow = 'hidden';
  setTimeout(() => $input.focus({ preventScroll: true }), 120);
}
// 휴대폰 키보드가 올라오면 대화창을 그 위로 올린다
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => $mgr.style.setProperty('--kb', `${Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop))}px`);
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
}
function closeChat() {
  if (!$mgr.classList.contains('open')) return;
  $mgr.classList.remove('open');
  $mgr.inert = true;
  $fab.setAttribute('aria-expanded', 'false');
  $fab.classList.remove('on');
  document.documentElement.style.overflow = '';
  $input.blur();
}

/* ---------- 그리기 ---------- */
const $view = document.getElementById('view');
const $fab = document.getElementById('fab');

function countUp(root) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count, suf = el.dataset.suffix || '';
    if (reduce) { el.textContent = to + suf; return; }
    const t0 = performance.now() + 250, dur = 1100;
    const step = t => {
      const p = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(to * e);
      el.textContent = (el.dataset.fmt === 'won' ? v.toLocaleString('ko-KR') : v) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll('.ring .fg').forEach(c => (c.style.strokeDashoffset = c.dataset.off));
  }));
}

const routeId = () => (MENU.some(x => x.id !== 'chat' && x.id === location.hash.slice(1)) ? location.hash.slice(1) : 'today');

function renderView(id) {
  const item = MENU.find(x => x.id === id);
  return id === 'today' ? viewToday() : id === 'archive' ? viewArchive() : id === 'money' ? viewMoney()
    : id === 'fixed' ? viewFixed() : id === 'items' ? viewItems() : id === 'shopping' ? viewShopping() : viewSoon(item);
}

// mode: enter(등장 애니메이션) | update(제자리 갱신) | route(화면 전환)
function paint(mode = 'enter') {
  const id = routeId();
  const item = MENU.find(x => x.id === id);
  const run = still => {
    const sy = scrollY;
    const rows = [...$view.querySelectorAll('.qrow')].map(r => r.scrollLeft);
    UI.still = still;
    $view.classList.toggle('still', still);
    $view.classList.remove('leave');
    $view.innerHTML = renderView(id);
    UI.view = id;
    document.title = id === 'today' ? '일상 매니저' : `${item.name} · 일상 매니저`;
    document.querySelectorAll('.menu nav a').forEach(a => (a.dataset.id === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (still) {
      scrollTo(0, sy);
      $view.querySelectorAll('.qrow').forEach((r, i) => { if (rows[i] != null) r.scrollLeft = rows[i]; });
    } else countUp($view);
    UI.still = false;
    paintHud();
  };
  if (mode === 'route' && UI.view && !reduce) {
    $view.classList.add('leave');
    setTimeout(() => { run(false); scrollTo(0, 0); }, 220);
  } else run(mode === 'update');
}

let pendingRefresh = false;
function refresh(forceEnter) {
  if (pendingRefresh) return;
  pendingRefresh = true;
  requestAnimationFrame(() => {
    pendingRefresh = false;
    if (forceEnter || (!UI.dataPainted && ready())) { if (ready()) UI.dataPainted = true; paint('enter'); }
    else paint('update');
  });
}

function paintHud() {
  const xp = totalXp();
  const lv = Math.floor(xp / XP_PER_LEVEL) + 1, into = xp % XP_PER_LEVEL;
  document.getElementById('lvNum').textContent = lv;
  document.getElementById('lvLabel').textContent = `LV.${lv}`;
  document.getElementById('xpText').textContent = `${into} / ${XP_PER_LEVEL} XP`;
  document.getElementById('streak').textContent = streak();
  requestAnimationFrame(() => (document.getElementById('xpFill').style.width = `${(into / XP_PER_LEVEL) * 100}%`));
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 2700);
}

function celebrate(el, xp) {
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  window.FX?.burst(x, y, 22);
  const f = document.createElement('div');
  f.className = 'xp-float';
  f.textContent = `+${xp} XP`;
  f.style.left = `${x}px`;
  f.style.top = `${y - 16}px`;
  document.body.append(f);
  setTimeout(() => f.remove(), 1000);
}

/* ---------- 할 일 바꾸기 ---------- */
async function setTodo(date, id, patch) {
  const todos = clone(rawTodos(date));
  const t = todos.find(x => x.id === id);
  if (!t) return;
  Object.assign(t, patch);
  return putDay(date, todos);
}

async function toggleDone(card) {
  const date = card.dataset.date, id = card.dataset.id;
  const t = todosOf(date).find(x => x.id === id);
  if (!t) return;
  if (date > TODAY) { toast('그날이 되면 체크할 수 있어요'); return; }
  if (isFailed(t, date)) return;
  if (t.kind === 'thanks') { openTask(date, id); return; }
  const done = !t.done;
  if (done) celebrate(card.querySelector('.q-check') || card, xpOfTask(t));
  const saving = setTodo(date, id, { done });
  logAct(`${done ? '체크' : '체크 해제'} · ${dotDate(date)} ${t.title}`);
  if (done) requestAnimationFrame(() => requestAnimationFrame(() =>
    $view.querySelector(`.qcard[data-id="${CSS.escape(id)}"][data-date="${date}"]`)?.classList.add('just')));
  try { await saving; } catch (e) { saveFail(); }
}

/* ---------- 상세 시트 ---------- */
const $sheet = document.getElementById('sheet');
const $sheetBody = document.getElementById('sheetBody');
let sheetTick = null;
function openSheet(html, mount, cls = '') {
  $sheetBody.className = `sheet${cls ? ` ${cls}` : ''}`;
  $sheetBody.innerHTML = `<div class="grip" aria-hidden="true"></div>${html}`;
  $sheet.classList.add('open');
  $sheet.inert = false;
  document.documentElement.style.overflow = 'hidden';
  mount?.($sheetBody);
  setTimeout(() => $sheetBody.querySelector('input:not(:disabled), textarea:not(:disabled), button')?.focus({ preventScroll: true }), 300);
}
function closeSheet() {
  $sheet.classList.remove('open');
  $sheet.inert = true;
  document.documentElement.style.overflow = '';
  clearInterval(sheetTick);
}
$sheet.querySelector('.scrim').addEventListener('click', closeSheet);

const sheetHead = (t, date, i) => `<div class="sh-head" style="--c:${PAL[i % PAL.length]}">
  <span class="q-icon"><span class="emoji" aria-hidden="true">${esc(t.emoji || '📌')}</span></span>
  <div><h3>${esc(t.title)}</h3><p class="num">${dotDate(date)} ${dowOf(date)}${t.minutes ? ` · ${fmtMin(t.minutes)}` : ''}</p></div>
</div>`;

function openTask(date, id) {
  const todos = todosOf(date), i = todos.findIndex(x => x.id === id), t = todos[i];
  if (!t) return;
  if (t.kind === 'thanks') return thanksSheet(date, t, i);
  if (t.kind === 'dev') return devSheet(date, t, i);
  if (t.kind === 'workout') return workoutSheet(date, t, i);
}

function thanksSheet(date, t, i) {
  const failed = isFailed(t, date), open = date === TODAY, items = t.items || [];
  const banner = failed ? '<div class="banner fail">자정이 지나 탈락했어요</div>'
    : t.done && !open ? '<div class="banner ok">다 적은 날이에요</div>'
    : date > TODAY ? '<div class="banner due">그날이 되면 적을 수 있어요</div>'
    : `<div class="banner due" data-due>자정까지 ${untilMidnight()} 남았어요 · 지나면 탈락</div>`;
  openSheet(`${sheetHead({ ...t, title: '감사한 점 3가지' }, date, i)}${banner}
    <div class="sh-sec">${[0, 1, 2].map(n => `
      <label class="lined"><b>${n + 1}</b><input class="field" id="thx${n}" maxlength="140" value="${esc(items[n] || '')}" ${open ? '' : 'disabled'} placeholder="${open ? '오늘 고마웠던 일' : ''}"></label>`).join('')}
    </div>
    ${open ? '<button class="btn" id="thxSave">저장</button>' : '<button class="btn ghost" id="thxClose">닫기</button>'}`, body => {
    sheetTick = setInterval(() => {
      const el = body.querySelector('[data-due]');
      if (el) el.textContent = `자정까지 ${untilMidnight()} 남았어요 · 지나면 탈락`;
    }, 30000);
    body.querySelector('#thxClose')?.addEventListener('click', closeSheet);
    body.querySelector('#thxSave')?.addEventListener('click', async e => {
      if (keyOf(new Date()) !== date) { toast('자정이 지나 저장할 수 없어요'); closeSheet(); return; }
      const vals = [0, 1, 2].map(n => body.querySelector(`#thx${n}`).value.trim());
      const done = vals.every(Boolean);
      const was = t.done;
      try {
        if (done && !was) celebrate(e.currentTarget, xpOfTask(t));
        await setTodo(date, t.id, { items: vals, done });
        logAct(`감사한 점 · ${dotDate(date)}\n${vals.map((v, n) => `${n + 1}. ${v || '(빈칸)'}`).join('\n')}`);
        toast(done ? '감사한 점을 다 적었어요' : `${vals.filter(Boolean).length}/3 저장했어요`);
        closeSheet();
      } catch (err) { saveFail(); }
    });
  });
}

function doneButton(date, t) {
  if (date > TODAY) return '';
  return `<button class="btn ghost" id="doneToggle">${t.done ? '완료 취소' : '완료로 표시'}</button>`;
}

function devSheet(date, t, i) {
  openSheet(`${sheetHead(t, date, i)}
    <div class="sh-sec"><span class="label">무엇을 할지</span>
      <textarea class="area" id="devNote" maxlength="600" placeholder="예: 저장소 화면에 월별 그래프 넣기">${esc(t.note || '')}</textarea></div>
    <div class="${date > TODAY ? '' : 'btn-row'}">${doneButton(date, t)}<button class="btn" id="devSave">저장</button></div>
    <button class="linkbtn" data-retodo>할 일 이름·시간 고치기</button>`, body => {
    body.querySelector('[data-retodo]').addEventListener('click', () => todoForm(date, t.id));
    let done = !!t.done;
    body.querySelector('#doneToggle')?.addEventListener('click', e => {
      done = !done;
      e.currentTarget.textContent = done ? '완료 취소' : '완료로 표시';
      if (done) celebrate(e.currentTarget, xpOfTask(t));
    });
    body.querySelector('#devSave').addEventListener('click', async () => {
      try {
        const note = body.querySelector('#devNote').value.trim();
        await setTodo(date, t.id, { note, done });
        logAct(`사이트 개발 · ${dotDate(date)}${done !== !!t.done ? (done ? ' 완료' : ' 완료 취소') : ''}${note ? `\n${note}` : ''}`);
        toast('저장했어요');
        closeSheet();
      } catch (e) { saveFail(); }
    });
  });
}

function partsHTML(name, current) {
  const opts = PARTS.includes(current) ? PARTS : [...PARTS, current];
  return `<div class="parts" data-parts="${name}">${opts.map(p => `<button class="pchip" data-part="${esc(p)}" aria-pressed="${p === current}">${esc(p)}</button>`).join('')}</div>`;
}

function workoutSheet(date, t, i) {
  const tk = shiftKey(date, 1);
  const split = { ...S.split };
  const relName = date === TODAY ? '오늘' : dotDate(date);
  const showTomorrow = date >= TODAY;
  openSheet(`${sheetHead(t, date, i)}
    <div class="sh-sec"><span class="label">${relName} 부위</span>${partsHTML('a', partOf(date))}
      <textarea class="area" id="planA" maxlength="600" placeholder="예: 벤치프레스 5세트, 딥스 3세트">${esc(S.workout[date]?.plan || '')}</textarea></div>
    ${showTomorrow ? `<div class="sh-sec"><span class="label">다음 날 루틴 · ${dotDate(tk)} ${dowOf(tk)}</span>${partsHTML('b', partOf(tk))}
      <textarea class="area" id="planB" maxlength="600" placeholder="다음 날 할 운동">${esc(S.workout[tk]?.plan || '')}</textarea></div>` : ''}
    <div class="sh-sec"><span class="label">주간 루틴 · 눌러서 바꾸기</span>
      <div class="week7">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button data-wd="${d}" class="${parseKey(TODAY).getDay() === d ? 'today' : ''}">${DAY[d]}<b>${esc(split[d])}</b></button>`).join('')}</div></div>
    <div class="${date > TODAY ? '' : 'btn-row'}">${doneButton(date, t)}<button class="btn" id="woSave">저장</button></div>
    <button class="linkbtn" data-retodo>할 일 이름·시간 고치기</button>`, body => {
    body.querySelector('[data-retodo]').addEventListener('click', () => todoForm(date, t.id));
    let done = !!t.done, splitChanged = false;
    const pick = { a: partOf(date), b: partOf(tk) };
    body.querySelectorAll('[data-parts]').forEach(group => group.addEventListener('click', e => {
      const b = e.target.closest('[data-part]');
      if (!b) return;
      pick[group.dataset.parts] = b.dataset.part;
      group.querySelectorAll('[data-part]').forEach(x => x.setAttribute('aria-pressed', x === b));
    }));
    body.querySelectorAll('[data-wd]').forEach(b => b.addEventListener('click', () => {
      const d = b.dataset.wd, n = (PARTS.indexOf(split[d]) + 1) % PARTS.length;
      split[d] = PARTS[n];
      b.querySelector('b').textContent = split[d];
      splitChanged = true;
    }));
    body.querySelector('#doneToggle')?.addEventListener('click', e => {
      done = !done;
      e.currentTarget.textContent = done ? '완료 취소' : '완료로 표시';
      if (done) celebrate(e.currentTarget, xpOfTask(t));
    });
    body.querySelector('#woSave').addEventListener('click', async () => {
      try {
        const planA = body.querySelector('#planA').value.trim(), planB = body.querySelector('#planB')?.value.trim() || '';
        if (splitChanged) await putSplit(split);
        await putWorkout(date, { part: pick.a, plan: planA });
        if (showTomorrow) await putWorkout(tk, { part: pick.b, plan: planB });
        if (done !== !!t.done) await setTodo(date, t.id, { done });
        logAct([`운동 · ${dotDate(date)} ${pick.a}${done !== !!t.done ? (done ? ' 완료' : ' 완료 취소') : ''}${planA ? `: ${planA}` : ''}`,
          showTomorrow ? `다음 날 ${dotDate(tk)} ${pick.b}${planB ? `: ${planB}` : ''}` : '',
          splitChanged ? `주간 루틴 ${[1, 2, 3, 4, 5, 6, 0].map(d => `${DAY[d]} ${split[d]}`).join(', ')}` : ''].filter(Boolean).join('\n'));
        toast('운동 루틴을 저장했어요');
        closeSheet();
      } catch (e) { saveFail(); }
    });
  });
}

const EMOJIS = ['📌', '⚡', '📚', '💻', '💪', '🧘', '🏃', '😴', '💌', '✍️', '🧹', '🎯', '🍎', '💊', '🎧', '📞'];
const TIMES = [0, 10, 30, 60, 90, 120, 180];
const KINDS = [
  { id: 'normal', name: '일반' },
  { id: 'dev', name: '사이트 개발', title: '사이트 개발', emoji: '💻' },
  { id: 'workout', name: '운동', title: '운동', emoji: '💪' },
  { id: 'thanks', name: '감사한 점', title: '감사한 점 적기', emoji: '💌', amount: '3개' },
];

// 지금까지 자주 넣은 할 일(이름 기준)
function frequentTodos(exceptDate) {
  const seen = {};
  for (const d of Object.keys(S.days).sort()) {
    for (const t of todosOf(d)) {
      if (t.title === '나머지 할 일') continue;
      const k = t.title;
      seen[k] = { n: (seen[k]?.n || 0) + 1, t: { title: t.title, emoji: t.emoji, minutes: t.minutes, amount: t.amount, kind: t.kind } };
    }
  }
  const have = new Set(todosOf(exceptDate).map(t => t.title));
  return Object.values(seen).filter(x => !have.has(x.t.title)).sort((a, b) => b.n - a.n).slice(0, 8).map(x => x.t);
}

async function copyDay(from, to) {
  const have = new Set(todosOf(to).map(t => t.title));
  const add = todosOf(from).filter(t => !have.has(t.title) && t.title !== '나머지 할 일').map(t => {
    const n = { id: newId(), emoji: t.emoji, title: t.title, done: false };
    for (const k of ['minutes', 'amount', 'kind']) if (t[k]) n[k] = t[k];
    if (t.kind === 'thanks') n.items = [];
    return n;
  });
  if (!add.length) { toast('가져올 할 일이 없어요'); return; }
  try {
    await putDay(to, [...clone(rawTodos(to)), ...add]);
    logAct(`할 일 가져오기 · ${dotDate(from)} → ${dotDate(to)}\n${add.map(t => t.title).join(', ')}`);
    toast(`${add.length}개를 ${dotDate(to)}에 넣었어요`);
  } catch (e) { saveFail(); }
}

function todoForm(date, id) {
  const cur = id ? rawTodos(date).find(x => x.id === id) : null;
  const f = { date, kind: cur?.kind || 'normal', emoji: cur?.emoji || '📌', minutes: cur?.minutes || 0 };
  const dayChips = [TODAY, shiftKey(TODAY, 1), shiftKey(TODAY, 2)];
  if (!dayChips.includes(date)) dayChips.push(date);
  const rel = { [TODAY]: '오늘', [shiftKey(TODAY, 1)]: '내일', [shiftKey(TODAY, 2)]: '모레' };
  const freq = cur ? [] : frequentTodos(date);
  openSheet(`<div class="sh-head" style="--c:var(--violet)"><span class="q-icon"><span class="emoji" aria-hidden="true" id="tfIcon">${esc(f.emoji)}</span></span>
      <div><h3>${cur ? '할 일 고치기' : '할 일 추가'}</h3><p class="num" id="tfDay">${dotDate(date)} ${dowOf(date)}</p></div></div>
    ${freq.length ? `<div class="sh-sec"><span class="label">자주 하는 할 일</span><div class="parts" id="tfFreq">${freq.map((t, n) =>
      `<button class="pchip" data-fq="${n}"><span class="emoji" aria-hidden="true">${esc(t.emoji || '📌')}</span> ${esc(t.title)}${t.minutes ? ` · ${fmtMin(t.minutes)}` : ''}</button>`).join('')}</div></div>` : ''}
    ${cur ? '' : `<div class="sh-sec"><span class="label">날짜</span><div class="parts" id="tfDate">${dayChips.map(d =>
      `<button class="pchip" data-d="${d}" aria-pressed="${d === date}">${rel[d] ? `${rel[d]} ` : ''}${dotDate(d)}</button>`).join('')}</div></div>`}
    <div class="sh-sec"><span class="label">종류</span><div class="parts" id="tfKind">${KINDS.map(k =>
      `<button class="pchip" data-k="${k.id}" aria-pressed="${k.id === f.kind}">${k.name}</button>`).join('')}</div></div>
    <div class="sh-sec"><span class="label">이름</span><input class="field" id="tfTitle" maxlength="40" placeholder="예: 전기 공부" value="${esc(cur?.title || '')}"></div>
    <div class="sh-sec"><span class="label">아이콘</span><div class="emo-grid" id="tfEmoji">${EMOJIS.map(e =>
      `<button class="emo" data-e="${e}" aria-pressed="${e === f.emoji}" aria-label="${e}"><span class="emoji">${e}</span></button>`).join('')}</div></div>
    <div class="sh-sec"><span class="label">걸리는 시간</span><div class="parts" id="tfTime">${TIMES.map(m =>
      `<button class="pchip" data-m="${m}" aria-pressed="${m === f.minutes}">${m ? fmtMin(m) : '없음'}</button>`).join('')}</div>
      <div class="numfield"><input class="field" id="tfMin" inputmode="numeric" placeholder="직접 입력" value="${f.minutes && !TIMES.includes(f.minutes) ? f.minutes : ''}"><span>분</span></div></div>
    <div class="sh-sec"><span class="label">양 (시간이 아닌 것)</span><input class="field" id="tfAmt" maxlength="20" placeholder="예: 3개, 조금" value="${esc(cur?.amount || '')}"></div>
    ${cur ? '<div class="btn-row"><button class="btn ghost" id="tfRemove">할 일 빼기</button><button class="btn" id="tfSave">저장</button></div>'
      : '<div class="btn-row"><button class="btn ghost" id="tfMore">넣고 하나 더</button><button class="btn" id="tfSave">넣기</button></div>'}`, body => {
    const $ = q => body.querySelector(q);
    const press = (box, attr, val) => box?.querySelectorAll(`[${attr}]`).forEach(x => x.setAttribute('aria-pressed', x.getAttribute(attr) === String(val)));
    const setEmoji = e => { f.emoji = e; $('#tfIcon').textContent = e; press($('#tfEmoji'), 'data-e', e); };
    const setMin = m => { f.minutes = m; press($('#tfTime'), 'data-m', m); if (TIMES.includes(m)) $('#tfMin').value = ''; };
    $('#tfDate')?.addEventListener('click', e => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      f.date = b.dataset.d; press($('#tfDate'), 'data-d', f.date);
      $('#tfDay').textContent = `${dotDate(f.date)} ${dowOf(f.date)}`;
    });
    $('#tfKind').addEventListener('click', e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const prev = KINDS.find(k => k.id === f.kind), k = KINDS.find(x => x.id === b.dataset.k);
      f.kind = k.id; press($('#tfKind'), 'data-k', k.id);
      const title = $('#tfTitle');
      if (k.title && (!title.value || title.value === prev?.title)) title.value = k.title;
      if (k.emoji) setEmoji(k.emoji);
      if (k.amount && !$('#tfAmt').value) $('#tfAmt').value = k.amount;
      if (k.id === 'thanks') setMin(0);
    });
    $('#tfEmoji').addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (b) setEmoji(b.dataset.e); });
    $('#tfTime').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) setMin(Number(b.dataset.m)); });
    $('#tfMin').addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[^\d]/g, '');
      f.minutes = Number(e.target.value) || 0;
      press($('#tfTime'), 'data-m', TIMES.includes(f.minutes) ? f.minutes : 'x');
    });
    $('#tfFreq')?.addEventListener('click', e => {
      const b = e.target.closest('[data-fq]'); if (!b) return;
      const t = freq[Number(b.dataset.fq)];
      $('#tfTitle').value = t.title;
      $('#tfAmt').value = t.amount || '';
      setEmoji(t.emoji || '📌');
      setMin(t.minutes || 0);
      if (!TIMES.includes(t.minutes || 0)) $('#tfMin').value = t.minutes;
      f.kind = t.kind || 'normal'; press($('#tfKind'), 'data-k', f.kind);
    });
    const read = () => {
      const title = $('#tfTitle').value.trim();
      if (!title) { toast('이름을 넣어 주세요'); $('#tfTitle').focus(); return null; }
      const t = { emoji: f.emoji, title };
      if (f.minutes > 0) t.minutes = f.minutes;
      const amt = $('#tfAmt').value.trim();
      if (amt) t.amount = amt;
      if (f.kind !== 'normal') t.kind = f.kind;
      return t;
    };
    const save = async more => {
      const v = read(); if (!v) return;
      const d = f.date;
      if (v.kind === 'thanks') {
        if (d < TODAY) { toast('지난 날에는 감사한 점을 넣을 수 없어요'); return; }
        if (todosOf(d).some(t => t.kind === 'thanks' && t.id !== cur?.id)) { toast('그날에는 이미 감사한 점이 있어요'); return; }
      }
      try {
        if (cur) {
          const todos = clone(rawTodos(date)), x = todos.find(t => t.id === cur.id);
          const prev = { title: x.title, emoji: x.emoji, minutes: x.minutes, amount: x.amount, kind: x.kind };
          for (const k of ['minutes', 'amount', 'kind']) delete x[k];
          Object.assign(x, v, { history: [...(x.history || []), { ...prev, at: new Date().toISOString() }] });
          if (v.kind === 'thanks' && !x.items) x.items = [];
          await putDay(date, todos);
          logAct(`할 일 고침 · ${dotDate(date)} ${prev.title}${prev.minutes ? ` ${fmtMin(prev.minutes)}` : ''} → ${v.title}${v.minutes ? ` ${fmtMin(v.minutes)}` : ''}`);
          toast('고쳤어요');
          closeSheet();
        } else {
          const t = { id: newId(), ...v, done: false };
          if (t.kind === 'thanks') t.items = [];
          await putDay(d, [...clone(rawTodos(d)), t]);
          logAct(`할 일 추가 · ${dotDate(d)} ${t.title}${t.minutes ? ` ${fmtMin(t.minutes)}` : ''}${t.amount ? ` ${t.amount}` : ''}`);
          window.FX?.burst(innerWidth / 2, innerHeight * 0.7, 14);
          if (more) {
            toast(`${dotDate(d)}에 넣었어요 · 이어서 넣으세요`);
            $('#tfTitle').value = ''; $('#tfAmt').value = ''; $('#tfMin').value = '';
            setMin(0); setEmoji('📌'); f.kind = 'normal'; press($('#tfKind'), 'data-k', 'normal');
            $('#tfTitle').focus();
          } else { toast(`${dotDate(d)}에 넣었어요`); closeSheet(); }
        }
      } catch (e) { saveFail(); }
    };
    $('#tfSave').addEventListener('click', () => save(false));
    $('#tfMore')?.addEventListener('click', () => save(true));
    $('#tfRemove')?.addEventListener('click', async () => {
      const todos = clone(rawTodos(date));
      Object.assign(todos.find(t => t.id === cur.id), { removed: true, removedAt: new Date().toISOString() });
      try { await putDay(date, todos); logAct(`할 일 뺌 · ${dotDate(date)} ${cur.title}`); toast('목록에서 뺐어요 (기록은 남아요)'); closeSheet(); } catch (e) { saveFail(); }
    });
  });
}

function balanceSheet(bankId) {
  const b = BANKS.find(x => x.id === bankId), v = S.money.balances[bankId];
  openSheet(`<div class="sh-head"><span class="q-icon bank-q" style="--c:${b.color}">${bankLogo(b)}</span>
      <div><h3>${b.name}</h3><p>잔액</p></div></div>
    <div class="numfield"><input class="field" id="balIn" inputmode="numeric" placeholder="0" value="${v == null ? '' : v}"><span>원</span></div>
    <button class="btn" id="balSave">저장</button>`, body => {
    const input = body.querySelector('#balIn');
    input.addEventListener('input', () => { input.value = input.value.replace(/[^\d]/g, ''); });
    body.querySelector('#balSave').addEventListener('click', async () => {
      const raw = input.value.trim();
      try { await setBalance(bankId, raw === '' ? null : Number(raw)); toast(`${b.name} 잔액을 저장했어요`); closeSheet(); } catch (e) { saveFail(); }
    });
  }, 'toss');
}

/* ---------- 화면 안 클릭 ---------- */
$view.addEventListener('click', e => {
  if (e.target.closest('[data-chat]')) { openChat(); return; }
  const shift = e.target.closest('[data-shift]');
  if (shift) {
    const n = +shift.dataset.shift, scope = shift.dataset.scope, home = scope === 'home';
    const [ky, km] = home ? ['y', 'm'] : scope === 'money' ? ['my', 'mm'] : ['ay', 'am'];
    UI[km] += n;
    if (UI[km] < 0) { UI[km] = 11; UI[ky]--; }
    if (UI[km] > 11) { UI[km] = 0; UI[ky]++; }
    if (home) {
      document.getElementById('calHead').innerHTML = calHeadHTML();
      document.getElementById('cal').innerHTML = calHTML(UI.y, UI.m, UI.sel, true);
    } else paint('enter');
    return;
  }
  const day = e.target.closest('.mcal [data-k]');
  if (day) {
    if (UI.sel === day.dataset.k) return;
    UI.sel = day.dataset.k;
    UI.edit = null;
    $view.classList.remove('still');
    $view.querySelectorAll('.mcal [data-k]').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === UI.sel));
    const area = document.getElementById('dayArea');
    area.innerHTML = dayAreaHTML();
    countUp(area);
    return;
  }
  const check = e.target.closest('[data-check]');
  if (check) { e.stopPropagation(); if (!check.disabled) toggleDone(check.closest('.qcard')); return; }
  const add = e.target.closest('[data-add]');
  if (add) { todoForm(add.dataset.add, null); return; }
  const copy = e.target.closest('[data-copy]');
  if (copy) { const [from, to] = copy.dataset.copy.split('>'); copyDay(from, to); return; }
  const et = e.target.closest('[data-edit-toggle]');
  if (et) {
    UI.edit = UI.edit === et.dataset.editToggle ? null : et.dataset.editToggle;
    const area = document.getElementById('dayArea');
    if (area) { $view.classList.add('still'); UI.still = true; area.innerHTML = dayAreaHTML(); UI.still = false; }
    return;
  }
  const card = e.target.closest('.qcard');
  if (card) {
    const date = card.dataset.date, t = todosOf(date).find(x => x.id === card.dataset.id);
    if (!t) return;
    if (UI.edit === date || (date > TODAY && !['dev', 'workout'].includes(t.kind))) todoForm(date, t.id);
    else if (['thanks', 'dev', 'workout'].includes(t.kind)) openTask(date, t.id);
    else toggleDone(card);
    return;
  }
  const acct = e.target.closest('[data-acct]');
  if (acct) { accountSheet(acct.dataset.acct); return; }
  const addEx = e.target.closest('[data-add-expense]');
  if (addEx) { expenseSheet(addEx.dataset.addExpense || TODAY.slice(0, 7), null); return; }
  if (e.target.closest('[data-bal-all]')) { balanceAllSheet(); return; }
  if (e.target.closest('[data-item-add]')) { itemSheet(null); return; }
  const itc = e.target.closest('[data-item]');
  if (itc) { if (suppressClick) { suppressClick = false; return; } itemSheet(itc.dataset.item); return; }
  if (e.target.closest('[data-shop-add]')) { shopSheet(null); return; }
  if (e.target.closest('[data-go-items]')) { location.hash = '#items'; return; }
  const sc = e.target.closest('[data-shop-check]');
  if (sc) { toggleShop(sc.dataset.shopCheck, sc); return; }
  const sp = e.target.closest('[data-shop]');
  if (sp) { shopSheet(sp.dataset.shop); return; }
  const trf = e.target.closest('[data-transfer]');
  if (trf) { transferSheet(trf.dataset.transfer || null); return; }
  const trr = e.target.closest('[data-tr]');
  if (trr) { const [m, id] = trr.dataset.tr.split('|'); transferDetailSheet(m, id); return; }
  if (e.target.closest('[data-savings]')) { savingsSheet(); return; }
  if (e.target.closest('[data-stock]')) { stockSheet(); return; }
  const ac = e.target.closest('[data-add-card]');
  if (ac) { expenseSheet(ac.dataset.addCard === TODAY.slice(0, 7) ? ac.dataset.addCard : TODAY.slice(0, 7), null, 'shinhan', 'card'); return; }
  const cs = e.target.closest('[data-card-sort]');
  if (cs) { cardSortSheet(cs.dataset.cardSort); return; }
  if (e.target.closest('[data-capture]')) { $file.click(); return; }
  const exp = e.target.closest('[data-exp]');
  if (exp) { const [mk, id] = exp.dataset.exp.split('|'); expenseSheet(mk, id); return; }
  const mm = e.target.closest('[data-money-month]');
  if (mm) { const [y, m] = mm.dataset.moneyMonth.split('-').map(Number); UI.my = y; UI.mm = m - 1; location.hash = '#money'; return; }
  const bk = e.target.closest('[data-backup]');
  if (bk) { backup(bk); return; }
});
let cardDrag = null, dragFrom = null, suppressClick = false;
$view.addEventListener('pointerdown', e => {
  const c = e.target.closest('[data-card3d]');
  if (!c) return;
  cardDrag = c;
  dragFrom = [e.clientX, e.clientY];
  suppressClick = false;
  c.classList.add('held');
  c.setPointerCapture?.(e.pointerId);
});
$view.addEventListener('pointermove', e => {
  const c = cardDrag || (e.pointerType === 'mouse' ? e.target.closest('[data-card3d]') : null);
  if (!c) return;
  if (cardDrag && dragFrom && Math.hypot(e.clientX - dragFrom[0], e.clientY - dragFrom[1]) > 8) suppressClick = true;
  const r = c.getBoundingClientRect();
  const px = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
  const py = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
  c.classList.add('held');
  c.style.setProperty('--ry', `${px * 34}deg`);
  c.style.setProperty('--rx', `${-py * 30}deg`);
  c.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
  c.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
}, { passive: true });
const releaseCard = e => {
  const c = cardDrag || e.target.closest?.('[data-card3d]');
  if (!c) return;
  cardDrag = null;
  c.classList.remove('held');
  ['--rx', '--ry', '--gx', '--gy'].forEach(k => c.style.removeProperty(k));
};
$view.addEventListener('pointerup', releaseCard);
$view.addEventListener('pointercancel', releaseCard);
$view.addEventListener('pointerout', e => { if (!cardDrag && e.pointerType === 'mouse' && e.target.closest('[data-card3d]') && !e.relatedTarget?.closest?.('[data-card3d]')) releaseCard(e); });

$view.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('qcard')) { e.preventDefault(); e.target.click(); }
});

/* ---------- 매니저 대화 ---------- */
function chatToBottom(instant) { requestAnimationFrame(() => $mgrList.scrollTo({ top: $mgrList.scrollHeight, behavior: instant || reduce ? 'auto' : 'smooth' })); }
const slim = t => {
  const o = { id: t.id, title: t.title, done: !!t.done };
  for (const k of ['kind', 'minutes', 'amount', 'note', 'emoji']) if (t[k]) o[k] = t[k];
  if (t.kind === 'thanks') o.items = (t.items || []).filter(Boolean);
  return o;
};

function instructions() {
  const tk = shiftKey(TODAY, 1);
  const hm = `${pad(NOW.getHours())}:${pad(NOW.getMinutes())}`;
  const split = [1, 2, 3, 4, 5, 6, 0].map(d => `${DAY[d]} ${S.split[d]}`).join(', ');
  const bal = BANKS.map(b => `${b.name} ${S.money.balances[b.id] == null ? '미입력' : won(S.money.balances[b.id])}`).join(', ');
  const mk = TODAY.slice(0, 7);
  const recentSpend = spendOf(mk).slice(-15).map(x => ({ id: x.id, type: x.type === 'in' ? '입금' : '지출', date: x.date, title: x.title, amount: x.amount, bank: bankName(x.bank) || undefined }));
  return `너는 '일상 매니저' 앱 안에 있는 매니저야. 사용자가 넣으라는 곳에 기록을 넣고 고치는 일만 해.
규칙:
- 한국어로 짧고 친근하게 답해. 무엇을 어디에 넣었는지 한 줄로 알려줘.
- 기록을 바꿀 때는 반드시 도구를 써. 도구가 성공하지 않았으면 했다고 말하지 마.
- 사용자가 말하지 않은 내용을 지어내지 마. 날짜나 양이 애매하면 넣기 전에 물어봐.
- '오늘', '내일', '토요일' 같은 말은 아래 날짜를 기준으로 YYYY-MM-DD로 바꿔.
- 내 통장끼리 돈을 옮겼다고 하면 transfer로 기록해(소비가 아님).
- 사야 할 것은 add_shopping, 자주 쓰는 물건과 가격은 add_item으로 넣어.
- 돈을 썼다고 하면 add_expense로 날짜·금액·내용을 기록해. 카드로 긁었으면 method '나라사랑카드'. 통장을 말하면 bank에 넣어.
- 시간이 걸리는 할 일은 minutes(분)에, 개수 같은 양은 amount에 넣어. 사이트 개발은 kind "dev", 운동은 kind "workout", 감사한 점 3개는 kind "thanks".
- 감사한 점은 그날 자정 전까지만 적을 수 있고, 지나면 탈락이야.
- 앱 화면이나 기능을 고치는 일은 네 일이 아니야. 그런 요청이면 코딩은 대화 밖 개발 세션에서 한다고 알려줘.

지금: ${TODAY} ${DAY[NOW.getDay()]}요일 ${hm}
오늘(${TODAY}) 할 일: ${JSON.stringify(todosOf(TODAY).map(slim))}
내일(${tk}) 할 일: ${JSON.stringify(todosOf(tk).map(slim))}
오늘 운동 부위: ${partOf(TODAY)}, 내일 운동 부위: ${partOf(tk)}
주간 운동 루틴: ${split}
돈: 월급날 매달 ${S.money.payday}일, 적금 ${manwon(S.money.savings)} 자동이체, 한 달 쓸 수 있는 돈 ${manwon(S.money.spend)}, 잔액 ${bal}
통장 역할: 농협=월급 통장, 신한=나라사랑 통장(나라사랑카드), 카카오뱅크=따로 모으는 돈. 쓸 수 있는 돈 = 농협 + 신한.
군적금: ${savPlan().accts.map(a => `${a.short} ${won(a.bal)}(매달 ${manwon(a.monthly)})`).join(', ') || '없음'}, 만기 예상 ${won(savPlan().payout)} (매달 ${S.savings.payday}일 자동 입금, 앱이 알아서 채움)
주식: ${stockSum().rows.map(r => `${r.name} ${r.qty}주 평균 ${won(r.avg)} 현재가 ${r.price != null ? won(r.price) : '미입력'}`).join(', ') || '없음'} (현재가를 말하면 set_stock)
이번 달(${mk}) 쓴 돈 합계 ${won(spentIn(mk))}, 최근 내역: ${JSON.stringify(recentSpend)}
지출은 add_expense(분류: ${CATS.map(c => c.name).join(', ')}), 들어온 돈은 add_income으로 기록해. 기록은 지우지 않고 숨기기만 해.
사진이 오면: 은행·카드 앱 화면이면 보이는 통장 잔액은 set_balance로, 거래는 add_expense/add_income으로 넣어. 최근 내역에 이미 있는 거래(같은 날짜·금액)는 다시 넣지 마. 화면이 흐리거나 확실하지 않은 숫자는 넣지 말고 물어봐. 넣은 것을 한 줄씩 알려줘.`;
}

function makeTools(before, acts) {
  const keep = (path, val) => { if (!(path in before)) before[path] = clone(val ?? null); };
  const needDate = d => { if (!isDate(d)) throw new Error('date는 YYYY-MM-DD 형식이어야 해요'); return String(d); };
  const findTodo = (date, id) => {
    const t = todosOf(date).find(x => x.id === String(id));
    if (!t) throw new Error(`${date}에 id ${id} 할 일이 없어요. get_day로 먼저 확인하세요`);
    return t;
  };
  const dayNote = d => `${dotDate(d)}`;
  const dayPath = d => `days/${d}`;
  return [
    {
      name: 'get_day',
      description: 'Returns the to-dos (with ids) and the workout part/plan for one date (YYYY-MM-DD).',
      inputSchema: { type: 'object', properties: { date: { type: 'string' } }, required: ['date'] },
      execute: ({ date }) => { const d = needDate(date); return { date: d, todos: todosOf(d).map(slim), workout: { part: partOf(d), plan: S.workout[d]?.plan || '' } }; },
    },
    {
      name: 'add_todo',
      description: 'Adds a to-do to a date. kind: normal (default), dev (site development; note = what to work on), workout, thanks (write 3 gratitudes; one per day). minutes for time-based tasks, amount for other quantities such as "3개". Returns the new id.',
      inputSchema: { type: 'object', properties: {
        date: { type: 'string' }, title: { type: 'string' }, emoji: { type: 'string', description: 'one emoji' },
        minutes: { type: 'number' }, amount: { type: 'string' }, kind: { type: 'string', enum: ['normal', 'dev', 'workout', 'thanks'] }, note: { type: 'string' },
      }, required: ['date', 'title'] },
      execute: async input => {
        const d = needDate(input.date);
        const title = String(input.title || '').trim().slice(0, 40);
        if (!title) throw new Error('title이 비어 있어요');
        const kind = ['dev', 'workout', 'thanks'].includes(input.kind) ? input.kind : undefined;
        if (kind === 'thanks' && todosOf(d).some(t => t.kind === 'thanks')) throw new Error('그날에는 이미 감사한 점 할 일이 있어요');
        const t = { id: newId(), emoji: String(input.emoji || (kind === 'dev' ? '💻' : kind === 'workout' ? '💪' : kind === 'thanks' ? '💌' : '📌')).slice(0, 8), title, done: false };
        if (kind) t.kind = kind;
        if (Number(input.minutes) > 0) t.minutes = Math.round(Number(input.minutes));
        if (input.amount) t.amount = String(input.amount).slice(0, 20);
        else if (kind === 'thanks') t.amount = '3개';
        if (input.note) t.note = String(input.note).slice(0, 600);
        if (kind === 'thanks') t.items = [];
        keep(dayPath(d), S.days[d]?.todos);
        await putDay(d, [...clone(rawTodos(d)), t]);
        acts.push(`${dayNote(d)} 할 일 추가: ${title}`);
        return { ok: true, id: t.id };
      },
    },
    {
      name: 'update_todo',
      description: 'Changes fields of an existing to-do by id: done, title, minutes, amount, note, emoji. A gratitude (thanks) to-do is completed only by set_thanks.',
      inputSchema: { type: 'object', properties: {
        date: { type: 'string' }, id: { type: 'string' }, done: { type: 'boolean' }, title: { type: 'string' },
        minutes: { type: 'number' }, amount: { type: 'string' }, note: { type: 'string' }, emoji: { type: 'string' },
      }, required: ['date', 'id'] },
      execute: async input => {
        const d = needDate(input.date), t = findTodo(d, input.id);
        const patch = {};
        if (typeof input.done === 'boolean') {
          if (t.kind === 'thanks') throw new Error('감사한 점은 set_thanks로 3개를 적어야 완료돼요');
          if (input.done && d > TODAY) throw new Error('아직 오지 않은 날은 완료로 표시할 수 없어요');
          patch.done = input.done;
        }
        if (input.title) patch.title = String(input.title).slice(0, 40);
        if (input.minutes != null) patch.minutes = Math.max(0, Math.round(Number(input.minutes) || 0)) || undefined;
        if (input.amount != null) patch.amount = String(input.amount).slice(0, 20) || undefined;
        if (input.note != null) patch.note = String(input.note).slice(0, 600);
        if (input.emoji) patch.emoji = String(input.emoji).slice(0, 8);
        keep(dayPath(d), S.days[d]?.todos);
        const todos = clone(rawTodos(d));
        const target = todos.find(x => x.id === t.id);
        Object.assign(target, patch);
        for (const k of Object.keys(target)) if (target[k] === undefined) delete target[k];
        await putDay(d, todos);
        acts.push(`${dayNote(d)} ${t.title}${patch.done === true ? ' 완료' : patch.done === false ? ' 완료 취소' : ' 수정'}`);
        return { ok: true };
      },
    },
    {
      name: 'remove_todo',
      description: 'Removes a to-do by id from a date. Only when the user clearly asks to delete it.',
      inputSchema: { type: 'object', properties: { date: { type: 'string' }, id: { type: 'string' } }, required: ['date', 'id'] },
      execute: async input => {
        const d = needDate(input.date), t = findTodo(d, input.id);
        keep(dayPath(d), S.days[d]?.todos);
        // 지우지 않고 숨긴다: 기록은 남는다
        const todos = clone(rawTodos(d));
        Object.assign(todos.find(x => x.id === t.id), { removed: true, removedAt: new Date().toISOString() });
        await putDay(d, todos);
        acts.push(`${dayNote(d)} 할 일 삭제: ${t.title}`);
        return { ok: true };
      },
    },
    {
      name: 'set_thanks',
      description: 'Saves up to 3 gratitude entries for TODAY only (past or future dates are refused). The thanks to-do is done when all 3 are filled.',
      inputSchema: { type: 'object', properties: { date: { type: 'string' }, items: { type: 'array', items: { type: 'string' }, maxItems: 3 } }, required: ['date', 'items'] },
      execute: async input => {
        const d = needDate(input.date);
        if (d !== keyOf(new Date())) throw new Error('감사한 점은 그날(오늘)에만 적을 수 있어요');
        const items = [0, 1, 2].map(n => String((input.items || [])[n] || '').trim().slice(0, 140));
        keep(dayPath(d), S.days[d]?.todos);
        let todos = clone(rawTodos(d));
        let t = todos.find(x => x.kind === 'thanks' && !x.removed);
        if (!t) { t = { id: newId(), emoji: '💌', title: '감사한 점 적기', amount: '3개', kind: 'thanks', done: false }; todos.push(t); }
        t.items = items;
        t.done = items.every(Boolean);
        await putDay(d, todos);
        acts.push(`${dayNote(d)} 감사한 점 ${items.filter(Boolean).length}/3`);
        return { ok: true, done: t.done };
      },
    },
    {
      name: 'set_workout',
      description: 'Sets the body part (등, 가슴, 하체, 휴식 or another short word) and/or the exercise plan text for a date.',
      inputSchema: { type: 'object', properties: { date: { type: 'string' }, part: { type: 'string' }, plan: { type: 'string' } }, required: ['date'] },
      execute: async input => {
        const d = needDate(input.date);
        keep(`workout/${d}`, S.workout[d]);
        const cur = { part: partOf(d), plan: S.workout[d]?.plan || '' };
        if (input.part) cur.part = String(input.part).slice(0, 10);
        if (input.plan != null) cur.plan = String(input.plan).slice(0, 600);
        await putWorkout(d, cur);
        acts.push(`${dayNote(d)} 운동: ${cur.part}`);
        return { ok: true };
      },
    },
    {
      name: 'set_weekly_split',
      description: 'Sets the weekly workout part for one weekday. weekday: 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토.',
      inputSchema: { type: 'object', properties: { weekday: { type: 'number' }, part: { type: 'string' } }, required: ['weekday', 'part'] },
      execute: async input => {
        const wd = Number(input.weekday);
        if (!(wd >= 0 && wd <= 6)) throw new Error('weekday는 0~6이에요');
        keep('settings/main', { split: S.split });
        const split = { ...S.split, [wd]: String(input.part).slice(0, 10) };
        await putSplit(split);
        acts.push(`주간 루틴 ${DAY[wd]}: ${split[wd]}`);
        return { ok: true };
      },
    },
    {
      name: 'set_balance',
      description: 'Sets the current balance in won for one bank account: 농협, 카카오뱅크 or 신한.',
      inputSchema: { type: 'object', properties: { bank: { type: 'string', enum: BANKS.map(b => b.name) }, amount: { type: 'number' } }, required: ['bank', 'amount'] },
      execute: async input => {
        const b = BANKS.find(x => x.name === input.bank || x.id === input.bank);
        if (!b) throw new Error('은행은 농협, 카카오뱅크, 신한 중 하나예요');
        const amt = Math.round(Number(input.amount));
        if (!Number.isFinite(amt)) throw new Error('amount는 원 단위 숫자예요');
        keep('money/main', S.money);
        await setBalance(b.id, amt);
        acts.push(`${b.name} 잔액 ${won(amt)}`);
        return { ok: true };
      },
    },
    {
      name: 'add_expense',
      description: 'Records money the user spent: date (YYYY-MM-DD), amount in won, title (what it was for), optional bank (농협, 카카오뱅크, 신한 or 현금). Returns the id.',
      inputSchema: { type: 'object', properties: {
        date: { type: 'string' }, amount: { type: 'number' }, title: { type: 'string' }, bank: { type: 'string', enum: [...BANKS.map(b => b.name), '현금'] },
        category: { type: 'string', enum: CATS.map(c => c.name) },
        method: { type: 'string', enum: ['나라사랑카드', '계좌이체', '현금'], description: '나라사랑카드면 신한 카드 사용으로 기록' },
      }, required: ['date', 'amount', 'title'] },
      execute: async input => {
        const d = needDate(input.date), amt = Math.round(Number(input.amount));
        if (!(amt > 0)) throw new Error('amount는 0보다 큰 원 단위 숫자예요');
        const title = String(input.title || '').trim().slice(0, 40) || '지출';
        const bank = BANKS.find(x => x.name === input.bank || x.id === input.bank)?.id || (input.bank === '현금' ? 'cash' : undefined);
        const mk = d.slice(0, 7);
        keep(`spend/${mk}`, S.spend[mk]?.items);
        const item = { id: newId(), date: d, amount: amt, title, at: new Date().toISOString() };
        if (bank) item.bank = bank;
        const cat = CATS.find(c => c.name === input.category || c.id === input.category);
        if (cat) item.cat = cat.id;
        const method = { '나라사랑카드': 'card', '계좌이체': 'transfer', '현금': 'cash' }[input.method];
        if (method) item.method = method;
        if (method === 'card') item.bank = 'shinhan';
        if (method === 'cash') item.bank = 'cash';
        await putSpend(mk, [...clone(S.spend[mk]?.items || []), item]);
        acts.push(`${dotDate(d)} 지출 ${title} ${won(amt)}`);
        return { ok: true, id: item.id, monthTotal: spentIn(mk) };
      },
    },
    {
      name: 'set_stock',
      description: 'Updates a stock holding by name: current price (won per share), quantity, or average buy price. Creates the holding if it does not exist (needs qty and avg).',
      inputSchema: { type: 'object', properties: { name: { type: 'string' }, price: { type: 'number' }, qty: { type: 'number' }, avg: { type: 'number' } }, required: ['name'] },
      execute: async input => {
        keep('stocks/main', S.stocks);
        const st = clone(S.stocks), now = new Date().toISOString();
        let h = (st.holdings || []).find(x => !x.removed && x.name === String(input.name).trim());
        if (!h) {
          if (!(input.qty > 0 && input.avg > 0)) throw new Error('새 종목은 qty와 avg가 필요해요');
          h = { id: newId(), name: String(input.name).trim().slice(0, 20), qty: Math.round(input.qty), avg: Math.round(input.avg), price: null, priceAt: null, history: [], at: now };
          st.holdings = [...(st.holdings || []), h];
        }
        if (input.price > 0) { h.price = Math.round(input.price); h.priceAt = now; h.history = [...(h.history || []), { at: now, price: h.price }]; }
        if (input.qty > 0 && input.qty !== h.qty) { h.changes = [...(h.changes || []), { at: now, qty: h.qty, avg: h.avg }]; h.qty = Math.round(input.qty); }
        if (input.avg > 0 && input.avg !== h.avg) { h.avg = Math.round(input.avg); }
        await putStocks(st);
        acts.push(`주식 ${h.name}${input.price > 0 ? ` 현재가 ${won(h.price)}` : ''}`);
        const r = stockSum().rows.find(x => x.id === h.id);
        return { ok: true, pnl: r?.pnl, rate: r?.rate };
      },
    },
    {
      name: 'transfer',
      description: 'Moves money between the user\'s own bank accounts (농협, 카카오뱅크, 신한) after they actually transferred it. Only balances move; it is not spending or income.',
      inputSchema: { type: 'object', properties: {
        from: { type: 'string', enum: BANKS.map(b => b.name) }, to: { type: 'string', enum: BANKS.map(b => b.name) }, amount: { type: 'number' }, memo: { type: 'string' },
      }, required: ['from', 'to', 'amount'] },
      execute: async input => {
        const f = BANKS.find(b => b.name === input.from || b.id === input.from), t = BANKS.find(b => b.name === input.to || b.id === input.to);
        const amt = Math.round(Number(input.amount));
        if (!f || !t || f.id === t.id) throw new Error('보내는 통장과 받는 통장을 서로 다르게 골라 주세요');
        if (!(amt > 0)) throw new Error('amount는 0보다 큰 원 단위 숫자예요');
        keep('money/main', S.money);
        keep(`transfers/${TODAY.slice(0, 7)}`, S.transfers[TODAY.slice(0, 7)]?.items);
        await doTransfer(f.id, t.id, amt, input.memo ? String(input.memo).slice(0, 30) : '');
        acts.push(`이체 ${f.name} → ${t.name} ${won(amt)}`);
        return { ok: true, from: S.money.balances[f.id], to: S.money.balances[t.id] };
      },
    },
    {
      name: 'add_shopping',
      description: 'Adds something the user needs to buy to the 필요한 물건 list: name, option (color/size), price in won, qty, group (예: 옷, 생활용품).',
      inputSchema: { type: 'object', properties: { name: { type: 'string' }, option: { type: 'string' }, price: { type: 'number' }, qty: { type: 'number' }, group: { type: 'string' } }, required: ['name'] },
      execute: async input => {
        keep('shopping/main', S.shopping);
        const sh = clone(S.shopping);
        const v = { id: newId(), name: String(input.name).slice(0, 60), option: String(input.option || '').slice(0, 40), price: Math.max(0, Math.round(Number(input.price) || 0)), qty: Math.max(1, Math.round(Number(input.qty) || 1)), group: String(input.group || '').slice(0, 20), done: false, at: new Date().toISOString() };
        sh.list = [...(sh.list || []), v];
        await putShopping(sh);
        acts.push(`살 것 추가: ${v.name}`);
        return { ok: true, id: v.id };
      },
    },
    {
      name: 'add_item',
      description: 'Adds an everyday item the user regularly uses to 내 물건 with its price in won (e.g. 바디워시 7900).',
      inputSchema: { type: 'object', properties: { name: { type: 'string' }, sub: { type: 'string', description: '제품명·용량' }, price: { type: 'number' } }, required: ['name'] },
      execute: async input => {
        keep('items/main', S.items);
        const it = clone(S.items);
        const v = { id: newId(), name: String(input.name).slice(0, 30), sub: String(input.sub || '').slice(0, 40), price: Math.max(0, Math.round(Number(input.price) || 0)), at: new Date().toISOString() };
        it.list = [...(it.list || []), v];
        await putItems(it);
        acts.push(`내 물건 추가: ${v.name}`);
        return { ok: true };
      },
    },
    {
      name: 'add_income',
      description: 'Records money that came in (salary, transfer in): date (YYYY-MM-DD), amount in won, title, optional bank.',
      inputSchema: { type: 'object', properties: {
        date: { type: 'string' }, amount: { type: 'number' }, title: { type: 'string' }, bank: { type: 'string', enum: [...BANKS.map(b => b.name), '현금'] },
      }, required: ['date', 'amount', 'title'] },
      execute: async input => {
        const d = needDate(input.date), amt = Math.round(Number(input.amount));
        if (!(amt > 0)) throw new Error('amount는 0보다 큰 원 단위 숫자예요');
        const title = String(input.title || '').trim().slice(0, 40) || '입금';
        const bank = BANKS.find(x => x.name === input.bank || x.id === input.bank)?.id || (input.bank === '현금' ? 'cash' : undefined);
        const mk = d.slice(0, 7);
        keep(`spend/${mk}`, S.spend[mk]?.items);
        const item = { id: newId(), type: 'in', date: d, amount: amt, title, at: new Date().toISOString() };
        if (bank) item.bank = bank;
        await putSpend(mk, [...clone(S.spend[mk]?.items || []), item]);
        acts.push(`${dotDate(d)} 입금 ${title} +${won(amt)}`);
        return { ok: true, id: item.id };
      },
    },
    {
      name: 'remove_expense',
      description: 'Hides a wrongly entered expense by id (it stays in the history as removed). Only when the user clearly asks.',
      inputSchema: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM' }, id: { type: 'string' } }, required: ['month', 'id'] },
      execute: async input => {
        const mk = String(input.month || '').slice(0, 7);
        const items = clone(S.spend[mk]?.items || []);
        const x = items.find(i => i.id === String(input.id) && !i.removed);
        if (!x) throw new Error(`${mk}에 id ${input.id} 지출이 없어요`);
        keep(`spend/${mk}`, S.spend[mk]?.items);
        Object.assign(x, { removed: true, removedAt: new Date().toISOString() });
        await putSpend(mk, items);
        acts.push(`지출 지움: ${x.title} ${won(x.amount)}`);
        return { ok: true };
      },
    },
    {
      name: 'set_money_plan',
      description: 'Changes the payday (day of month), the monthly automatic savings, or the monthly spending budget, in won.',
      inputSchema: { type: 'object', properties: { payday: { type: 'number' }, savings: { type: 'number' }, spend: { type: 'number' } } },
      execute: async input => {
        keep('money/main', S.money);
        const money = clone(S.money);
        if (input.payday != null) money.payday = Math.min(28, Math.max(1, Math.round(Number(input.payday))));
        if (input.savings != null) money.savings = Math.max(0, Math.round(Number(input.savings)));
        if (input.spend != null) money.spend = Math.max(0, Math.round(Number(input.spend)));
        await putMoney(money);
        acts.push('월급 계획 수정');
        return { ok: true };
      },
    },
  ];
}

async function undoTurn(at) {
  const before = UI.undo[at];
  if (!before) return;
  try {
    for (const [path, val] of Object.entries(before)) {
      const [col, id] = path.split('/');
      if (col === 'days') await putDay(id, val || []);
      else if (col === 'workout') await putWorkout(id, val ? { part: val.part, plan: val.plan || '' } : null);
      else if (col === 'settings') await putSplit(val.split);
      else if (col === 'money') await putMoney(val);
      else if (col === 'spend') await putSpend(id, val || []);
      else if (col === 'transfers') await putTransfers(id, val || []);
      else if (col === 'shopping') await putShopping(val || { list: [] });
      else if (col === 'items') await putItems(val || { list: [] });
    }
    delete UI.undo[at];
    logAct('매니저가 한 일을 되돌림');
    toast('되돌렸어요');
    paintChat();
  } catch (e) { saveFail(); }
}

const $input = document.getElementById('chatInput');
const $file = document.getElementById('chatFile');
const $imgChip = document.getElementById('chatImg');
function setImage(file) {
  UI.img = file || null;
  $imgChip.hidden = !UI.img;
  if (UI.img) {
    const url = URL.createObjectURL(UI.img);
    $imgChip.querySelector('img').src = url;
    $imgChip.querySelector('img').onload = () => URL.revokeObjectURL(url);
  }
}
$file.addEventListener('change', () => {
  if ($file.files?.[0]) { setImage($file.files[0]); openChat(); if (!$input.value) $input.placeholder = '비워 두면 화면을 읽어 넣어요'; }
  $file.value = '';
});
document.getElementById('chatAttach').addEventListener('click', () => $file.click());
$imgChip.querySelector('button').addEventListener('click', () => { setImage(null); $input.placeholder = '매니저에게 말하기'; });
const $send = document.getElementById('chatSend');
const SEND_ICON = $send.innerHTML;
const STOP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor"/></svg>';

function setBusy(busy) {
  $send.classList.toggle('stop', busy);
  $send.innerHTML = busy ? STOP_ICON : SEND_ICON;
  $send.setAttribute('aria-label', busy ? '멈추기' : '보내기');
}

function liveUpdate() {
  const el = document.getElementById('liveBubble');
  if (el && UI.pending?.text) el.textContent = UI.pending.text;
  chatToBottom();
}

async function send() {
  if (UI.pending) { UI.ctl?.abort(); return; }
  const img = UI.img;
  const text = $input.value.trim() || (img ? '이 은행 앱 화면을 보고 잔액과 거래 내역을 넣어줘' : '');
  if (!text) return;
  if (!SAMPLE) { toast('이 화면에서는 매니저를 부를 수 없어요'); return; }
  $input.value = '';
  setImage(null);
  $input.placeholder = '매니저에게 말하기';
  $input.style.height = '';
  NOW = new Date();
  const before = {}, acts = [];
  const shown = img ? `📷 ${text}` : text;
  UI.pending = { user: shown, text: '', acts };
  UI.ctl = new AbortController();
  setBusy(true);
  paintChat();
  const history = allChat().slice(-12).map(m => ({ role: m.role, content: m.content }));
  const turns = [{ role: 'user', content: instructions() }, ...history, { role: 'user', content: text }];
  let answer = '', failed = '';
  try {
    let tools = makeTools(before, acts);
    const lim = await SAMPLE.limits().catch(() => null);
    if (lim && !lim.tools) tools = [];
    else if (lim?.tools?.maxCount) tools = tools.slice(0, lim.tools.maxCount);
    const res = await SAMPLE(turns, {
      modelTier: img ? 'default' : 'quick',
      ...(img ? { images: [img] } : {}),
      signal: UI.ctl.signal,
      ...(tools.length ? { tools } : { cache: false }),
      onText: ({ text: t }) => { UI.pending.text = t; liveUpdate(); },
    });
    answer = res.text;
  } catch (e) {
    answer = e?.text || '';
    failed = e?.code === 'cancelled' ? '멈췄어요.'
      : e?.code === 'not_granted' ? '매니저를 쓰도록 허용해야 대화할 수 있어요.'
      : e?.code === 'rate_limited' ? '지금은 너무 많이 불렀어요. 조금 뒤에 다시 말해 주세요.'
      : e?.code === 'sampling_disabled' ? '이 계정에서는 매니저를 부를 수 없어요.'
      : e?.code === 'image_rejected' ? '이 사진은 읽을 수 없어요. 다른 캡처로 다시 보내 주세요.'
      : e?.code === 'images_unavailable' ? '이 화면에서는 사진을 보낼 수 없어요.'
      : '답을 받지 못했어요. 다시 말해 주세요.';
  }
  const at = new Date().toISOString();
  const reply = [answer.trim(), failed].filter(Boolean).join('\n');
  if (Object.keys(before).length) UI.undo[at] = before;
  const messages = [{ role: 'user', content: shown, at: `${at}u` }, { role: 'assistant', content: reply || '…', at, actions: acts }];
  if (acts.length) logAct(`매니저 · ${acts.join(' / ')}`);
  UI.pending = null;
  UI.ctl = null;
  setBusy(false);
  await addChat(messages);
  paintChat();
  $input.focus({ preventScroll: true });
}

$mgrList.addEventListener('click', e => {
  const undo = e.target.closest('[data-undo]');
  if (undo) undoTurn(undo.dataset.undo);
});
$mgr.querySelectorAll('[data-mgr-close]').forEach(b => b.addEventListener('click', closeChat));
document.getElementById('mgrQuick').addEventListener('click', e => {
  const q = e.target.closest('[data-q]');
  if (!q) return;
  $input.value = q.dataset.q;
  $input.dispatchEvent(new Event('input'));
  $input.focus();
  $input.setSelectionRange($input.value.length, $input.value.length);
});

document.getElementById('chatForm').addEventListener('submit', e => { e.preventDefault(); send(); });
$input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); }
});
$input.addEventListener('input', () => { $input.style.height = ''; $input.style.height = `${Math.min(140, $input.scrollHeight)}px`; });

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
  menu.querySelectorAll('nav a').forEach(a => (a.onclick = e => {
    set(false);
    if (a.dataset.id === 'chat') { e.preventDefault(); setTimeout(openChat, 250); }
  }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (menu.classList.contains('open')) set(false);
    else if ($sheet.classList.contains('open')) closeSheet();
    else if ($mgr.classList.contains('open')) closeChat();
  });
}

/* ---------- 시작 ---------- */
setupMenu();
$fab.addEventListener('click', () => ($mgr.classList.contains('open') ? closeChat() : openChat()));
addEventListener('hashchange', () => {
  closeSheet();
  if (location.hash === '#chat') { location.hash = '#today'; openChat(); return; }
  paint('route');
});
if (location.hash === '#chat') { location.hash = '#today'; setTimeout(openChat, 400); }
paint('enter');
connect();

// 날짜가 바뀌면(자정) 오늘을 새로 잡는다. 감사한 점은 이때 탈락으로 바뀐다
setInterval(() => {
  NOW = new Date();
  const k = keyOf(NOW);
  if (k !== TODAY) {
    const wasToday = UI.sel === TODAY;
    TODAY = k;
    if (wasToday) { UI.sel = k; UI.y = NOW.getFullYear(); UI.m = NOW.getMonth(); }
    if (!UI.pending) refresh();
  }
}, 30000);

const boot = document.getElementById('boot');
if (boot) {
  try { sessionStorage.setItem('booted', '1'); } catch (e) { /* 저장이 막혀 있어도 그냥 넘어간다 */ }
  boot.addEventListener('pointerdown', () => boot.classList.add('skip'));
}
