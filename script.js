const DOCS = {
  regles: {
    file: "reglesFCBQ.md",
    subtitle: "Regles FIBA 2024 adaptades per l'FCBQ",
    bodyClass: "doc-regles",
  },
  interps: {
    file: "interpretacionsFCBQ.md",
    subtitle: "Interpretacions oficials de les Regles de Joc · FCBQ",
    bodyClass: "doc-interps",
  },
};

let currentKey = null;
let markdownCache = {};
let spyObserver = null;
let spyLinks = {};
let docIndex = {};
let currentQuery = "";
let viewMode = "normal";
const sidePairIndex = { articles: new Map(), banners: new Map(), miscByTitle: new Map() };

document.addEventListener("DOMContentLoaded", () => {
  init();
});

async function init() {
  document.querySelectorAll(".doc-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchDocTabs(btn.dataset.doc));
  });

  const search = document.getElementById("search");
  search.addEventListener("input", () => scheduleSearch());
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = resultsPanel().querySelector(".search-result");
      if (first) {
        e.preventDefault();
        jumpTo(first.dataset.target);
      }
    }
  });

  resultsPanel().addEventListener("click", (e) => {
    const btn = e.target.closest(".search-result");
    if (btn) {
      e.preventDefault();
      jumpTo(btn.dataset.target);
    }
  });

  const toggle = document.getElementById("sidebar-toggle");
  toggle.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  document.getElementById("sidebar-nav").addEventListener("click", (e) => {
    const a = e.target.closest(".sidebar-link[data-pair]");
    if (!a) return;
    e.preventDefault();
    jumpToPair(parseInt(a.dataset.pair, 10));
  });

  initViewMode();
  switchDoc("regles");
}

function setActiveTab(key) {
  document.querySelectorAll(".doc-tab").forEach((btn) => {
    const active = btn.dataset.doc === key;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  const doc = DOCS[key];
  if (doc) document.getElementById("doc-subtitle").textContent = doc.subtitle;
}

function switchDocTabs(key) {
  const doc = DOCS[key];
  if (!doc) return;
  setActiveTab(key);
  if (viewMode === "side-by-side") {
    currentKey = key;
    buildSideNavForPairs(key);
    return;
  }
  switchDoc(key);
}

async function switchDoc(key) {
  const doc = DOCS[key];
  if (!doc || key === currentKey) return;
  currentKey = key;

  setActiveTab(key);
  document.body.classList.remove("doc-regles", "doc-interps");
  document.body.classList.add(doc.bodyClass);

  if (!(key in markdownCache)) {
    try {
      markdownCache[key] = await fetchText(doc.file);
    } catch (error) {
      console.error(`No s'ha pogut carregar ${doc.file}`, error);
      showError(`No s'ha pogut carregar el document ${doc.file}.`);
      currentKey = null;
      return;
    }
  }

  renderDoc(key);

  document.getElementById("content-scroll").scrollTop = 0;
  document.getElementById("reglament").focus({ preventScroll: true });
  resetSearch();
}

function renderDoc(key) {
  const markdown = annotateMarkdown(markdownCache[key]);
  const html = marked.parse(markdown, { headerIds: true, mangle: false });

  const container = document.getElementById("reglament");
  container.innerHTML = html;

  ensureHeadingIds(container);
  wrapSections(container);
  buildSidebarNav(container);
  buildSearchIndex(container);
  initScrollSpy();
}

function annotateMarkdown(markdown) {
  const regex = /(^|\r?\n):::\s*annex\s*\r?\n([\s\S]*?)\r?\n:::/gi;
  return markdown.replace(regex, (match, prefix, content) => {
    return `${prefix}<div class="annex">\n${content.trim()}\n</div>`;
  });
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.text();
}

function showError(message) {
  const container = document.getElementById("reglament");
  container.innerHTML = `<div class="sidebar-msg">${message}</div>`;
}

/* ---------- ids d'encapçalaments ---------- */

const DIACRITICS = {
  á: "a", à: "a", â: "a", ä: "a", ã: "a", å: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", ö: "o", õ: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ñ: "n", ç: "c", ß: "ss", ø: "o", æ: "ae",
};

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\x00-\x7F]/g, (ch) => DIACRITICS[ch] || "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "heading";
}

