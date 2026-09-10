/**
 * Service Worker —— 匿名建议信箱 PWA
 * 策略：
 * - Next.js 静态资源（_next/static）：缓存优先（哈希命名，永不失效）
 * - 页面路由：网络优先，失败回退缓存（保证每次打开拿到最新版本）
 * - API 请求：不缓存（保证数据实时）
 * - 自动更新：新 SW 接管时立即激活（skipWaiting），客户端检测到控制权变化后提示刷新
 */

const CACHE_NAME = "mb-shell-v1";
const STATIC_CACHE = "mb-static-v1";

const STATIC_ASSETS = ["/login", "/offline", "/manifest.webmanifest"];

// ── 安装：预缓存关键页面 ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── 激活：清理旧缓存，立即接管 ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── 请求拦截 ──
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API 请求：不拦截，直接走网络
  if (url.pathname.startsWith("/api/")) return;

  // POST/PUT/DELETE：不拦截
  if (event.request.method !== "GET") return;

  // Next.js 静态资源（JS/CSS/字体/图片，文件名含哈希）：缓存优先
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      })
    );
    return;
  }

  // 页面路由：网络优先，失败回退缓存
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(event.request, {
          cache: "no-store",
        });
        if (res.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // 无缓存时返回离线页
        const offlineRes = await caches.match("/offline");
        if (offlineRes) return offlineRes;
        return new Response("网络连接已断开", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })()
  );
});

// ── 自动更新通知 ──
self.addEventListener("controllerchange", () => {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) =>
      client.postMessage({ type: "SW_UPDATED" })
    );
  });
});
