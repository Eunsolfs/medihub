const CACHE = "medihub-shell-v1";

const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(SHELL);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(
        async (keys) =>
          await Promise.all(
            keys
              .filter((key) => key !== CACHE)
              .map(async (key) => await caches.delete(key))
          )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  // 账号、会话、上传与查询接口不缓存，避免看到别人的数据或过期数据。
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/rpc")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);

        return cached ?? (await caches.match("/offline.html"));
      })
    );

    return;
  }

  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              void caches.open(CACHE).then(async (cache) => {
                await cache.put(request, response.clone());
              });
            }

            return response;
          })
          .catch(() => cached);

        return cached ?? network;
      })
    );
  }
});
