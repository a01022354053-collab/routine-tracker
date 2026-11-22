// 일상 매니저 서비스 워커(홈 화면 앱용).
// 늘 인터넷에서 새로 받고(그래서 배포하면 바로 새 화면), 연결이 끊겼을 때만 마지막으로 받은 화면을 보여 준다.
// 기록(/api/…)과 다른 사이트(글꼴·애니 썸네일)는 건드리지 않는다.
const CACHE = 'dm-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/') : null)).then(r => r || Response.error())),
  );
});
