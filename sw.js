// Ficha de ejercicios: guarda la app, las fichas y los vídeos para verlos sin internet.
const SHELL = "shell-v3";
const MEDIA = "media-v1";
const SHELL_FILES = ["./", "./index.html", "./app.js", "./import.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(SHELL_FILES.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== MEDIA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const isMedia = (url) => url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/public/");

async function getMedia(url) {
  const cache = await caches.open(MEDIA);
  let res = await cache.match(url);
  if (!res) {
    const fresh = await fetch(url, { mode: "cors" });
    if (!fresh.ok) return fresh;
    await cache.put(url, fresh.clone());
    res = fresh;
  }
  return res;
}
async function mediaResponse(request) {
  const url = request.url.split("#")[0];
  let res;
  try { res = await getMedia(url); } catch { return Response.error(); }
  const range = request.headers.get("range");
  if (!range || res.status !== 200) return res;
  const buf = await res.arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : total - 1;
  if (!m[1] && m[2]) { start = Math.max(0, total - parseInt(m[2], 10)); end = total - 1; }
  end = Math.min(end, total - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "video/mp4",
      "Content-Range": "bytes " + start + "-" + end + "/" + total,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes"
    }
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (isMedia(url)) { e.respondWith(mediaResponse(req)); return; }
  if (url.hostname.endsWith(".supabase.co")) return; // datos: siempre de la red
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put("./index.html", copy)); return res; })
      .catch(() => caches.match("./index.html", { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "precache") {
    e.waitUntil((async () => { for (const u of e.data.urls) { try { await getMedia(u); } catch {} } })());
  }
});
