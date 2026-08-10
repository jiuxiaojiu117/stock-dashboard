/* 盯盘工作台 Service Worker —— 缓存应用外壳，支持“添加到主屏幕”后离线启动
 * 数据接口（/api/*、东方财富跨域）不缓存，始终走网络。 */
const CACHE = 'dash-shell-v1';
const SHELL = [
  './',
  'stock-dashboard.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'sw.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // 跨域（东方财富）不处理
  if (url.pathname.startsWith('/api/')) return;            // 动态数据不缓存

  if (req.mode === 'navigate') {                          // 页面：网络优先，离线回退缓存
    e.respondWith(
      fetch(req).then(res => { if (res.ok) caches.open(CACHE).then(c => c.put('./', res.clone())); return res; })
        .catch(() => caches.match('./').then(r => r || caches.match('stock-dashboard.html')))
    );
    return;
  }
  // 静态资源：缓存优先，缺失则网络并缓存
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req)))
  );
});