function ensureHeadingIds(container) {
  const usedIds = new Set();
  container.querySelectorAll("h1, h2, h3, h4").forEach((heading) => {
    let id = heading.id || slugify(heading.textContent || "");
    let candidate = id;
    let counter = 1;
    while (usedIds.has(candidate)) {
      candidate = `${id}-${counter++}`;
    }
    heading.id = candidate;
    usedIds.add(candidate);
  });
}

/* ---------- agrupació de seccions ---------- */

function wrapSections(container) {
  wrapHeadingGroup(container, "h2", "div", (node) => node.classList.add("article"), ["h2"]);
  wrapHeadingGroup(container, "h3", "div", (node) => node.classList.add("epigraf"), ["h2", "h3"]);
}

function wrapHeadingGroup(container, headingSelector, wrapperTag, initWrapper, stopAtTags) {
  container.querySelectorAll(headingSelector).forEach((heading) => {
    const wrapper = document.createElement(wrapperTag);
    if (initWrapper) initWrapper(wrapper);

    let next = heading.nextElementSibling;
    heading.parentNode.insertBefore(wrapper, heading);
    wrapper.appendChild(heading);

    while (next && !stopAtTags.includes(next.tagName.toLowerCase())) {
      const current = next;
      next = next.nextElementSibling;
      wrapper.appendChild(current);
    }
  });
}

/* ---------- índex (sidebar) ---------- */

function isMajorHeading(heading) {
  const t = heading.textContent.replace(/\s+/g, " ").trim();
  return /^(?:Art(?:icle|icles|\.)\s+\d|ANNEX\b|Annex\b|Apèndi[ctx]\b|Apèndi[ctx]s\b)/i.test(t);
}

function buildSidebarNav(container) {
  const nav = document.getElementById("sidebar-nav");
  nav.innerHTML = "";

  const heads = [];
  container.querySelectorAll("h1, h2, h3").forEach((h) => {
    if (isMajorHeading(h)) heads.push(h);
  });
  if (heads.length === 0) {
    nav.appendChild(msgEl("No hi ha índex per a aquest document."));
    return;
  }

  const rootUl = document.createElement("ul");
  rootUl.className = "sidebar-tree";
  heads.forEach((h) => {
    const li = document.createElement("li");
    li.appendChild(linkEl(h));
    rootUl.appendChild(li);
  });
  nav.appendChild(rootUl);
}

function linkEl(heading) {
  const a = document.createElement("a");
  a.className = "sidebar-link";
  a.href = `#${heading.id}`;
  a.textContent = heading.textContent.replace(/\s+/g, " ").trim();
  return a;
}

function msgEl(text) {
  const div = document.createElement("div");
  div.className = "sidebar-msg";
  div.textContent = text;
  return div;
}

function filterSidebar(queryRaw) {
  const q = queryRaw.trim().toLowerCase();
  const items = document.querySelectorAll("#sidebar-nav .sidebar-tree li");
  if (!q) {
    items.forEach((li) => li.classList.remove("hidden"));
    return;
  }
  items.forEach((li) => {
    const hit = Array.from(li.querySelectorAll(".sidebar-link")).some((a) =>
      a.textContent.toLowerCase().includes(q)
    );
    li.classList.toggle("hidden", !hit);
  });
}

/* ---------- scroll-spy ---------- */

function initScrollSpy() {
  if (spyObserver) spyObserver.disconnect();
  spyLinks = {};

  document.querySelectorAll(".sidebar-link").forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    if (id) spyLinks[id] = a;
  });

  const content = document.getElementById("content-scroll");
  const targets = [];
  document.querySelectorAll("#reglament h1, #reglament h2, #reglament h3").forEach((h) => {
    if (h.id && spyLinks[h.id]) targets.push(h);
  });

  const setActive = (id) => {
    document.querySelectorAll(".sidebar-link.active").forEach((a) => a.classList.remove("active"));
    const anchor = spyLinks[id];
    if (anchor) anchor.classList.add("active");
  };

  spyObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActive(visible[0].target.id);
    },
    { root: content, rootMargin: "-30% 0px -55% 0px", threshold: 0 }
  );

  targets.forEach((t) => spyObserver.observe(t));
  if (targets.length) setActive(targets[0].id);
}

