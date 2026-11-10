/* Service worker: makes the site installable and lets it open offline.
   Strategy: network first for everything (so online visitors always get fresh data),
   falling back to the cached copy when the network is unavailable. */
const CACHE = "gas-tracker-v8";
const SHELL = [
  "./", "index.html", "browse.html", "trends.html", "manifest.webmanifest",
  "assets/style.css", "assets/common.js", "assets/today.js", "assets/browse.js", "assets/trends.js",
  "assets/vendor/d3.min.js", "assets/vendor/topojson-client.min.js", "assets/vendor/us-states-10m.json",
  "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/icon.svg",
  "assets/fonts/righteous-latin-400-normal.woff2", "assets/fonts/special-elite-latin-400-normal.woff2",
  "assets/fonts/work-sans-latin-400-normal.woff2", "assets/fonts/work-sans-latin-500-normal.woff2",
  "assets/fonts/work-sans-latin-600-normal.woff2", "assets/fonts/work-sans-latin-700-normal.woff2",
  "data/history.csv", "data/status.json", "data/locations.csv", "data/source_log.csv",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) =>
          hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())
        )
      )
  );
});
