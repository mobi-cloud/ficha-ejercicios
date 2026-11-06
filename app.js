(() => {
  "use strict";
  const SUPABASE_URL = "https://thzcdyjrimyxoimuykdp.supabase.co";
  const SUPABASE_KEY = "sb_publishable_8igMbXwPV2EXQGd_em6QHQ_mnS5L_M3";
  const MAX_BYTES = 50 * 1024 * 1024;
  const POSITIONS = [
    { key: "supine", label: "Boca arriba", color: "#5bb4f0" },
    { key: "side", label: "De lado", color: "#ff9f43" },
    { key: "prone", label: "Boca abajo", color: "#a98bf5" },
    { key: "standing", label: "De pie", color: "#43c487" }
  ];
  const LEVELS = [{ key: "normal", title: "Versión normal" }, { key: "advanced", title: "Versión avanzada" }];
  const posOf = (k) => POSITIONS.find(p => p.key === k);
  const $ = (id) => document.getElementById(id);

  // ---------- helpers ----------
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  }
  function svg(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  const icons = {
    chev: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
    up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    dumbbell: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></svg>',
    play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>',
    cam: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
  };
  function toast(msg, ms = 2600) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms);
  }
  const levelHasContent = (L) => !!(L && (L.dose || L.instructions || L.media || L.variant));
  const initials = (name) => (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const byOrd = (a, b) => (a.ord ?? 1e9) - (b.ord ?? 1e9);
  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const studentLink = (id) => location.origin + location.pathname + "?a=" + id;

  function mediaNode(m, alt) {
    if (!m) return null;
    if (m.kind === "image") return el("div", { class: "media" }, el("img", { src: m.url, alt: alt || "", loading: "lazy" }));
    if (m.kind === "video") return el("div", { class: "media" }, el("video", { src: m.url, controls: true, playsinline: true, preload: "metadata" }));
    return el("div", { class: "media" }, el("a", { class: "yt", href: m.url, target: "_blank", rel: "noopener" },
      el("span", { class: "play" }, svg(icons.play)), el("span", null, "Ver vídeo", el("small", { text: "Necesita internet" }))));
  }

  // ---------- service worker ----------
  let swReady = null;
  if ("serviceWorker" in navigator) {
    swReady = navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).catch(() => null);
  }
  async function precache(urls) {
    const reg = swReady && await swReady;
    if (reg && reg.active && urls.length) reg.active.postMessage({ type: "precache", urls });
  }

  // =====================================================================
  // VISTA DEL ALUMNO (?a=<id>) — sin cuenta, funciona sin internet
  // =====================================================================
  const params = new URLSearchParams(location.search);
  const alumnoId = params.get("a");

  function renderLevelBlock(L, adv) {
    if (!levelHasContent(L)) return null;
    const box = el("div", { class: "lvl" + (adv ? " adv" : "") }, el("span", { class: "lvl-t", text: adv ? "Avanzado" : "Normal" }));
    if (adv && L.variant) box.append(el("p", { class: "var", text: L.variant }));
    const m = mediaNode(L.media); if (m) box.append(m);
    if (L.dose) box.append(el("div", { class: "pdose" }, el("span", { text: "Series · repeticiones · tiempo" }), el("b", { text: L.dose })));
    if (L.instructions) box.append(el("p", { class: "instr", text: L.instructions }));
    return box;
  }
  function renderAlumno(data, offline) {
    document.body.className = "alumno";
    const top = $("top"), main = $("list");
    main.className = "pupil";
    top.replaceChildren(); main.replaceChildren();
    $("fab").hidden = true;
    if (!data || !data.student) {
      top.append(el("span", { class: "eyebrow", text: "Ficha de ejercicios" }), el("h1", { class: "disp", text: "Ficha" }));
      main.append(el("div", { class: "status" }, el("h2", { text: offline ? "Sin conexión" : "No encontramos esta ficha" }),
        el("p", { text: offline ? "Abre el enlace con internet una vez para guardarla en el móvil." : "Pide a tu entrenadora un enlace nuevo." })));
      return;
    }
    document.title = "Ficha de " + data.student.name;
    const list = (data.exercises || []).map(normalizeRow).sort(byOrd);
    top.append(el("span", { class: "eyebrow", text: "Ficha de ejercicios" }), el("h1", { class: "disp", text: data.student.name }),
      el("p", { text: list.length + (list.length === 1 ? " ejercicio" : " ejercicios") }));
    if (offline) main.append(el("p", { class: "offline", text: "Sin conexión: estás viendo la última versión guardada." }));
    const used = POSITIONS.filter(p => list.some(e => e.position === p.key));
    if (used.length) main.append(el("div", { class: "legend" }, used.map(p => el("span", null, el("i", { style: "background:" + p.color }), p.label))));
    if (!list.length) main.append(el("div", { class: "status" }, el("h2", { text: "Todavía no hay ejercicios" })));
    list.forEach((e, i) => {
      const p = posOf(e.position);
      const det = el("details", { class: "pex" });
      if (i === 0) det.open = true;
      det.append(el("summary", null, el("span", { class: "n", text: String(i + 1), style: p ? "background:" + p.color : null }), el("span", { class: "nm", text: e.name })));
      const body = el("div", { class: "pbody" });
      const a = renderLevelBlock(e.normal, false), b = renderLevelBlock(e.advanced, true);
      if (a && b) body.append(el("div", { class: "pslides" }, a, b)); else body.append(a || b || el("p", { class: "empty-level", text: "Sin detalles." }));
      det.append(body);
      main.append(det);
    });
    const urls = [];
    list.forEach(e => LEVELS.forEach(({ key }) => { const m = e[key]?.media; if (m && (m.kind === "image" || m.kind === "video")) urls.push(m.url); }));
    precache(urls);
  }
  async function startAlumno() {
    lsSet("ultimaFicha", alumnoId);
    const cached = lsGet("ficha:" + alumnoId);
    if (cached) renderAlumno(cached, false);
    else { $("top").replaceChildren(el("h1", { class: "disp", text: "Cargando…" })); }
    try {
      const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/ficha", {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ sid: alumnoId }), cache: "no-store"
      });
      if (!res.ok) throw new Error("http");
      const data = await res.json();
      if (data && data.student) lsSet("ficha:" + alumnoId, data);
      renderAlumno(data, false);
    } catch {
      renderAlumno(cached, true);
    }
  }

  // =====================================================================
  // ÁREA DE LA PROFESORA
  // =====================================================================
  let sb = null, students = [], exercises = [], loaded = false;
  let view = "students", studentId = null;
  let currentId = null, currentLevel = "normal";
  let editingId = null, draft = null, editingStudent = null, confirmAction = null;

  function normalizeRow(r) {
    const normal = r.normal ? { ...r.normal } : null;
    const position = normal?.position || "";
    if (normal) delete normal.position;
    return { id: r.id, student_id: r.student_id, name: r.name || "", ord: r.ord ?? 0, position, normal, advanced: r.advanced || null, updated_at: r.updated_at };
  }
  const toRow = (e) => ({ id: e.id, student_id: e.student_id, name: e.name, ord: e.ord, normal: { ...(e.normal || {}), position: e.position || "" }, advanced: e.advanced, updated_at: new Date().toISOString() });
  const exOf = (sid) => exercises.filter(e => e.student_id === sid);
  const mediaPaths = (e) => LEVELS.map(({ key }) => e?.[key]?.media?.path).filter(Boolean);
  const pathInUse = (path, exceptIds) => exercises.some(x => !exceptIds.includes(x.id) && mediaPaths(x).includes(path));

  async function refresh() {
    const [s, e] = await Promise.all([
      sb.from("students").select("*").order("ord"),
      sb.from("exercises").select("*").order("ord")
    ]);
    if (s.error || e.error) throw (s.error || e.error);
    students = s.data; exercises = e.data.map(normalizeRow); loaded = true;
    render(); if (currentId) renderDetail();
  }
  async function removeFiles(paths) { if (paths.length) { try { await sb.storage.from("media").remove(paths); } catch {} } }

  function render() {
    document.body.className = "";
    const top = $("top"), main = $("list"), fab = $("fab");
    top.replaceChildren(); main.replaceChildren(); main.className = "";

    if (view === "student") {
      const s = students.find(x => x.id === studentId);
      if (!s && loaded) { view = "students"; studentId = null; return render(); }
      const list = exOf(studentId).sort(byOrd);
      top.append(el("button", { class: "back", onclick: goHome }, svg(icons.back), "Alumnos"),
        el("span", { class: "eyebrow", text: list.length ? list.length + (list.length === 1 ? " ejercicio" : " ejercicios") : "Ficha de ejercicios" }),
        el("h1", { class: "disp", text: s?.name || "" }));
      if (s) top.append(el("div", { class: "head-actions" },
        el("button", { class: "ghost strong", onclick: () => shareStudent(s) }, "Enviar ficha"),
        el("a", { class: "ghost", href: studentLink(s.id), target: "_blank", rel: "noopener" }, "Ver como alumno"),
        el("button", { class: "ghost", onclick: () => openStudentForm(s.id) }, "Editar nombre")));
      if (!list.length) main.append(el("div", { class: "status" }, el("h2", { text: "Ningún ejercicio" }), el("p", { text: "Toca “Añadir ejercicio” para armar la ficha." })));
      else {
        const used = POSITIONS.filter(p => list.some(e => e.position === p.key));
        if (used.length) main.append(el("div", { class: "legend" }, used.map(p => el("span", null, el("i", { style: "background:" + p.color }), p.label))));
      }
      list.forEach((e, i) => {
        const m = e.normal?.media || e.advanced?.media;
        const thumb = el("div", { class: "thumb" });
        if (m?.kind === "image") thumb.append(el("img", { src: m.url, alt: "", loading: "lazy" }));
        else if (m?.kind === "video") thumb.append(el("video", { src: m.url + "#t=0.5", muted: true, playsinline: true, preload: "metadata" }));
        else if (m) { thumb.style.background = "#e62117"; thumb.append(svg(icons.play)); }
        else thumb.append(svg(icons.dumbbell));
        const chips = el("div", { class: "chips" });
        if (e.normal?.dose) chips.append(el("span", { class: "chip", text: e.normal.dose }));
        if (levelHasContent(e.advanced)) chips.append(el("span", { class: "chip adv", text: "Avanzado" + (e.advanced.dose ? " · " + e.advanced.dose : "") }));
        const p = posOf(e.position);
        const card = el("button", { class: "ex", onclick: () => openDetail(e.id) },
          el("span", { class: "num", text: String(i + 1), style: p ? "background:" + p.color : null }), thumb,
          el("span", { class: "info" }, el("span", { class: "name", text: e.name || "Sin nombre" }), chips),
          el("span", { class: "chev" }, svg(icons.chev)));
        main.append(el("div", { class: "row" }, card, el("div", { class: "reorder" },
          el("button", { "aria-label": "Subir", disabled: i === 0, onclick: () => move(list, i, -1) }, svg(icons.up)),
          el("button", { "aria-label": "Bajar", disabled: i === list.length - 1, onclick: () => move(list, i, 1) }, svg(icons.down)))));
      });
      fab.hidden = false; $("fabText").textContent = "Añadir ejercicio";
      return;
    }

    top.append(el("span", { class: "eyebrow", text: "Ficha de ejercicios" }), el("h1", { class: "disp", text: "Alumnos" }),
      el("p", { text: "Elige un alumno para armar su ficha." }),
      el("div", { class: "head-actions" }, el("button", { class: "ghost", onclick: logout }, "Cerrar sesión")));
    if (!loaded) main.append(el("div", { class: "status" }, el("h2", { text: "Cargando…" })));
    else if (!students.length) {
      main.append(el("div", { class: "status" }, el("h2", { text: "Todavía no hay alumnos" }), el("p", { text: "Toca “Añadir alumno” para empezar." }),
        window.IMPORT_DATA ? el("button", { class: "btn primary", style: "margin-top:16px", onclick: importOld }, "Traer las fichas de la versión anterior") : null));
    } else {
      main.className = "grid";
      students.slice().sort(byOrd).forEach(s => {
        const n = exOf(s.id).length;
        main.append(el("button", { class: "student", onclick: () => openStudent(s.id) },
          el("span", { class: "avatar", text: initials(s.name) }),
          el("span", { class: "info" }, el("span", { class: "name", text: s.name }),
            el("span", { class: "count", text: n === 0 ? "Sin ejercicios" : n + (n === 1 ? " ejercicio" : " ejercicios") })),
          el("span", { class: "chev" }, svg(icons.chev))));
      });
    }
    fab.hidden = false; $("fabText").textContent = "Añadir alumno";
  }
  function openStudent(id) { view = "student"; studentId = id; history.replaceState(null, "", "#s-" + id); render(); scrollTo(0, 0); }
  function goHome() { view = "students"; studentId = null; history.replaceState(null, "", location.pathname); render(); scrollTo(0, 0); }

  async function shareStudent(s) {
    const url = studentLink(s.id);
    const text = "Tu ficha de ejercicios: " + url;
    try {
      if (navigator.share) { await navigator.share({ title: "Ficha de " + s.name, text: "Tu ficha de ejercicios", url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); toast("Enlace copiado. Pégalo en WhatsApp."); }
    catch { window.prompt("Copia este enlace:", url); }
    void text;
  }

  let moving = false;
  async function move(list, idx, dir) {
    if (moving) return; moving = true;
    try {
      const arr = list.slice(); const a = arr[idx]; arr[idx] = arr[idx + dir]; arr[idx + dir] = a;
      for (let i = 0; i < arr.length; i++) if (arr[i].ord !== i) {
        const { error } = await sb.from("exercises").update({ ord: i }).eq("id", arr[i].id);
        if (error) throw error;
        arr[i].ord = i;
      }
      render();
    } catch { toast("No se pudo cambiar el orden."); }
    moving = false;
  }

  // ---------- detalle ----------
  function levelPanel(L, adv) {
    const p = el("div", { class: "panel" });
    if (!levelHasContent(L)) { p.append(el("p", { class: "empty-level", text: "Sin detalles." })); return p; }
    if (adv && L.variant) p.append(el("div", { class: "variant-name", text: L.variant }));
    const m = mediaNode(L.media); if (m) p.append(m);
    if (L.dose) p.append(el("div", { class: "dose" + (adv ? " adv" : "") }, el("span", { class: "label", text: "Series · repeticiones · tiempo" }), el("span", { class: "val", text: L.dose })));
    if (L.instructions) p.append(el("div", { class: "field" }, el("span", { class: "label", text: "Cómo hacerlo" }), el("p", { class: "instr", text: L.instructions })));
    return p;
  }
  function openDetail(id) { currentId = id; currentLevel = "normal"; renderDetail(); $("detail").classList.add("open"); }
  function closeDetail() { $("detail").classList.remove("open"); currentId = null; }
  function renderDetail() {
    const e = exercises.find(x => x.id === currentId);
    if (!e) { closeDetail(); return; }
    $("dTitle").textContent = e.name || "Sin nombre";
    $("dCopy").hidden = students.length < 2;
    const body = $("dBody"); body.replaceChildren();
    if (!levelHasContent(e.advanced)) { const only = levelPanel(e.normal, false); only.style.flex = "none"; body.append(only); return; }
    const bN = el("button", { "aria-pressed": "true" }, "Normal");
    const bA = el("button", { class: "adv", "aria-pressed": "false" }, "Avanzado");
    const slides = el("div", { class: "slides" }, levelPanel(e.normal, false), levelPanel(e.advanced, true));
    const mark = (l) => { currentLevel = l; bN.setAttribute("aria-pressed", String(l === "normal")); bA.setAttribute("aria-pressed", String(l === "advanced")); };
    const go = (l, smooth) => { mark(l); slides.scrollTo({ left: l === "advanced" ? slides.scrollWidth : 0, behavior: smooth ? "smooth" : "auto" }); };
    bN.addEventListener("click", () => go("normal", true));
    bA.addEventListener("click", () => go("advanced", true));
    slides.addEventListener("scroll", () => mark(slides.scrollLeft > slides.clientWidth / 2 ? "advanced" : "normal"), { passive: true });
    body.append(el("div", { class: "seg", role: "group", "aria-label": "Nivel" }, bN, bA), slides);
    const l = currentLevel; requestAnimationFrame(() => go(l, false));
  }

  // ---------- copiar ----------
  function openCopy() {
    const e = exercises.find(x => x.id === currentId); if (!e) return;
    const list = $("cpList"); list.replaceChildren();
    students.slice().sort(byOrd).filter(s => s.id !== e.student_id).forEach(s =>
      list.append(el("button", { onclick: () => copyTo(e, s) }, el("span", { class: "avatar", text: initials(s.name) }), s.name)));
    $("copy").classList.add("open");
  }
  async function copyTo(e, s) {
    $("copy").classList.remove("open");
    const others = exOf(s.id);
    const row = toRow({ ...e, id: crypto.randomUUID(), student_id: s.id, ord: others.length ? Math.max(...others.map(x => x.ord)) + 1 : 0 });
    const { error } = await sb.from("exercises").insert(row);
    if (error) { toast("No se pudo copiar."); return; }
    toast("Copiado a " + s.name); refresh();
  }

  // ---------- formulario de ejercicio ----------
  const emptyLevel = () => ({ dose: "", instructions: "", variant: "", media: null, mode: "file", pendingFile: null, previewUrl: null, linkUrl: "" });
  function fillDraft(e) {
    draft = { normal: emptyLevel(), advanced: emptyLevel() };
    for (const { key } of LEVELS) {
      const src = e?.[key] || {};
      Object.assign(draft[key], { dose: src.dose || "", instructions: src.instructions || "", variant: src.variant || "", media: src.media || null });
      if (src.media && src.media.kind !== "image" && src.media.kind !== "video") { draft[key].mode = "link"; draft[key].linkUrl = src.media.url; }
    }
    draft.hasAdv = levelHasContent(e?.advanced);
    draft.position = e?.position || "";
    $("fName").value = e?.name || "";
    renderPositions(); renderLevels();
  }
  function templates() {
    const byName = new Map();
    for (const e of exercises) {
      const k = (e.name || "").trim().toLowerCase(); if (!k) continue;
      const cur = byName.get(k);
      if (!cur || (e.updated_at || "") > (cur.updated_at || "")) byName.set(k, e);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }
  function renderTemplates(open) {
    const box = $("fTpl"); box.replaceChildren();
    const list = editingId ? [] : templates();
    box.hidden = !list.length; if (!list.length) return;
    box.append(el("button", { type: "button", class: "tpl-toggle", "aria-expanded": String(!!open), onclick: () => renderTemplates(!open) },
      el("span", null, "Usar un ejercicio ya creado"), el("span", { class: "tpl-n", text: String(list.length) })));
    if (!open) return;
    const ul = el("div", { class: "tpl-list" });
    list.forEach(e => {
      const p = posOf(e.position);
      ul.append(el("button", { type: "button", onclick: () => { fillDraft(e); renderTemplates(false); toast("Rellenado con “" + e.name + "”."); } },
        el("i", { style: "background:" + (p ? p.color : "var(--adv)") }), el("span", { class: "tpl-name", text: e.name })));
    });
    box.append(ul);
  }
  function openForm(id) {
    editingId = id || null;
    const e = id ? exercises.find(x => x.id === id) : null;
    fillDraft(e);
    $("fTitle").textContent = e ? "Editar ejercicio" : "Nuevo ejercicio";
    $("fErr").hidden = true;
    renderTemplates(false);
    $("form").classList.add("open");
  }
  function renderPositions() {
    const box = $("fPos"); box.replaceChildren();
    POSITIONS.forEach(p => box.append(el("button", { type: "button", "aria-pressed": String(draft.position === p.key),
      onclick: () => { draft.position = draft.position === p.key ? "" : p.key; renderPositions(); } }, el("i", { style: "background:" + p.color }), p.label)));
  }
  function closeForm() {
    for (const { key } of LEVELS) if (draft?.[key]?.previewUrl) URL.revokeObjectURL(draft[key].previewUrl);
    draft = null; editingId = null; $("form").classList.remove("open");
  }
  function renderLevels() {
    const wrap = $("levels"); wrap.replaceChildren();
    LEVELS.forEach(({ key, title }) => {
      const L = draft[key];
      if (key === "advanced" && !draft.hasAdv) {
        wrap.append(el("button", { type: "button", class: "add-adv", onclick: () => { draft.hasAdv = true; renderLevels(); } }, el("span", { class: "tag" }), "Añadir versión avanzada (opcional)"));
        return;
      }
      const head = el("h3", null, el("span", { class: "tag" }), key === "normal" && !draft.hasAdv ? "Ejercicio" : title);
      if (key === "advanced") head.append(el("button", { type: "button", class: "rm-adv", onclick: () => { draft.hasAdv = false; renderLevels(); } }, "Quitar"));
      const box = el("section", { class: "level" + (key === "advanced" ? " adv-box" : "") }, head);
      if (key === "advanced") {
        const vin = el("input", { id: "f-adv-variant", type: "text", placeholder: "Opcional. Ej.: con mancuernas de 8 kg", value: L.variant });
        vin.addEventListener("input", () => L.variant = vin.value);
        box.append(el("div", { class: "field" }, el("label", { for: vin.id, text: "Nombre de la variante" }), vin));
      }
      const din = el("input", { id: "f-" + key + "-dose", type: "text", placeholder: "Ej.: 3 × 10, o 2 minutos", value: L.dose });
      din.addEventListener("input", () => L.dose = din.value);
      box.append(el("div", { class: "field" }, el("label", { for: din.id, text: "Series, repeticiones o tiempo" }), din));
      const mfield = el("div", { class: "field" }, el("span", { class: "flabel", text: "Vídeo o foto" }),
        el("div", { class: "mtabs", role: "group" },
          el("button", { type: "button", "aria-pressed": String(L.mode === "file"), onclick: () => { L.mode = "file"; renderLevels(); } }, "Foto o vídeo del móvil"),
          el("button", { type: "button", "aria-pressed": String(L.mode === "link"), onclick: () => { L.mode = "link"; renderLevels(); } }, "Enlace (YouTube o Drive)")));
      if (L.mode === "link") {
        const yin = el("input", { id: "f-" + key + "-yt", type: "url", inputmode: "url", placeholder: "https://…", value: L.linkUrl });
        yin.addEventListener("input", () => L.linkUrl = yin.value);
        mfield.append(yin);
      } else {
        const hasFile = L.pendingFile || (L.media && (L.media.kind === "image" || L.media.kind === "video"));
        if (hasFile) {
          const isVid = L.pendingFile ? L.pendingFile.type.startsWith("video") : L.media.kind === "video";
          const src = L.previewUrl || L.media.url;
          mfield.append(el("div", { class: "preview" },
            isVid ? el("video", { src, controls: true, playsinline: true, preload: "metadata" }) : el("img", { src, alt: "" }),
            el("button", { type: "button", class: "rm", onclick: () => { if (L.previewUrl) URL.revokeObjectURL(L.previewUrl); L.pendingFile = null; L.previewUrl = null; L.media = null; renderLevels(); } }, "Quitar")));
        }
        const fin = el("input", { id: "f-" + key + "-file", type: "file", accept: "image/*,video/*" });
        fin.addEventListener("change", () => {
          const f = fin.files && fin.files[0]; if (!f) return;
          if (f.size > MAX_BYTES) { toast("Este archivo pesa " + Math.round(f.size / 1048576) + " MB. El límite es 50 MB.", 4200); fin.value = ""; return; }
          if (L.previewUrl) URL.revokeObjectURL(L.previewUrl);
          L.pendingFile = f; L.previewUrl = URL.createObjectURL(f); renderLevels();
        });
        mfield.append(el("label", { class: "pick", for: fin.id }, svg(icons.cam), hasFile ? "Cambiar foto o vídeo" : "Hacer o elegir foto/vídeo", fin),
          el("p", { class: "hint", text: "Vídeos de hasta 50 MB." }));
      }
      box.append(mfield);
      const tin = el("textarea", { id: "f-" + key + "-instr", placeholder: "Cómo se hace, qué sentir, qué evitar…" });
      tin.value = L.instructions; tin.addEventListener("input", () => L.instructions = tin.value);
      box.append(el("div", { class: "field" }, el("label", { for: tin.id, text: "Instrucciones" }), tin));
      wrap.append(box);
    });
  }
  async function shrinkImage(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5 * 1048576) return file;
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return (await new Promise(r => c.toBlob(r, "image/jpeg", 0.85))) || file;
    } catch { return file; }
  }
  async function upload(file) {
    const isVid = file.type.startsWith("video");
    const blob = isVid ? file : await shrinkImage(file);
    const ext = isVid ? ((file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4") : (blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg").toLowerCase());
    const path = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    const { error } = await sb.storage.from("media").upload(path, blob, { contentType: blob.type || file.type, cacheControl: "31536000", upsert: false });
    if (error) throw error;
    const url = sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    return { kind: isVid ? "video" : "image", path, url };
  }
  async function saveExercise() {
    const name = $("fName").value.trim(), err = $("fErr");
    err.hidden = true;
    if (!name) { err.textContent = "Escribe el nombre del ejercicio."; err.hidden = false; return; }
    const btn = $("fSave"); btn.disabled = true; btn.textContent = "Guardando…";
    const toDelete = [];
    try {
      const prev = editingId ? exercises.find(x => x.id === editingId) : null;
      const e = { id: prev?.id || crypto.randomUUID(), student_id: prev?.student_id || studentId, name, position: draft.position || "" };
      for (const { key } of LEVELS) {
        const L = draft[key];
        const old = prev?.[key]?.media;
        if (key === "advanced" && !draft.hasAdv) { if (old?.path) toDelete.push(old.path); e.advanced = null; continue; }
        let media = null;
        if (L.mode === "link") { const u = L.linkUrl.trim(); if (u && !/^https?:\/\//i.test(u)) throw new Error("link"); media = u ? { kind: "link", url: u } : null; }
        else if (L.pendingFile) { btn.textContent = L.pendingFile.type.startsWith("video") ? "Subiendo vídeo…" : "Subiendo foto…"; media = await upload(L.pendingFile); }
        else if (L.media && (L.media.kind === "image" || L.media.kind === "video")) media = L.media;
        if (old?.path && old.path !== media?.path) toDelete.push(old.path);
        e[key] = { dose: L.dose.trim(), instructions: L.instructions.trim(), variant: key === "advanced" ? L.variant.trim() : "", media };
      }
      if (prev) e.ord = prev.ord; else { const others = exOf(e.student_id); e.ord = others.length ? Math.max(...others.map(x => x.ord)) + 1 : 0; }
      const { error } = await sb.from("exercises").upsert(toRow(e));
      if (error) throw error;
      exercises = exercises.filter(x => x.id !== e.id).concat([{ ...e, updated_at: new Date().toISOString() }]);
      await removeFiles(toDelete.filter(p => !pathInUse(p, [e.id])));
      closeForm(); toast(prev ? "Ejercicio actualizado" : "Ejercicio añadido");
      await refresh();
    } catch (x) {
      err.textContent = x?.message === "link" ? "El enlace tiene que empezar con https://"
        : /exceed|size|large/i.test(x?.message || "") ? "El archivo es demasiado grande (máximo 50 MB)."
        : /jwt|auth|session/i.test(x?.message || "") ? "Tu sesión caducó. Cierra sesión y vuelve a entrar."
        : "No se pudo guardar. Revisa la conexión e inténtalo de nuevo.";
      err.hidden = false;
    }
    btn.disabled = false; btn.textContent = "Guardar";
  }
  async function deleteExercises(list) {
    const ids = list.map(e => e.id);
    if (!ids.length) return;
    const { error } = await sb.from("exercises").delete().in("id", ids);
    if (error) throw error;
    const paths = [...new Set(list.flatMap(mediaPaths))].filter(p => !pathInUse(p, ids));
    exercises = exercises.filter(x => !ids.includes(x.id));
    await removeFiles(paths);
  }

  // ---------- alumnos ----------
  function openStudentForm(id) {
    editingStudent = id || null;
    const s = id ? students.find(x => x.id === id) : null;
    $("sTitle").textContent = s ? "Editar alumno" : "Nuevo alumno";
    $("sName").value = s?.name || ""; $("sDelete").hidden = !s; $("sErr").hidden = true;
    $("sForm").classList.add("open"); setTimeout(() => $("sName").focus(), 60);
  }
  async function saveStudent() {
    const name = $("sName").value.trim();
    if (!name) { $("sErr").textContent = "Escribe el nombre del alumno."; $("sErr").hidden = false; return; }
    const btn = $("sSave"); btn.disabled = true;
    try {
      if (editingStudent) {
        const { error } = await sb.from("students").update({ name }).eq("id", editingStudent); if (error) throw error;
        $("sForm").classList.remove("open"); await refresh();
      } else {
        const id = crypto.randomUUID();
        const { error } = await sb.from("students").insert({ id, name, ord: students.length ? Math.max(...students.map(x => x.ord)) + 1 : 0 });
        if (error) throw error;
        $("sForm").classList.remove("open"); await refresh(); openStudent(id); toast(name + " añadido");
      }
    } catch { $("sErr").textContent = "No se pudo guardar. Inténtalo de nuevo."; $("sErr").hidden = false; }
    btn.disabled = false;
  }
  function ask(title, text, action) { $("cTitle").textContent = title; $("cText").textContent = text; confirmAction = action; $("confirm").classList.add("open"); }

  async function importOld() {
    const data = window.IMPORT_DATA; if (!data) return;
    try {
      toast("Importando…", 10000);
      const map = {};
      const srows = data.students.map((s, i) => { map[s.id] = crypto.randomUUID(); return { id: map[s.id], name: s.name, ord: i }; });
      let r = await sb.from("students").insert(srows); if (r.error) throw r.error;
      const erows = data.exercises.map(e => toRow({ id: crypto.randomUUID(), student_id: map[e.studentId], name: e.name, ord: e.order, position: e.position,
        normal: e.normal ? { dose: e.normal.dose || "", instructions: e.normal.instructions || "", variant: "", media: null } : null,
        advanced: e.advanced ? { dose: e.advanced.dose || "", instructions: e.advanced.instructions || "", variant: e.advanced.variant || "", media: null } : null }));
      r = await sb.from("exercises").insert(erows); if (r.error) throw r.error;
      toast("Fichas importadas. Ahora añade los vídeos a cada ejercicio.", 5000);
      await refresh();
    } catch { toast("No se pudo importar. Inténtalo de nuevo."); }
  }

  // ---------- login ----------
  function renderLogin(msg) {
    document.body.className = "login";
    $("fab").hidden = true;
    const top = $("top"), main = $("list");
    top.replaceChildren(el("span", { class: "eyebrow", text: "Ficha de ejercicios" }), el("h1", { class: "disp", text: "Entrar" }),
      el("p", { text: "Área de la entrenadora." }));
    const email = el("input", { id: "lEmail", type: "email", autocomplete: "username", placeholder: "tu@email.com" });
    const pass = el("input", { id: "lPass", type: "password", autocomplete: "current-password", placeholder: "Contraseña" });
    const err = el("p", { class: "err", text: msg || "", hidden: !msg });
    const btn = el("button", { class: "btn primary", type: "submit" }, "Entrar");
    const form = el("form", { class: "login-box" },
      el("div", { class: "field" }, el("label", { for: "lEmail", text: "Email" }), email),
      el("div", { class: "field" }, el("label", { for: "lPass", text: "Contraseña" }), pass), err, btn);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault(); btn.disabled = true; btn.textContent = "Entrando…";
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      btn.disabled = false; btn.textContent = "Entrar";
      if (error) { err.textContent = "Email o contraseña incorrectos."; err.hidden = false; return; }
      startTeacher();
    });
    main.className = ""; main.replaceChildren(form);
    const last = lsGet("ultimaFicha");
    if (last) main.append(el("p", { class: "hint", style: "text-align:center;margin-top:18px" }, el("a", { href: studentLink(last) }, "Soy alumno: ver mi ficha")));
  }
  async function logout() { await sb.auth.signOut(); renderLogin(); }
  async function startTeacher() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { renderLogin(); return; }
    const h = location.hash.slice(1);
    if (h.startsWith("s-")) { view = "student"; studentId = h.slice(2); }
    render();
    try { await refresh(); } catch { toast("No se pudieron cargar los datos. Revisa la conexión."); }
  }

  // ---------- eventos ----------
  function wire() {
    $("fab").addEventListener("click", () => view === "student" ? openForm() : openStudentForm());
    $("dClose").addEventListener("click", closeDetail);
    $("dEdit").addEventListener("click", () => openForm(currentId));
    $("dCopy").addEventListener("click", openCopy);
    $("cpClose").addEventListener("click", () => $("copy").classList.remove("open"));
    $("dDelete").addEventListener("click", () => {
      const e = exercises.find(x => x.id === currentId); if (!e) return;
      ask("¿Eliminar ejercicio?", "“" + e.name + "” saldrá de la ficha.", async () => {
        try { await deleteExercises([e]); closeDetail(); toast("Ejercicio eliminado"); await refresh(); } catch { toast("No se pudo eliminar."); }
      });
    });
    $("fCancel").addEventListener("click", closeForm);
    $("fSave").addEventListener("click", saveExercise);
    $("sCancel").addEventListener("click", () => $("sForm").classList.remove("open"));
    $("sSave").addEventListener("click", saveStudent);
    $("sName").addEventListener("keydown", (ev) => { if (ev.key === "Enter") saveStudent(); });
    $("sDelete").addEventListener("click", () => {
      const s = students.find(x => x.id === editingStudent); if (!s) return;
      const n = exOf(s.id).length;
      $("sForm").classList.remove("open");
      ask("¿Eliminar a " + s.name + "?", n ? "Se borrarán el alumno y los " + n + " ejercicios de su ficha." : "Se borrará el alumno.", async () => {
        try { await deleteExercises(exOf(s.id)); const { error } = await sb.from("students").delete().eq("id", s.id); if (error) throw error; goHome(); toast(s.name + " eliminado"); await refresh(); }
        catch { toast("No se pudo eliminar."); }
      });
    });
    $("cNo").addEventListener("click", () => $("confirm").classList.remove("open"));
    $("cYes").addEventListener("click", async () => { $("confirm").classList.remove("open"); const a = confirmAction; confirmAction = null; if (a) await a(); });
    for (const id of ["detail", "copy", "confirm"]) $(id).addEventListener("click", (ev) => { if (ev.target === $(id)) { if (id === "detail") closeDetail(); else $(id).classList.remove("open"); } });
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      for (const id of ["confirm", "copy", "sForm"]) if ($(id).classList.contains("open")) { $(id).classList.remove("open"); return; }
      if ($("form").classList.contains("open")) closeForm(); else if ($("detail").classList.contains("open")) closeDetail();
    });
  }

  // ---------- arranque ----------
  wire();
  if (alumnoId) startAlumno();
  else if (!window.supabase) {
    const last = lsGet("ultimaFicha");
    $("top").replaceChildren(el("h1", { class: "disp", text: "Sin conexión" }));
    $("list").replaceChildren(el("div", { class: "status" }, el("p", { text: "Conéctate a internet para entrar." }),
      last ? el("a", { class: "btn primary", style: "margin-top:14px;display:inline-block", href: studentLink(last) }, "Ver mi ficha") : null));
  } else {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    startTeacher();
  }
})();