/* ---------- cerca dins del reglament ---------- */

function resultsPanel() {
  return document.getElementById("search-results");
}

function normalizeText(t) {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DIACRITIC_CLASSES = {
  a: "[aàáâäãåāăą]",
  e: "[eèéêëēėę]",
  i: "[iìíîïĩī]",
  o: "[oòóôöõōø]",
  u: "[uùúûüũū]",
  n: "[nñń]",
  c: "[cçćč]",
  y: "[yýÿ]",
  s: "[sśš]",
  z: "[zźżž]",
  g: "[gğģ]",
  l: "[lłĺľ]",
  d: "[dďđ]",
  t: "[tťŧ]",
  r: "[rřŕ]",
  k: "[kķ]",
  w: "[wŵẅ]",
  h: "[hĥ]",
  m: "[mṃ]",
};

function accentFlexPattern(token) {
  return token
    .split("")
    .map((ch) => (Object.prototype.hasOwnProperty.call(DIACRITIC_CLASSES, ch) ? DIACRITIC_CLASSES[ch] : escapeRegExp(ch)))
    .join("");
}

function tokenize(query) {
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean);
}

let searchTimer = null;
function scheduleSearch() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => onSearchChange(), 120);
}

function onSearchChange() {
  const q = document.getElementById("search").value;
  currentQuery = q;
  filterSidebar(q);
  const panel = resultsPanel();
  if (!q.trim()) {
    resetSearch();
    return;
  }
  const segments = docIndex[currentKey] || [];
  const tokens = tokenize(q);
  if (!tokens.length) {
    panel.hidden = true;
    clearMarks();
    return;
  }
  const matched = segments
    .filter((s) => tokens.every((t) => s.norm.includes(t)))
    .sort((a, b) => {
      const sA = tokens.reduce((n, t) => n + (a.norm.includes(t) ? 3 : 0) + (normalizeText(a.title).includes(t) ? 2 : 0), 0);
      const sB = tokens.reduce((n, t) => n + (b.norm.includes(t) ? 3 : 0) + (normalizeText(b.title).includes(t) ? 2 : 0), 0);
      return sB - sA;
    });
  highlightWith(document.getElementById("reglament"), q);
  applyEpigraphHighlights(matched);
  renderSearchResults(matched.slice(0, 24), matched.length, q);
}

function renderSearchResults(results, total, query) {
  const panel = resultsPanel();
  const q = normalizeText(query);
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!total) {
    panel.innerHTML = `<div class="search-msg">Sense resultats per a «${escHtml(query.trim())}»</div>`;
    panel.hidden = false;
    return;
  }
  const shown = results.length < total ? `Mostrant ${results.length} de ` : "";
  const rows = results.map((s) => {
    const snippet = makeSnippet(s.text, tokens[0] || "");
    return `<button class="search-result" data-target="#${escHtml(s.id)}"><span class="search-result-title">${escHtml(s.title)}</span><span class="search-result-snippet">${escHtml(snippet)}</span></button>`;
  });
  panel.innerHTML =
    `<div class="search-count">${shown}${total} resultat${total !== 1 ? "s" : ""}</div>` +
    rows.join("");
  panel.hidden = false;
}

function makeSnippet(text, token) {
  if (!text) return "";
  const m = new RegExp(accentFlexPattern(token), "i").exec(text);
  if (!m) return text.slice(0, 120) + (text.length > 120 ? "…" : "");
  const idx = m.index;
  const start = Math.max(0, idx - 55);
  const end = Math.min(text.length, idx + m[0].length + 65);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function escHtml(s) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}

function jumpTo(id) {
  const el = document.getElementById(String(id).replace(/^#/, ""));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.remove("search-flash");
  void el.offsetWidth;
  el.classList.add("search-flash");
  if (spyLinks[id]) {
    document.querySelectorAll(".sidebar-link.active").forEach((a) => a.classList.remove("active"));
    spyLinks[id].classList.add("active");
  }
}

function highlightWith(container, query) {
  clearMarks();
  const tokens = tokenize(query);
  if (!tokens.length) return;
  const pattern = tokens.map(accentFlexPattern).join("|");
  const re = new RegExp("(" + pattern + ")", "gi");
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent.trim()) continue;
    nodes.push(n);
  }
  let count = 0;
  const maxMarks = 3000;
  for (const node of nodes) {
    if (count >= maxMarks) break;
    re.lastIndex = 0;
    if (!re.test(node.textContent)) {
      re.lastIndex = 0;
      continue;
    }
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = re.exec(node.textContent)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (last < m.index) frag.appendChild(document.createTextNode(node.textContent.slice(last, m.index)));
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = m.index + m[0].length;
      count++;
      if (count >= maxMarks) break;
    }
    if (last < node.textContent.length) frag.appendChild(document.createTextNode(node.textContent.slice(last)));
    if (last > 0) node.parentNode.replaceChild(frag, node);
    re.lastIndex = 0;
  }
}

function clearMarks() {
  document.querySelectorAll("#reglament mark.search-hit").forEach((m) => {
    m.replaceWith(document.createTextNode(m.textContent));
  });
  document.querySelectorAll("#reglament .epigraph-hit").forEach((el) => {
    el.classList.remove("epigraph-hit");
  });
}

function applyEpigraphHighlights(segments) {
  const container = document.getElementById("reglament");
  container.querySelectorAll(".epigraph-hit").forEach((el) => el.classList.remove("epigraph-hit"));
  segments.forEach((s) => s.el.classList.add("epigraph-hit"));
}

function resetSearch() {
  document.getElementById("search").value = "";
  resultsPanel().hidden = true;
  resultsPanel().innerHTML = "";
  currentQuery = "";
  clearMarks();
  filterSidebar("");
}

function buildSearchIndex(container) {
  const segments = [];
  const headings = Array.from(container.querySelectorAll("h1, h2, h3, h4"));
  headings.forEach((h, i) => {
    const next = headings[i + 1];
    const range = document.createRange();
    range.setStartAfter(h);
    if (next) range.setEndBefore(next);
    else range.selectNodeContents(container);
    const text = range.toString().replace(/\s+/g, " ").trim();
    segments.push({
      id: h.id,
      level: parseInt(h.tagName[1], 10),
      title: h.textContent.replace(/\s+/g, " ").trim(),
      text,
      norm: normalizeText(text),
      el: h,
    });
  });
  docIndex[currentKey] = segments;
}

/* ---------- modes de vista ---------- */

function initViewMode() {
  const wrap = document.getElementById("view-mode-select");
  const btn = document.getElementById("view-mode-btn");
  const options = document.getElementById("view-mode-options");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = wrap.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) {
      wrap.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }
  });
  options.querySelectorAll(".view-mode-option").forEach((opt) => {
    opt.addEventListener("click", () => setViewMode(opt.dataset.mode));
  });
}

async function setViewMode(mode) {
  if (mode === viewMode) return;
  viewMode = mode;

  document.querySelectorAll(".view-mode-option").forEach((o) => {
    const active = o.dataset.mode === mode;
    o.classList.toggle("active", active);
    o.setAttribute("aria-selected", String(active));
  });
  document.getElementById("view-mode-label").textContent =
    mode === "side-by-side" ? "Side by side" : "Normal";
  const wrap = document.getElementById("view-mode-select");
  wrap.classList.remove("open");
  document.getElementById("view-mode-btn").setAttribute("aria-expanded", "false");

  if (mode === "side-by-side") {
    document.getElementById("view-normal").hidden = true;
    document.getElementById("view-side").hidden = false;
    document.getElementById("sidebar").classList.remove("open");
    document.body.classList.remove("doc-regles", "doc-interps");
    resetSearch();
    const search = document.getElementById("search");
    search.disabled = true;
    search.placeholder = "Cerca disponible només en el mode Normal";
    if (!markdownCache.interps) {
      try {
        markdownCache.interps = await fetchText(DOCS.interps.file);
      } catch (error) {
        console.error("No s'ha pogut carregar interpretacions", error);
        showSideError(error.message);
        return;
      }
    }
    renderSideBySide();
  } else {
    document.getElementById("view-side").hidden = true;
    document.getElementById("view-normal").hidden = false;
    const search = document.getElementById("search");
    search.disabled = false;
    search.placeholder = "Cercar al document…";
    const target = currentKey || "regles";
    setActiveTab(target);
    if (!(target in markdownCache)) {
      await switchDoc(target);
    } else {
      renderDoc(target);
      document.body.classList.remove("doc-regles", "doc-interps");
      document.body.classList.add(DOCS[target].bodyClass);
    }
    onSearchChange();
  }
}

function renderSideBySide() {
  const leftBlocks = buildArticles(markdownCache.regles);
  const rightBlocks = buildArticles(markdownCache.interps);

  const rightByNum = new Map();
  const usedRight = new Set();
  rightBlocks.forEach((b) => {
    if (b.num != null && !rightByNum.has(b.num)) rightByNum.set(b.num, b);
  });

  const pairs = [];
  leftBlocks.forEach((b) => {
    if (b.kind === "regla") {
      pairs.push({ banner: b });
      return;
    }
    if (b.num != null) {
      pairs.push({ left: b, right: rightByNum.get(b.num) || null });
      if (rightByNum.has(b.num)) usedRight.add(b.num);
    } else {
      pairs.push({ left: b, right: null });
    }
  });
  rightBlocks.forEach((b) => {
    if (b.num == null || !usedRight.has(b.num)) {
      pairs.push({ left: null, right: b });
    }
  });

  const container = document.getElementById("side-pairs");
  container.innerHTML = "";
  pairs.forEach((pair, idx) => {
    const row = document.createElement("div");
    row.className = "side-pair";
    row.id = "pair-" + idx;
    if (pair.banner) {
      const cell = document.createElement("div");
      cell.className = "side-cell side-banner markdown-body";
      cell.innerHTML = renderSideArticle(pair.banner);
      row.appendChild(cell);
    } else {
      const l = document.createElement("div");
      l.className = "side-cell side-cell-left markdown-body";
      l.innerHTML = pair.left ? renderSideArticle(pair.left) : missingBlock();
      const r = document.createElement("div");
      r.className = "side-cell side-cell-right markdown-body";
      r.innerHTML = pair.right ? renderSideArticle(pair.right) : missingBlock();
      row.appendChild(l);
      row.appendChild(r);
    }
    container.appendChild(row);
  });

  wrapSections(container);
  indexPairs(pairs);
  buildSideNavForPairs(currentKey || "regles");
  initSideScrollSpy();
}

function indexPairs(pairs) {
  sidePairIndex.articles.clear();
  sidePairIndex.banners.clear();
  sidePairIndex.miscByTitle.clear();
  pairs.forEach((pair, idx) => {
    if (pair.banner) {
      sidePairIndex.banners.set(pair.banner.num, idx);
      return;
    }
    if (pair.left) {
      if (pair.left.num != null) sidePairIndex.articles.set(pair.left.num, idx);
      else sidePairIndex.miscByTitle.set(pair.left.title, idx);
    }
    if (pair.right) {
      if (pair.right.num != null) sidePairIndex.articles.set(pair.right.num, idx);
      else sidePairIndex.miscByTitle.set(pair.right.title, idx);
    }
  });
}

function buildSideNavForPairs(key) {
  const nav = document.getElementById("sidebar-nav");
  nav.innerHTML = "";

  const tmp = document.createElement("div");
  tmp.innerHTML = marked.parse(annotateMarkdown(markdownCache[key] || ""), { headerIds: true, mangle: false });
  ensureHeadingIds(tmp);
  wrapSections(tmp);

  const heads = [];
  tmp.querySelectorAll("h1, h2, h3").forEach((h) => {
    if (isMajorHeading(h)) heads.push(h);
  });
  if (heads.length === 0) {
    nav.appendChild(msgEl("No hi ha índex per a aquest document."));
    return;
  }

  const rootUl = document.createElement("ul");
  rootUl.className = "sidebar-tree";
  heads.forEach((h) => {
    const li = document.createElement("li");
    li.appendChild(sideLinkEl(h, resolvePairFor(h, null)));
    rootUl.appendChild(li);
  });
  nav.appendChild(rootUl);
}

function sideLinkEl(heading, idx) {
  const a = document.createElement("a");
  a.className = "sidebar-link";
  a.href = "#";
  if (idx != null) {
    a.dataset.pair = String(idx);
  } else {
    a.classList.add("disabled");
  }
  a.textContent = heading.textContent.replace(/\s+/g, " ").trim();
  return a;
}

function resolvePairFor(heading, fallbackIdx) {
  const text = heading.textContent.replace(/\s+/g, " ").trim();
  const numM = text.match(/\b([0-9]+)\b/);
  const num = numM ? parseInt(numM[1], 10) : null;
  let idx = null;
  if (/^Regla\b/i.test(text)) {
    idx = num != null ? (sidePairIndex.banners.get(num) ?? null) : null;
  } else if (/^(?:Art\.?|Articles?)\b/i.test(text)) {
    idx = num != null ? (sidePairIndex.articles.get(num) ?? null) : null;
  } else if (numM) {
    idx = sidePairIndex.articles.get(num) ?? null;
  }
  if (idx == null) idx = sidePairIndex.miscByTitle.get(text) ?? null;
  return idx != null ? idx : (fallbackIdx ?? null);
}

function initSideScrollSpy() {
  const scroller = document.getElementById("side-scroll");
  if (!scroller) return;
  const onScroll = () => {
    const rect = scroller.getBoundingClientRect();
    const line = rect.top + 12;
    let idx = null;
    document.querySelectorAll("#side-pairs .side-pair").forEach((p) => {
      if (p.getBoundingClientRect().top <= line) idx = p.id.slice("pair-".length);
    });
    document.querySelectorAll(".sidebar-link").forEach((a) => {
      a.classList.toggle("active", a.dataset.pair === String(idx));
    });
  };
  scroller.removeEventListener("scroll", onScroll);
  scroller.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function jumpToPair(idx) {
  const pair = document.getElementById("pair-" + idx);
  if (!pair) return;
  pair.scrollIntoView({ behavior: "smooth", block: "start" });
  pair.classList.remove("search-flash");
  void pair.offsetWidth;
  pair.classList.add("search-flash");
  document.querySelectorAll(".sidebar-link.active").forEach((x) => x.classList.remove("active"));
  const a = document.querySelector(`.sidebar-link[data-pair="${idx}"]`);
  if (a) a.classList.add("active");
}

function buildArticles(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let current = null;
  const scopeRe = /^(#{1,2})\s+(.*)$/;
  const numRe = /^(?:(?:Art|Art\.|Article|Articles|Regla)\s+)?([0-9]+)/;

  for (const line of lines) {
    const m = scopeRe.exec(line);
    if (m) {
      const level = m[1].length;
      const raw = m[2].replace(/<span class="secnum">([^<]*)<\/span>/, "$1").trim();
      const numM = numRe.exec(raw);
      if (numM) {
        if (current) blocks.push(current);
        const kind = /^Regla\b/.test(raw) ? "regla" : "article";
        current = { num: parseInt(numM[1], 10), kind, title: raw, content: line };
        continue;
      }
      if (level === 1) {
        if (current) blocks.push(current);
        current = { num: null, kind: "misc", title: raw, content: line };
        continue;
      }
    }
    if (current) current.content += "\n" + line;
  }
  if (current) blocks.push(current);
  return blocks;
}

function renderSideArticle(article) {
  const markdown = annotateMarkdown(article.content.trim());
  const html = marked.parse(markdown, { headerIds: false, mangle: false });
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  ensureHeadingIds(tmp);
  return tmp.innerHTML;
}

function missingBlock() {
  return '<div class="side-missing">Sense secció corresponent en aquest document.</div>';
}

function showSideError(message) {
  const html = `<div class="sidebar-msg">No s'ha pogut carregar el document: ${escHtml(message)}</div>`;
  document.getElementById("side-pairs").innerHTML = html;
}