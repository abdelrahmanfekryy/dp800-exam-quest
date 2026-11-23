/* DP-800 Exam Quest: a static, gamified practice exam.
 * Data: window.QUESTION_BANK (built by tools/build_questions.py).
 * State: localStorage only.
 */
(() => {
  "use strict";

  const BANK = window.QUESTION_BANK;
  const DOMAINS = BANK.domains;
  const QUESTIONS = BANK.questions;
  // The T-SQL notebook exam is a separate bank: it never mixes into the DP-800 exams, drills, study bank or mistakes
  const TSQL = window.TSQL_BANK || { sections: [], questions: [] };
  const TSQL_Q = TSQL.questions;
  const QMAP = Object.fromEntries([...QUESTIONS, ...TSQL_Q].map((q) => [q.id, q]));
  const DP_IDS = new Set(QUESTIONS.map((q) => q.id));
  const isDp = (id) => DP_IDS.has(id);
  const STORE_KEY = "dp800quest.v1";
  const SESSION_KEY = "dp800quest.session.v1";
  const PASS = 700;

  const SOURCES = {
    examtopics: { label: "ExamTopics", weight: 4 },
    assessment: { label: "Official practice assessment", weight: 4 },
    learn: { label: "Learn knowledge checks", weight: 2 },
    community: { label: "Community banks", weight: 1 },
  };
  const srcGroup = (q) => (["examtopics", "assessment", "learn"].includes(q.source) ? q.source : "community");
  const CONF_LABEL = {
    official: "Official answer",
    "official-q": "Official question",
    site: "Site answer",
    reviewed: "Explained answer",
    community: "Community answer",
    unverified: "Community · unverified",
    notebook: "Checked in the notebook",
  };

  const LEVEL_TITLES = [
    [1, "Query Novice"], [3, "SELECT Apprentice"], [5, "Index Tuner"], [7, "T-SQL Adept"],
    [9, "Security Sentinel"], [11, "Vector Voyager"], [13, "RAG Ranger"], [16, "Data Architect"],
    [20, "AI Database Sage"], [25, "SQL AI Grandmaster"],
  ];

  const BADGES = [
    { id: "first", ic: "🩸", name: "First Query", desc: "Answer your first question correctly" },
    { id: "streak5", ic: "🔥", name: "On Fire", desc: "5 correct answers in a row" },
    { id: "streak10", ic: "⚡", name: "Unstoppable", desc: "10 correct answers in a row" },
    { id: "streak25", ic: "🌋", name: "Legendary", desc: "25 correct answers in a row" },
    { id: "exam", ic: "🎓", name: "Exam Taker", desc: "Finish an exam simulation" },
    { id: "pass", ic: "🏆", name: "Certified-ish", desc: "Score 700+ in an exam simulation" },
    { id: "ace", ic: "💯", name: "Ace", desc: "Score 900+ in an exam simulation" },
    { id: "d1", ic: "🧱", name: "Schema Architect", desc: "900+ in Design & Develop (10+ questions)" },
    { id: "d2", ic: "🛡️", name: "Guardian", desc: "900+ in Secure, Optimize & Deploy (10+ questions)" },
    { id: "d3", ic: "🤖", name: "AI Whisperer", desc: "900+ in AI Capabilities (10+ questions)" },
    { id: "nopeek", ic: "🙈", name: "No Peeking", desc: "Finish a 20+ question exam without peeking" },
    { id: "speed", ic: "⏱️", name: "Speedrunner", desc: "Pass a 50+ question exam in under 1 min/question" },
    { id: "c100", ic: "💪", name: "Centurion", desc: "Answer 100 questions" },
    { id: "c500", ic: "🧠", name: "Grinder", desc: "Answer 500 questions" },
    { id: "all", ic: "📚", name: "Completionist", desc: "See every question in the bank" },
    { id: "redemption", ic: "🔁", name: "Redemption", desc: "Fix 10 questions you previously missed" },
    { id: "owl", ic: "🦉", name: "Night Owl", desc: "Study between midnight and 4 AM" },
  ];

  // ------------------------------------------------------------------ state
  const defaultState = () => ({
    xp: 0, badges: {}, qstats: {}, history: [], bestStreak: 0, answered: 0, correct: 0, redeemed: 0,
    prefs: { mode: "exam", count: 50, timed: true, instant: true, sources: Object.keys(SOURCES), domains: [1, 2, 3],
             tsqlOff: [], tsqlInstant: true },   // T-SQL sections switched off: new sections start switched on
  });
  let S = load(STORE_KEY) || defaultState();
  S = Object.assign(defaultState(), S);
  S.prefs = Object.assign(defaultState().prefs, S.prefs);
  let session = load(SESSION_KEY);
  let timerHandle = null;

  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  function saveSession() { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); }

  // ------------------------------------------------------------------ helpers
  const $ = (sel, el = document) => el.querySelector(sel);
  const app = $("#app");
  const md = (s) => (s ? marked.parse(s) : "");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const dom = (id) => DOMAINS.find((d) => d.id === id);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmtTime = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
  const LETTERS = "ABCDEFGH";

  function levelOf(xp) { let L = 1; while (xpFor(L + 1) <= xp) L++; return L; }
  function xpFor(L) { return 60 * (L - 1) * L; }
  function titleOf(L) { let t = LEVEL_TITLES[0][1]; for (const [l, n] of LEVEL_TITLES) if (L >= l) t = n; return t; }

  function award(id) {
    if (S.badges[id]) return;
    if (session && !session.instant && !session.finishing) {
      session.pendingBadges = session.pendingBadges || [];
      if (!session.pendingBadges.includes(id)) session.pendingBadges.push(id);
      return;
    }
    S.badges[id] = new Date().toISOString();
    const b = BADGES.find((x) => x.id === id);
    toast(b.ic, `Badge unlocked: ${b.name}`, b.desc);
    save();
  }

  function gainXP(n, el) {
    if (n <= 0) return;
    const before = levelOf(S.xp);
    S.xp += n;
    if (session) session.xp += n;
    const after = levelOf(S.xp);
    if (el) popXP(`+${n} XP`, el);
    if (after > before) { toast("⬆️", `Level up! Lv ${after}`, titleOf(after)); confetti(1200); }
    renderPlayer();
  }

  function popXP(text, el) {
    const r = el.getBoundingClientRect();
    const p = document.createElement("div");
    p.className = "xp-pop";
    p.textContent = text;
    p.style.left = r.left + r.width / 2 - 30 + "px";
    p.style.top = r.top - 10 + "px";
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }

  function toast(ic, title, sub) {
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<span class="ic">${ic}</span><div><b>${esc(title)}</b><div class="muted small">${esc(sub || "")}</div></div>`;
    $("#toasts").appendChild(t);
    setTimeout(() => { t.style.transition = "opacity .4s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 400); }, 3600);
  }

  // ------------------------------------------------------------------ confetti
  function confetti(ms = 2500) {
    const c = $("#confetti"), ctx = c.getContext("2d");
    c.width = innerWidth; c.height = innerHeight;
    const colors = ["#5b9dff", "#b57bff", "#20c9a6", "#ffd166", "#ff8fab", "#2ecc71"];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, r: 4 + Math.random() * 6,
      vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4, a: Math.random() * 6, va: -0.2 + Math.random() * 0.4,
      col: colors[(Math.random() * colors.length) | 0],
    }));
    const end = performance.now() + ms;
    (function frame(t) {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.col;
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
      }
      if (t < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, c.width, c.height);
    })(performance.now());
  }

  // ------------------------------------------------------------------ player bar
  function renderPlayer() {
    const L = levelOf(S.xp), lo = xpFor(L), hi = xpFor(L + 1);
    const pct = Math.min(100, ((S.xp - lo) / (hi - lo)) * 100);
    $("#player").innerHTML = `
      <span class="lvl-badge">Lv ${L}</span>
      <span class="title muted">${esc(titleOf(L))}</span>
      <span class="xpbar" title="${S.xp - lo} / ${hi - lo} XP to next level"><i style="width:${pct}%"></i></span>
      <span class="muted">⭐ ${S.xp} XP</span>`;
  }

  // ------------------------------------------------------------------ question selection
  function poolFor(domains, sources) {
    return QUESTIONS.filter((q) => domains.includes(q.domain) && sources.includes(srcGroup(q)));
  }
  function weightOf(q) {
    const st = S.qstats[q.id];
    let w = SOURCES[srcGroup(q)].weight;
    if (!st) w *= 2;
    else if (st.last === "wrong") w *= 2.5;
    else if (st.last === "correct") w *= 0.6;
    return w;
  }
  function weightedSample(pool, n) {
    const items = pool.map((q) => ({ q, k: Math.pow(Math.random(), 1 / weightOf(q)) }));
    items.sort((a, b) => b.k - a.k);
    return items.slice(0, n).map((x) => x.q);
  }
  // Keep questions that share a case study next to each other.
  function groupScenarios(list) {
    const groups = new Map();
    for (const q of list) {
      const key = q.scenario ? "s:" + q.scenario.slice(0, 200) : "q:" + q.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(q);
    }
    return [...groups.values()].flat();
  }
  function quotas(n, domains) {
    const mid = { 1: 37.5, 2: 37.5, 3: 25 };
    const tot = domains.reduce((a, d) => a + mid[d], 0);
    const q = {};
    let used = 0;
    domains.forEach((d) => { q[d] = Math.floor((n * mid[d]) / tot); used += q[d]; });
    // distribute remainder by largest fractional part
    const rem = domains.map((d) => [d, (n * mid[d]) / tot - q[d]]).sort((a, b) => b[1] - a[1]);
    for (let i = 0; used < n; i++, used++) q[rem[i % rem.length][0]]++;
    return q;
  }

  function buildItems(qs) {
    return qs.map((q) => {
      let order = q.options.map((o) => o.key);
      if (q.type !== "self" && !q.noShuffle) order = shuffle(order);
      const picked = isSlotQ(q) ? Array(slotQ(q).answer.length).fill(null) : [];
      return { id: q.id, order, picked, status: "pending", peeked: false, revealed: false, checked: false };
    });
  }

  function startSession(mode, opts = {}) {
    const p = S.prefs;
    let qs = [], title = "", sections = [];
    if (mode === "exam") {
      const doms = [1, 2, 3];
      const qt = quotas(p.count, doms);
      title = `Exam simulation · ${p.count} questions`;
      for (const d of doms) {
        const pool = poolFor([d], p.sources);
        const pick = groupScenarios(shuffle(weightedSample(pool, Math.min(qt[d], pool.length))));
        sections.push({ domain: d, start: qs.length, count: pick.length });
        qs.push(...pick);
      }
    } else if (mode === "drill") {
      const doms = p.domains.length ? p.domains.slice().sort() : [1, 2, 3];
      const n = p.count === "all" ? Infinity : p.count;
      title = `Domain drill · ${doms.map((d) => dom(d).short).join(" + ")}`;
      const pool = poolFor(doms, p.sources);
      const pick = n === Infinity ? shuffle(pool.slice()) : weightedSample(pool, Math.min(n, pool.length));
      for (const d of doms) {
        const part = groupScenarios(shuffle(pick.filter((q) => q.domain === d)));
        if (part.length) { sections.push({ domain: d, start: qs.length, count: part.length }); qs.push(...part); }
      }
    } else if (mode === "mistakes" || mode === "retry") {
      const ids = opts.ids || Object.entries(S.qstats).filter(([id, st]) => st.last === "wrong" && isDp(id)).map(([id]) => id);
      const list = ids.map((id) => QMAP[id]).filter(Boolean);
      title = mode === "retry" ? "Retry missed questions" : "Mistake review";
      for (const d of [1, 2, 3]) {
        const part = groupScenarios(shuffle(list.filter((q) => q.domain === d)));
        if (part.length) { sections.push({ domain: d, start: qs.length, count: part.length }); qs.push(...part); }
      }
    } else if (mode === "tsql") {
      // Notebook order, one section per notebook section; opts.ids = retry a subset
      const want = opts.ids ? new Set(opts.ids) : null;
      const list = TSQL_Q.filter((q) => (want ? want.has(q.id) : !p.tsqlOff.includes(q.section)));
      title = want ? "T-SQL exam · retry missed questions" : `T-SQL notebook exam · ${list.length} questions`;
      for (const s of TSQL.sections) {
        const part = list.filter((q) => q.section === s.id);
        if (part.length) {
          sections.push({ key: "t" + s.id, domain: part[0].domain, name: `${s.id}. ${s.name}`, short: s.id, start: qs.length, count: part.length });
          qs.push(...part);
        }
      }
    }
    if (!qs.length) { toast("🤷", "No questions match", "Change the filters and try again."); return; }
    const timed = mode === "exam" && p.timed;
    session = {
      mode, title, sections, items: buildItems(qs), idx: 0, xp: 0, combo: 0, maxCombo: 0,
      instant: mode === "tsql" ? p.tsqlInstant : mode !== "exam" || p.instant, startedAt: Date.now(),
      timeLimit: timed ? qs.length * 120 : 0, elapsedBefore: 0, resumedAt: Date.now(), paused: false, finished: false,
    };
    scenOpen = {};
    saveSession();
    renderQuiz(true);
  }

  // ------------------------------------------------------------------ home
  function domainMastery(d) {
    const qs = QUESTIONS.filter((q) => q.domain === d);
    const ok = qs.filter((q) => S.qstats[q.id]?.last === "correct").length;
    return { ok, total: qs.length, pct: Math.round((ok / qs.length) * 100) };
  }

  function renderHome() {
    stopTimer();
    pause();
    renderPlayer();
    const p = S.prefs;
    const counts = {};
    for (const q of QUESTIONS) counts[srcGroup(q)] = (counts[srcGroup(q)] || 0) + 1;
    const seen = Object.keys(S.qstats).length;
    const wrongCount = Object.entries(S.qstats).filter(([id, s]) => s.last === "wrong" && isDp(id)).length;
    const best = S.history.filter((h) => h.mode === "exam").reduce((m, h) => Math.max(m, h.score), 0);

    app.innerHTML = `
      <section class="hero">
        <h1>Level up for <span>DP-800</span></h1>
        <p>A practice exam that reports a score for each of the 3 domains, like the real one. Every question sits under its official exam domain. Answers are hidden under each question until you check or reveal them.</p>
      </section>

      ${session && !session.finished ? `
      <div class="card row" style="border-color:var(--warn)">
        <div>⏸️ <b>Unfinished session:</b> ${esc(session.title)}. Question ${session.idx + 1} of ${session.items.length}</div>
        <span class="spacer"></span>
        <button class="btn ghost" data-act="discard">Discard</button>
        <button class="btn primary" data-act="resume">Resume ▶</button>
      </div>` : ""}

      <div class="stats">
        <div class="stat"><b>${QUESTIONS.length}</b><span>questions in the bank</span></div>
        <div class="stat"><b>${seen}</b><span>seen by you</span></div>
        <div class="stat"><b>${S.answered ? Math.round((S.correct / S.answered) * 100) : 0}%</b><span>lifetime accuracy</span></div>
        <div class="stat"><b>${best || "–"}</b><span>best exam score</span></div>
        <div class="stat"><b>🔥 ${S.bestStreak}</b><span>best streak</span></div>
      </div>

      <div class="domain-pills">
        ${DOMAINS.map((d) => { const m = domainMastery(d.id); return `
          <div class="dpill d${d.id}">
            <h3>${d.id}. ${esc(d.name)}</h3>
            <div class="muted">${d.weight[0]}–${d.weight[1]}% of exam · ${m.total} questions · mastered ${m.ok}</div>
            <div class="mastery"><i style="width:${m.pct}%"></i></div>
          </div>`; }).join("")}
      </div>

      <div class="modes">
        ${[
          ["exam", "🎯", "Exam simulation", "3 sections weighted like the real exam (37.5 / 37.5 / 25%). Optional timer. Score report per domain."],
          ["drill", "🏋️", "Domain drill", "Practice one or more domains. Instant feedback, XP and combos."],
          ["mistakes", "🩹", "Mistake review", `Retry the ${wrongCount} question${wrongCount === 1 ? "" : "s"} you last got wrong.`],
          ["study", "📖", "Study bank", "Browse and search all questions, with answers hidden until you reveal them."],
          ["tsql", "🧪", "T-SQL notebook exam", `${TSQL_Q.length} questions that follow the T-SQL notebook example by example, in order. No time limit. Kept separate from the DP-800 exams.`],
        ].map(([id, ic, name, desc]) => `
          <button class="mode ${p.mode === id ? "selected" : ""}" data-mode="${id}">
            <div class="ic">${ic}</div><h3>${name}</h3><p>${desc}</p>
          </button>`).join("")}
      </div>

      <div class="card setup" id="setup"></div>

      <h2 class="section-title">🏅 Badges <span class="muted small">${Object.keys(S.badges).length} / ${BADGES.length}</span></h2>
      <div class="badges">
        ${BADGES.map((b) => `<div class="badge ${S.badges[b.id] ? "" : "locked"}" title="${esc(b.desc)}"><span class="ic">${b.ic}</span><b>${esc(b.name)}</b><span class="muted">${esc(b.desc)}</span></div>`).join("")}
      </div>

      ${S.history.length ? `
      <h2 class="section-title">📈 Recent sessions</h2>
      <div class="card" style="overflow-x:auto">
        <table class="history">
          <tr><th>Date</th><th>Mode</th><th>Qs</th><th>Score</th>${DOMAINS.map((d) => `<th>${esc(d.short)}</th>`).join("")}<th>XP</th></tr>
          ${S.history.slice(-10).reverse().map((h) => `
            <tr><td>${new Date(h.date).toLocaleString()}</td><td>${esc(h.title)}</td><td>${h.n}</td>
            <td class="grade" style="color:${h.score >= PASS ? "var(--good)" : "var(--bad)"}">${h.score}</td>
            ${DOMAINS.map((d) => `<td>${h.domains[d.id] ? h.domains[d.id].score + ` <span class="muted small">(${h.domains[d.id].c}/${h.domains[d.id].t})</span>` : "–"}</td>`).join("")}
            <td>+${h.xp}</td></tr>`).join("")}
        </table>
      </div>` : ""}

      <div class="row" style="margin-top:24px">
        <span class="muted small">Keyboard: <span class="kbd">A</span>–<span class="kbd">F</span> select · <span class="kbd">Enter</span> check / next · <span class="kbd">←</span><span class="kbd">→</span> navigate · <span class="kbd">R</span> reveal answer</span>
        <span class="spacer"></span>
        <button class="btn ghost small" data-act="export">Export progress</button>
        <button class="btn ghost small" data-act="import">Import progress</button>
        <button class="btn ghost small" data-act="reset">Reset progress</button>
      </div>`;
    renderSetup();
  }

  function chip(label, on, attrs) { return `<button class="chip ${on ? "on" : ""}" ${attrs}>${label}</button>`; }

  function renderSetup() {
    const p = S.prefs, el = $("#setup");
    if (!el) return;
    const srcChips = `<div class="field"><label>Question sources</label><div class="chips">
      ${Object.entries(SOURCES).map(([k, v]) => chip(`${esc(v.label)} <span class="muted">(${QUESTIONS.filter((q) => srcGroup(q) === k).length})</span>`, p.sources.includes(k), `data-src="${k}"`)).join("")}
      </div><div class="muted small" style="margin-top:6px">Exam-style questions (ExamTopics, official assessment) are drawn more often. Unseen questions and ones you missed are prioritized.</div></div>`;
    if (p.mode === "exam") {
      const counts = [25, 50, 100];
      if (!counts.includes(p.count)) p.count = 50;
      const qt = quotas(p.count, [1, 2, 3]);
      el.innerHTML = `
        <h3>🎯 Exam simulation</h3>
        <div class="field"><label>Number of questions</label><div class="chips">
          ${counts.map((n) => chip(n, p.count === n, `data-count="${n}"`)).join("")}
        </div><div class="muted small" style="margin-top:6px">Sections: ${DOMAINS.map((d) => `${esc(d.short)} <b>${qt[d.id]}</b>`).join(" · ")}</div></div>
        ${srcChips}
        <label class="toggle"><input type="checkbox" data-pref="timed" ${p.timed ? "checked" : ""}> Timed (2 minutes per question, ${p.count * 2} min total)</label>
        <label class="toggle"><input type="checkbox" data-pref="instant" ${p.instant ? "checked" : ""}> Instant feedback (show the correct answer after each question). Turn it off for real exam conditions.</label>
        <div class="actions"><button class="btn primary big" data-act="start">Start exam ▶</button></div>`;
    } else if (p.mode === "drill") {
      const counts = [10, 25, 50, "all"];
      if (!counts.includes(p.count)) p.count = 25;
      el.innerHTML = `
        <h3>🏋️ Domain drill</h3>
        <div class="field"><label>Domains</label><div class="chips">
          ${DOMAINS.map((d) => chip(`${d.id}. ${esc(d.short)}`, p.domains.includes(d.id), `data-dom="${d.id}"`)).join("")}
        </div></div>
        <div class="field"><label>Number of questions</label><div class="chips">
          ${counts.map((n) => chip(n === "all" ? "All" : n, p.count === n, `data-count="${n}"`)).join("")}
        </div></div>
        ${srcChips}
        <div class="actions"><button class="btn primary big" data-act="start">Start drill ▶</button></div>`;
    } else if (p.mode === "mistakes") {
      const wrong = Object.entries(S.qstats).filter(([id, s]) => s.last === "wrong" && isDp(id)).map(([id]) => QMAP[id]).filter(Boolean);
      el.innerHTML = `
        <h3>🩹 Mistake review</h3>
        <p class="muted">${wrong.length ? `${wrong.length} questions to fix: ${DOMAINS.map((d) => `${esc(d.short)} <b>${wrong.filter((q) => q.domain === d.id).length}</b>`).join(" · ")}. Answer one correctly and it leaves this list.` : "No mistakes recorded yet. Take an exam or a drill first."}</p>
        <div class="actions"><button class="btn primary big" data-act="start" ${wrong.length ? "" : "disabled"}>Start review ▶</button></div>`;
    } else if (p.mode === "tsql") {
      const per = Object.fromEntries(TSQL.sections.map((s) => [s.id, TSQL_Q.filter((q) => q.section === s.id).length]));
      const n = TSQL_Q.filter((q) => !p.tsqlOff.includes(q.section)).length;
      el.innerHTML = `
        <h3>🧪 T-SQL notebook exam</h3>
        <p class="muted">Exam-style questions on every example in the T-SQL notebook (notebooks/tsql-variables-and-data-types.ipynb), in the notebook's order, with explanations. There's no time limit, and your place is saved if you leave. These questions aren't mixed into the DP-800 exams, drills, study bank or mistake review.</p>
        <div class="field"><label>Notebook sections <span class="muted small">(${n} questions selected)</span></label><div class="chips">
          ${chip("All", !p.tsqlOff.length, 'data-tsall="1"')}
          ${TSQL.sections.map((s) => chip(`${esc(s.id)}. ${esc(s.name)} <span class="muted">(${per[s.id]})</span>`, !p.tsqlOff.includes(s.id), `data-tsec="${esc(s.id)}"`)).join("")}
        </div></div>
        <label class="toggle"><input type="checkbox" data-pref="tsqlInstant" ${p.tsqlInstant ? "checked" : ""}> Instant feedback (show the answer and explanation after each question)</label>
        <div class="actions"><button class="btn primary big" data-act="start" ${n ? "" : "disabled"}>Start T-SQL exam ▶</button></div>`;
    } else if (p.mode === "study") {
      el.innerHTML = `<h3>📖 Study bank</h3><p class="muted">Browse all ${QUESTIONS.length} questions by domain. Answers stay hidden until you click them.</p>
        <div class="actions"><button class="btn primary big" data-act="study">Open study bank ▶</button></div>`;
    }
  }

  // ------------------------------------------------------------------ quiz rendering
  const cur = () => session.items[session.idx];
  const curQ = () => QMAP[cur().id];
  const sectionOf = (i) => session.sections.find((s) => i >= s.start && i < s.start + s.count);
  const secName = (s) => s.name || dom(s.domain).name;      // T-SQL sections carry their own name
  const secShort = (s) => s.short || dom(s.domain).short;
  const secKey = (s) => s.key || s.domain;

  function elapsed() { return session.elapsedBefore + (session.paused ? 0 : (Date.now() - session.resumedAt) / 1000); }
  function pause() { if (session && !session.finished && !session.paused) { session.elapsedBefore = elapsed(); session.paused = true; saveSession(); } }
  function resume() { if (session) { session.paused = false; session.resumedAt = Date.now(); } }
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }
  function startTimer() {
    stopTimer();
    timerHandle = setInterval(() => {
      const el = $("#timer");
      if (!session || !el) return stopTimer();
      if (session.timeLimit) {
        const left = session.timeLimit - elapsed();
        el.textContent = "⏳ " + fmtTime(left);
        el.classList.toggle("low", left < 300);
        if (left <= 0) { stopTimer(); toast("⏰", "Time's up!", "Your exam has been submitted."); finish(true); }
      } else el.textContent = "⏱️ " + fmtTime(elapsed());
    }, 1000);
  }

  function optionHTML(q, it, key, i) {
    const o = q.options.find((x) => x.key === key);
    const shown = LETTERS[i];
    let cls = "opt";
    if (it.picked.includes(key)) cls += " sel";
    const showResult = it.checked && session.instant;
    if (showResult || it.revealed) {
      if (q.answer.includes(key)) cls += " correct";
      else if (it.picked.includes(key) && showResult) cls += " wrong";
      else cls += " dim";
    }
    return `<button class="${cls}" data-opt="${key}" ${it.checked ? "disabled" : ""}>
      <span class="key">${shown}</span><span class="md">${md(o.text)}</span></button>`;
  }

  // ------------------------------------------------------------------ drag and drop
  let ddSel = null; // tile picked with a click/tap, waiting to be placed
  const ddFilled = (it) => it.picked.every((v) => v !== null && v !== undefined);
  const slotQ = (q) => q.dd || q.hs;                                   // drag-drop and hotspot share slot grading
  const isSlotQ = (q) => q.type === "dragdrop" || q.type === "hotspot";
  const slotScore = (q, it) => it.picked.filter((v, k) => v === slotQ(q).answer[k]).length;

  // ------------------------------------------------------------------ hotspot (dropdowns / Yes-No)
  function hsHTML(q, it, mode) {
    const hs = q.hs;
    const interactive = mode === "quiz" && !it.checked;
    const showResult = mode === "review" || (mode === "quiz" && it.checked && session.instant);
    const showCorrect = mode === "study-open";
    const val = (k) => (showCorrect ? hs.answer[k] : it.picked[k]);
    const state = (k) => (showResult ? (it.picked[k] === hs.answer[k] ? "correct" : "wrong") : showCorrect ? "reveal" : "");
    const fix = (k) => (showResult && it.picked[k] !== hs.answer[k] ? `<span class="fix">✔ ${esc(hs.answer[k])}</span>` : "");

    if (hs.statements) {
      const cell = (k, o) => {
        let c = "yn";
        if (val(k) === o) c += " on";
        if (showResult && it.picked[k] === o) c += o === hs.answer[k] ? " correct" : " wrong";
        if ((showResult || showCorrect) && hs.answer[k] === o && it.picked[k] !== o) c += " should";
        return `<td class="yn-cell"><button class="${c}" data-yn="${k}" data-v="${o}" ${interactive ? "" : "disabled"} aria-label="${o} for statement ${k + 1}" aria-pressed="${val(k) === o}"></button></td>`;
      };
      return `<div class="hs"><div class="dd-title">Answer Area</div>
        <table class="yn-table"><thead><tr><th>Statements</th><th>Yes</th><th>No</th></tr></thead><tbody>
        ${hs.statements.map((st, k) => `<tr class="${state(k)}"><td class="yn-st">${marked.parseInline(st)}${fix(k)}</td>${cell(k, "Yes")}${cell(k, "No")}</tr>`).join("")}
        </tbody></table></div>`;
    }

    const select = (k) => {
      const v = val(k);
      if (mode === "study") return `<select class="hs-select" aria-label="Options for selection ${k + 1}"><option>Select…</option>${hs.options[k].map((o) => `<option>${esc(o)}</option>`).join("")}</select>`;
      if (!interactive) return `<span class="hs-pick ${state(k)}">${v ? esc(v) : '<span class="ph">not answered</span>'}${fix(k)}</span>`;
      return `<select class="hs-select ${v ? "filled" : ""}" data-hs="${k}" aria-label="Selection ${k + 1}">
        <option value="">Select…</option>${hs.options[k].map((o, i) => `<option value="${i}" ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    };
    let area;
    if (hs.template) {
      const parts = hs.template.split(/\[\[(\d+)\]\]/);
      area = `<pre class="dd-code hs-code"><code>${parts.map((p, i) => (i % 2 ? select(+p) : esc(p))).join("")}</code></pre>`;
    } else {
      area = `<div class="dd-targets">${hs.targets.map((t, k) => `<div class="dd-row"><div class="dd-label">${marked.parseInline(t)}:</div><div class="dd-cell">${select(k)}</div></div>`).join("")}</div>`;
    }
    return `<div class="hs"><div class="dd-title">Answer Area</div>${area}</div>`;
  }

  // mode: "quiz" (interactive until checked), "review" (show result), "study" (empty), "study-open" (answers shown)
  function ddHTML(q, it, mode) {
    const dd = q.dd;
    const interactive = mode === "quiz" && !it.checked;
    const showResult = mode === "review" || (mode === "quiz" && it.checked && session.instant);
    const showCorrect = mode === "study-open";
    const slot = (k) => {
      const val = showCorrect ? dd.answer[k] : it.picked[k];
      let cls = "slot" + (val ? " filled" : "");
      let extra = "";
      if (showResult) {
        const ok = it.picked[k] === dd.answer[k];
        cls += ok ? " correct" : " wrong";
        if (!ok) extra = `<span class="fix">✔ ${esc(dd.answer[k])}</span>`;
      } else if (showCorrect) cls += " reveal";
      const label = `Target ${k + 1}: ${val || "empty"}`;
      const body = val ? (showResult && extra ? `<s>${esc(val)}</s>` : esc(val)) : '<span class="ph">drop here</span>';
      return `<span class="${cls}" data-slot="${k}" role="button" tabindex="${interactive ? 0 : -1}" aria-label="${esc(label)}" ${interactive && val ? 'draggable="true"' : ""}>${body}${extra}</span>`;
    };
    let area;
    if (dd.template) {
      const parts = dd.template.split(/\[\[(\d+)\]\]/);
      area = `<pre class="dd-code"><code>${parts.map((p, i) => (i % 2 ? slot(+p) : esc(p))).join("")}</code></pre>`;
    } else {
      area = `<div class="dd-targets">${dd.targets.map((t, k) => `<div class="dd-row"><div class="dd-label">${marked.parseInline(t)}</div><div class="dd-cell">${slot(k)}</div></div>`).join("")}</div>`;
    }
    const tiles = dd.values.map((v, i) =>
      `<button class="tile ${interactive && ddSel === v ? "sel" : ""}" data-tile="${i}" ${interactive ? 'draggable="true"' : "disabled"}>⠿ ${esc(v)}</button>`).join("");
    return `<div class="dd ${interactive ? "live" : ""}">
      <div class="dd-values" data-ddpool="1"><div class="dd-title">Values</div>${tiles}
        ${interactive ? `<div class="muted small dd-help">Drag a value onto a target, or tap a value and then tap a target. Values can be reused. Tap a filled target to clear it.</div>` : ""}</div>
      <div class="dd-answer"><div class="dd-title">Answer Area</div>${area}</div>
    </div>`;
  }

  function ddPlace(k, v, from) {
    const it = cur();
    if (it.checked) return;
    it.picked[k] = v;
    if (from !== undefined && from !== null && from !== k) it.picked[from] = null;
    ddSel = null;
    saveSession();
    renderQuiz();
  }

  function answerLine(q, it) {
    if (q.type === "self" || isSlotQ(q)) return "";
    const labels = q.answer.map((k) => LETTERS[it.order.indexOf(k)]).sort();
    return `<div class="answer-line">✅ Correct answer: ${labels.join(", ")}</div>`;
  }

  let scenOpen = {};
  function renderQuiz(scrollTop = false) {
    if (!session) return renderHome();
    const prevDetails = $("details.scenario", app);
    if (prevDetails && !scrollTop && prevDetails.dataset.idx) scenOpen[prevDetails.dataset.idx] = prevDetails.open;
    const it = cur(), q = curQ(), sec = sectionOf(session.idx), d = dom(q.domain);
    const n = session.items.length;
    const done = session.items.filter((x) => x.status !== "pending").length;
    const secIdx = session.sections.indexOf(sec);
    const firstOfScenario = q.scenario && (session.idx === 0 || QMAP[session.items[session.idx - 1].id].scenario !== q.scenario);
    const showAnswer = it.revealed || (it.checked && session.instant);
    const multiN = q.type === "multi" ? q.answer.length : 0;

    app.innerHTML = `
      <div class="quiz-head d${q.domain}">
        <span class="sec-tag">Section ${secIdx + 1} of ${session.sections.length} · ${esc(sec.name || d.name)}</span>
        <span class="spacer"></span>
        <div class="hud">
          <span class="pill">⭐ +${session.xp}</span>
          <span class="pill combo" title="Combo multiplier">${session.combo >= 3 ? `🔥 x${comboMult(session.combo)} · ${session.combo}` : `🔥 ${session.combo}`}</span>
          <span class="pill timer" id="timer">${session.timeLimit ? "⏳ " + fmtTime(session.timeLimit - elapsed()) : "⏱️ " + fmtTime(elapsed())}</span>
        </div>
      </div>
      <div class="sections-bar ${session.sections.length > 4 ? "many" : ""}">
        ${session.sections.map((s, i) => `<div class="sb d${s.domain} ${i === secIdx ? "cur" : ""} ${i < secIdx ? "done" : ""}" style="--n:${s.count}" title="${esc(secName(s))}">${s.key ? "" : i + 1 + ". "}${esc(secShort(s))} (${s.count})</div>`).join("")}
      </div>
      <div class="progress">${session.sections.map((s) => {
        const answered = session.items.slice(s.start, s.start + s.count).filter((x) => x.status !== "pending").length;
        return `<i style="width:${(answered / n) * 100}%;background:var(--d${s.domain})"></i>`; }).join("")}</div>

      <div class="card qcard" id="qcard">
        <div class="qmeta">
          <span class="qnum">Question ${session.idx + 1} / ${n}</span>
          <span class="tag">${esc(q.sourceLabel)}</span>
          ${q.confidence ? `<span class="tag conf-${q.confidence}">${esc(CONF_LABEL[q.confidence] || q.confidence)}</span>` : ""}
          ${q.format ? `<span class="tag fmt">${esc(q.format)}</span>` : ""}
          ${q.type === "self" ? `<span class="tag fmt">Self-graded</span>` : ""}
        </div>
        ${q.scenario ? `<details class="scenario" data-idx="${session.idx}" ${(scenOpen[session.idx] ?? firstOfScenario) ? "open" : ""}><summary>📋 Case study / scenario</summary><div class="md">${md(q.scenario)}</div></details>` : ""}
        ${q.title ? `<div class="muted small" style="margin-bottom:4px"><b>${esc(q.title.replace(/`/g, ""))}</b></div>` : ""}
        <div class="stem md">${md(q.stem)}</div>
        ${multiN ? `<div class="hint">Select ${multiN} answers.</div>` : ""}
        ${q.type === "single" || q.type === "multi" ? `<div class="options">${it.order.map((k, i) => optionHTML(q, it, k, i)).join("")}</div>` : ""}
        ${q.type === "dragdrop" ? ddHTML(q, it, "quiz") : ""}
        ${q.type === "hotspot" ? hsHTML(q, it, "quiz") : ""}

        ${feedbackHTML(q, it)}

        ${q.type === "self" || session.instant || it.revealed ? `
        <div class="answer-box">
          ${showAnswer ? `<div class="inner">${answerLine(q, it)}<div class="md">${md(q.type === "self" ? q.answerMd : q.explanation) || '<span class="muted">No explanation available.</span>'}</div>
            ${q.type === "self" && it.status === "pending" ? `<div class="selfgrade"><span class="muted">How did you do?</span>
              <button class="btn good" data-act="self-ok">✅ I got it right</button>
              <button class="btn bad" data-act="self-no">❌ I got it wrong</button></div>` : ""}
            </div>`
          : `<button class="reveal" data-act="reveal">🔒 ${q.type === "self" ? "Reveal the answer, then grade yourself" : "Hidden answer: click to reveal (no XP for this question)"}</button>`}
        </div>` : ""}

        <div class="actions">
          <button class="btn" data-act="prev" ${session.idx === 0 ? "disabled" : ""}>← Prev</button>
          ${q.type !== "self" && !it.checked ? `<button class="btn primary" data-act="check" ${(isSlotQ(q) ? ddFilled(it) : it.picked.length) ? "" : "disabled"}>${session.instant ? "Check answer" : "Save answer"}</button>` : ""}
          ${q.type === "dragdrop" && !it.checked && it.picked.some((v) => v) ? `<button class="btn ghost" data-act="dd-clear">↺ Clear</button>` : ""}
          <span class="spacer"></span>
          ${session.idx < n - 1 ? `<button class="btn ${it.status !== "pending" ? "primary" : ""}" data-act="next">${it.status === "pending" ? "Skip →" : "Next →"}</button>` : ""}
          <button class="btn ${session.idx === n - 1 ? "primary" : "ghost"}" data-act="finish">🏁 Finish</button>
        </div>
      </div>

      <div class="nav-grid">
        ${session.sections.map((s, si) => `<div class="sep">Section ${si + 1}: ${esc(secName(s))}</div>` +
          session.items.slice(s.start, s.start + s.count).map((x, j) => {
            const i = s.start + j;
            const cls = x.status === "pending" ? "" : (session.instant || x.revealed) ? (x.status === "correct" ? "ok" : "no") : "ans";
            return `<button class="${i === session.idx ? "cur" : ""} ${cls}" data-goto="${i}">${i + 1}</button>`;
          }).join("")).join("")}
      </div>`;
    startTimer();
    if (scrollTop) window.scrollTo(0, 0);
  }

  function feedbackHTML(q, it) {
    if (!it.checked || !session.instant || q.type === "self") {
      if (it.checked && !session.instant) return `<div class="feedback"><h4>💾 Answer saved</h4><span class="muted">You'll see the result in the score report.</span></div>`;
      return "";
    }
    const ok = it.status === "correct";
    const part = isSlotQ(q) ? ` <span class="muted small">${slotScore(q, it)} of ${slotQ(q).answer.length} ${q.type === "hotspot" ? "selections" : "targets"} correct</span>` : "";
    return `<div class="feedback ${ok ? "ok" : "no"}"><h4>${ok ? "🎉 Correct!" : "❌ Not quite."}${part} ${it.peeked ? '<span class="muted small">(answer was revealed, so no XP)</span>' : ""}</h4></div>`;
  }

  function comboMult(c) { return c >= 10 ? 3 : c >= 6 ? 2 : c >= 3 ? 1.5 : 1; }

  function baseXP(q) {
    let x = ["examtopics", "assessment"].includes(q.source) ? 15 : 10;
    if (q.type === "multi" || isSlotQ(q)) x += 5;
    return x;
  }

  function record(q, it, correct, el) {
    it.status = correct ? "correct" : "wrong";
    it.checked = true;
    const st = (S.qstats[q.id] ||= { seen: 0, correct: 0, wrong: 0 });
    const wasWrong = st.last === "wrong";
    st.seen++; st.last = correct ? "correct" : "wrong"; st.t = Date.now();
    correct ? st.correct++ : st.wrong++;
    S.answered++;
    if (correct) S.correct++;
    if (correct && wasWrong) { S.redeemed++; if (S.redeemed >= 10) award("redemption"); }
    if (correct && !it.peeked) {
      session.combo++;
      session.maxCombo = Math.max(session.maxCombo, session.combo);
      S.bestStreak = Math.max(S.bestStreak, session.combo);
      if (session.instant) gainXP(Math.round(baseXP(q) * comboMult(session.combo)), el);
      else it.pendingXP = Math.round(baseXP(q) * comboMult(session.combo));
      award("first");
      if (session.combo >= 5) award("streak5");
      if (session.combo >= 10) award("streak10");
      if (session.combo >= 25) award("streak25");
    } else {
      if (!correct && session.combo >= 3 && session.instant) toast("💔", `Combo broken at ${session.combo}`, "Shake it off!");
      session.combo = 0;
    }
    if (S.answered >= 100) award("c100");
    if (S.answered >= 500) award("c500");
    if (Object.keys(S.qstats).filter(isDp).length >= QUESTIONS.length) award("all");
    const h = new Date().getHours();
    if (h >= 0 && h < 4) award("owl");
    save();
    saveSession();
  }

  function check() {
    const it = cur(), q = curQ();
    if (it.checked || !it.picked.length) return;
    if (isSlotQ(q)) {
      if (!ddFilled(it)) { toast("☝️", q.type === "hotspot" ? "Answer every selection" : "Fill every target", `${it.picked.filter((v) => !v).length} still empty.`); return; }
      const ok = slotQ(q).answer.every((a, k) => it.picked[k] === a);
      record(q, it, ok, $('[data-act="check"]'));
      renderQuiz();
      if (!ok && session.instant) $("#qcard")?.classList.add("shake");
      if (session.instant) $(".feedback")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    if (q.type === "multi" && it.picked.length !== q.answer.length) {
      toast("☝️", `Select ${q.answer.length} answers`, `You selected ${it.picked.length}.`);
      return;
    }
    const correct = it.picked.length === q.answer.length && q.answer.every((a) => it.picked.includes(a));
    const btn = $('[data-act="check"]');
    record(q, it, correct, btn);
    renderQuiz();
    if (!correct && session.instant) $("#qcard")?.classList.add("shake");
    if (session.instant) $(".feedback")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function go(i) {
    if (i < 0 || i >= session.items.length) return;
    session.idx = i;
    ddSel = null;
    saveSession();
    renderQuiz(true);
  }

  // ------------------------------------------------------------------ finish & results
  function finish(force) {
    const pending = session.items.filter((x) => x.status === "pending").length;
    if (!force && pending && !confirm(`${pending} question(s) are unanswered and will be marked incorrect. Finish now?`)) return;
    stopTimer();
    session.finishing = true;
    (session.pendingBadges || []).forEach(award);
    session.pendingBadges = [];
    for (const it of session.items) {
      if (it.status === "pending") { it.status = "wrong"; it.skipped = true; }
      if (it.pendingXP) { gainXP(it.pendingXP); it.pendingXP = 0; }
    }
    const per = {};
    for (const s of session.sections) {
      const items = session.items.slice(s.start, s.start + s.count);
      const c = items.filter((x) => x.status === "correct").length;
      per[secKey(s)] = { c, t: items.length, score: Math.round((1000 * c) / items.length) };
    }
    const total = session.items.length;
    const corr = session.items.filter((x) => x.status === "correct").length;
    const score = Math.round((1000 * corr) / total);
    const pass = score >= PASS;
    const secs = Math.round(elapsed());

    // bonuses
    let bonus = 0;
    if (session.mode === "exam") {
      award("exam");
      if (pass) { award("pass"); bonus += 100; }
      if (score >= 900) award("ace");
      if (!session.items.some((x) => x.peeked || x.skipped) && total >= 20) award("nopeek");
      if (pass && total >= 50 && secs < total * 60) award("speed");
    }
    if (session.mode !== "tsql") {
      for (const [d, r] of Object.entries(per)) {
        if (r.t >= 10 && r.score >= 900) { award("d" + d); bonus += 50; }
      }
    }
    if (corr === total && total >= 10) bonus += 200;
    if (bonus) gainXP(bonus);

    session.finished = true;
    session.result = { per, score, pass, corr, total, secs, bonus };
    S.history.push({ date: Date.now(), mode: session.mode, title: session.title, n: total, score, pass,
                     domains: session.mode === "tsql" ? {} : per, xp: session.xp });
    if (S.history.length > 50) S.history = S.history.slice(-50);
    save();
    saveSession();
    renderResults();
    if (pass) confetti(3000);
  }

  function ring(score) {
    const r = 90, c = 2 * Math.PI * r, pct = score / 1000;
    const col = score >= PASS ? "var(--good)" : score >= 550 ? "var(--warn)" : "var(--bad)";
    return `<div class="score-ring"><svg width="210" height="210"><circle cx="105" cy="105" r="${r}" fill="none" stroke="var(--card2)" stroke-width="16"/>
      <circle cx="105" cy="105" r="${r}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}"/></svg>
      <div class="val"><div><b>${score}</b><span>out of 1000 · pass ${PASS}</span></div></div></div>`;
  }

  function perfLabel(s) { return s >= 900 ? "🌟 Excellent" : s >= PASS ? "✅ Passing" : s >= 550 ? "⚠️ Needs work" : "🚨 Weak area"; }

  function renderResults(filter = "all") {
    const R = session.result;
    app.innerHTML = `
      <div class="card result-hero">
        <div class="muted">${esc(session.title)}</div>
        ${ring(R.score)}
        <div class="verdict ${R.pass ? "pass" : "fail"}">${R.pass ? "🏆 PASS" : "Not yet, keep grinding!"}</div>
        <div class="muted">${R.corr} / ${R.total} correct · ${fmtTime(R.secs)} · ⭐ +${session.xp} XP${R.bonus ? ` (incl. ${R.bonus} bonus)` : ""} · best combo 🔥 ${session.maxCombo}</div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">${session.mode === "tsql" ? "Score by notebook section" : "Score by exam domain"}</h3>
        ${(session.mode === "tsql"
          ? session.sections.map((s) => ({ cls: s.domain, label: `<b>${esc(secName(s))}</b>`, r: R.per[secKey(s)] }))
          : DOMAINS.filter((d) => R.per[d.id]).map((d) => ({ cls: d.id, r: R.per[d.id],
              label: `<b>${d.id}. ${esc(d.name)}</b> <span class="muted small">(${d.weight[0]}–${d.weight[1]}% of exam)</span>` }))
        ).map(({ cls, label, r }) => `
          <div class="dom-result d${cls}">
            <div class="top"><span>${label}</span>
              <span><span class="grade">${r.score}</span> <span class="muted small">/ 1000 · ${r.c}/${r.t} · ${perfLabel(r.score)}</span></span></div>
            <div class="bar"><i style="width:${r.score / 10}%"></i><span class="pass-mark" title="700 = passing"></span></div>
          </div>`).join("")}
        <div class="muted small">${session.mode === "tsql" ? "The white mark is 700, the DP-800 pass mark." : "Microsoft's score report shows your performance by skill area the same way. The white mark is 700."}</div>
      </div>

      <div class="card">
        <div class="row">
          <h3 style="margin:0">Review</h3><span class="spacer"></span>
          ${chip("All", filter === "all", 'data-filter="all"')}
          ${chip("Wrong only", filter === "wrong", 'data-filter="wrong"')}
          ${chip("Correct only", filter === "correct", 'data-filter="correct"')}
        </div>
        ${session.sections.map((s) => {
          const items = session.items.slice(s.start, s.start + s.count).map((it, j) => [it, s.start + j])
            .filter(([it]) => filter === "all" || (filter === "wrong" ? it.status !== "correct" : it.status === "correct"));
          if (!items.length) return "";
          return `<h4 class="d${s.domain}" style="color:var(--dc);margin:18px 0 6px">${esc(secName(s))}</h4>` + items.map(([it, i]) => reviewItem(it, i)).join("");
        }).join("")}
      </div>

      <div class="actions">
        <button class="btn" data-act="home">🏠 Home</button>
        <span class="spacer"></span>
        ${session.items.some((x) => x.status !== "correct") ? `<button class="btn" data-act="retry">🔁 Retry missed questions</button>` : ""}
        <button class="btn primary" data-act="again">🎯 New ${session.mode === "exam" || session.mode === "tsql" ? "exam" : "session"}</button>
      </div>`;
    window.scrollTo(0, 0);
  }

  function reviewItem(it, i) {
    const q = QMAP[it.id];
    const lbl = (keys) => keys.map((k) => LETTERS[it.order.indexOf(k)]).sort().join(", ");
    const your = q.type === "self" ? (it.skipped ? "Skipped" : it.status === "correct" ? "Self-graded: right" : "Self-graded: wrong")
      : it.skipped ? "Skipped"
      : isSlotQ(q) ? `${slotScore(q, it)}/${slotQ(q).answer.length} ${q.type === "hotspot" ? "selections" : "targets"}` : lbl(it.picked);
    return `<details class="review-item ${it.status === "correct" ? "ok" : "no"}">
      <summary><b>Q${i + 1}.</b> ${it.status === "correct" ? "✅" : "❌"} ${esc(q.stem.replace(/[#*`>|!\[\]()]/g, "").slice(0, 120))}…
        <span class="muted small">· you: ${esc(your)}${q.type === "single" || q.type === "multi" ? ` · correct: ${lbl(q.answer)}` : ""}</span></summary>
      <div style="margin-top:10px">
        ${q.scenario ? `<details class="scenario"><summary>📋 Case study / scenario</summary><div class="md">${md(q.scenario)}</div></details>` : ""}
        <div class="md">${md(q.stem)}</div>
        ${q.type === "dragdrop" ? ddHTML(q, it, "review") : ""}
        ${q.type === "hotspot" ? hsHTML(q, it, "review") : ""}
        ${q.type === "single" || q.type === "multi" ? `<div class="options">${it.order.map((k, j) => {
          const o = q.options.find((x) => x.key === k);
          const cls = q.answer.includes(k) ? "correct" : it.picked.includes(k) ? "wrong" : "dim";
          return `<div class="opt ${cls}"><span class="key">${LETTERS[j]}</span><span class="md">${md(o.text)}</span></div>`; }).join("")}</div>` : ""}
        <div class="feedback"><div class="md">${md(q.type === "self" ? q.answerMd : q.explanation) || '<span class="muted">No explanation available.</span>'}</div>
        <div class="muted small" style="margin-top:8px">${esc(q.sourceLabel)} · ${esc(CONF_LABEL[q.confidence] || "")}</div></div>
      </div></details>`;
  }

  // ------------------------------------------------------------------ study bank
  let study = { q: "", domains: [1, 2, 3], sources: Object.keys(SOURCES), shown: 25, open: {} };
  function renderStudy() {
    stopTimer();
    const terms = study.q.replace(/\\/g, "").toLowerCase().split(/\s+/).filter(Boolean);
    const list = QUESTIONS.filter((q) => study.domains.includes(q.domain) && study.sources.includes(srcGroup(q)) &&
      (!terms.length || terms.every((t) => (q.stem + " " + q.scenario + " " + q.options.map((o) => o.text).join(" ") + " " + (q.title || "")).replace(/\\/g, "").toLowerCase().includes(t))));
    const sorted = [1, 2, 3].flatMap((d) => list.filter((q) => q.domain === d));
    let lastDom = 0;
    app.innerHTML = `
      <div class="card">
        <div class="row"><h2 style="margin:0">📖 Study bank</h2><span class="spacer"></span><button class="btn ghost" data-act="home">← Home</button></div>
        <div class="field"><input class="search" id="search" placeholder="Search questions, e.g. VECTOR_SEARCH, RLS, dab init" value="${esc(study.q)}"></div>
        <div class="chips">${DOMAINS.map((d) => chip(`${d.id}. ${esc(d.short)}`, study.domains.includes(d.id), `data-sdom="${d.id}"`)).join("")}</div>
        <div class="chips" style="margin-top:8px">${Object.entries(SOURCES).map(([k, v]) => chip(esc(v.label), study.sources.includes(k), `data-ssrc="${k}"`)).join("")}</div>
        <div class="muted small" style="margin-top:8px">${sorted.length} matching questions</div>
      </div>
      ${sorted.slice(0, study.shown).map((q) => {
        const head = q.domain !== lastDom ? `<h3 class="section-title d${q.domain}" style="color:var(--dc)">${q.domain}. ${esc(dom(q.domain).name)}</h3>` : "";
        lastDom = q.domain;
        const open = study.open[q.id];
        return head + `<div class="card bank-item">
          <div class="qmeta"><span class="tag">${esc(q.sourceLabel)}</span>${q.confidence ? `<span class="tag conf-${q.confidence}">${esc(CONF_LABEL[q.confidence] || "")}</span>` : ""}${q.format ? `<span class="tag fmt">${esc(q.format)}</span>` : ""}</div>
          ${q.scenario ? `<details class="scenario"><summary>📋 Case study / scenario</summary><div class="md">${md(q.scenario)}</div></details>` : ""}
          <div class="md">${md(q.stem)}</div>
          ${q.type === "dragdrop" ? ddHTML(q, { picked: q.dd.answer.map(() => null) }, open ? "study-open" : "study") : ""}
          ${q.type === "hotspot" ? hsHTML(q, { picked: q.hs.answer.map(() => null) }, open ? "study-open" : "study") : ""}
          ${q.options.length ? `<div class="options">${q.options.map((o) => `<div class="opt ${open ? (q.answer.includes(o.key) ? "correct" : "dim") : ""}"><span class="key">${o.key}</span><span class="md">${md(o.text)}</span></div>`).join("")}</div>` : ""}
          <div class="answer-box">${open
            ? `<div class="inner">${q.type === "single" || q.type === "multi" ? `<div class="answer-line">✅ Correct answer: ${q.answer.join(", ")}</div>` : ""}<div class="md">${md(q.type === "self" ? q.answerMd : q.explanation)}</div></div>`
            : `<button class="reveal" data-sreveal="${q.id}">🔒 Hidden answer: click to reveal</button>`}</div>
        </div>`;
      }).join("")}
      ${sorted.length > study.shown ? `<div class="actions"><button class="btn primary" data-act="more" style="margin:auto">Load more (${sorted.length - study.shown} left)</button></div>` : ""}`;
  }

  // ------------------------------------------------------------------ events
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, img, [data-nav], [data-slot]");
    if (!t) return;
    if (t.tagName === "IMG" && t.closest("button.opt")) return t.closest("button.opt").click();
    if (t.tagName === "IMG" && t.closest(".md")) {
      const lb = document.createElement("div");
      lb.className = "lightbox";
      lb.innerHTML = `<img src="${t.getAttribute("src")}" alt="">`;
      lb.onclick = () => lb.remove();
      document.body.appendChild(lb);
      return;
    }
    const ds = t.dataset;
    if (ds.nav === "home") { if (session && session.finished) { session = null; saveSession(); } return renderHome(); }
    if (ds.mode) { S.prefs.mode = ds.mode; save(); document.querySelectorAll(".mode").forEach((m) => m.classList.toggle("selected", m.dataset.mode === ds.mode)); return renderSetup(); }
    if (ds.count) { S.prefs.count = ds.count === "all" ? "all" : +ds.count; save(); return renderSetup(); }
    if (ds.src) { toggleIn(S.prefs.sources, ds.src); save(); return renderSetup(); }
    if (ds.dom) { toggleIn(S.prefs.domains, +ds.dom); save(); return renderSetup(); }
    if (ds.tsec) { toggleIn(S.prefs.tsqlOff, ds.tsec); save(); return renderSetup(); }
    if (ds.tsall) { S.prefs.tsqlOff = S.prefs.tsqlOff.length ? [] : TSQL.sections.map((s) => s.id); save(); return renderSetup(); }
    if (ds.sdom) { toggleIn(study.domains, +ds.sdom); study.shown = 25; return renderStudy(); }
    if (ds.ssrc) { toggleIn(study.sources, ds.ssrc); study.shown = 25; return renderStudy(); }
    if (ds.sreveal) { study.open[ds.sreveal] = true; return renderStudy(); }
    if (ds.filter) return renderResults(ds.filter);
    if (ds.goto) return go(+ds.goto);
    if (ds.yn !== undefined && session && !session.finished && $("#qcard")?.contains(t)) {
      const it = cur();
      if (it.checked) return;
      it.picked[+ds.yn] = ds.v;
      saveSession();
      return renderQuiz();
    }
    if ((ds.tile || ds.slot) && session && !session.finished && $("#qcard")?.contains(t)) {
      const it = cur(), q = curQ();
      if (q.type !== "dragdrop" || it.checked) return;
      if (ds.tile) { const v = q.dd.values[+ds.tile]; ddSel = ddSel === v ? null : v; return renderQuiz(); }
      const k = +ds.slot;
      if (ddSel !== null) return ddPlace(k, ddSel);
      if (it.picked[k]) { it.picked[k] = null; saveSession(); return renderQuiz(); }
      return;
    }
    if (ds.opt && session && !cur().checked) {
      const it = cur(), q = curQ();
      if (q.type === "multi") toggleIn(it.picked, ds.opt);
      else it.picked = [ds.opt];
      saveSession();
      return renderQuiz();
    }
    switch (ds.act) {
      case "start":
        if (S.prefs.mode === "mistakes") return startSession("mistakes");
        if (S.prefs.mode === "tsql") return startSession("tsql");
        if (!S.prefs.sources.length) return toast("☝️", "Pick at least one source", "");
        if (S.prefs.mode === "drill" && !S.prefs.domains.length) return toast("☝️", "Pick at least one domain", "");
        return startSession(S.prefs.mode);
      case "study": return renderStudy();
      case "more": study.shown += 25; return renderStudy();
      case "resume": resume(); return renderQuiz(true);
      case "discard": session = null; saveSession(); return renderHome();
      case "check": return check();
      case "dd-clear": { const it = cur(); it.picked = it.picked.map(() => null); ddSel = null; saveSession(); return renderQuiz(); }
      case "prev": return go(session.idx - 1);
      case "next": return go(session.idx + 1);
      case "finish": return finish(false);
      case "reveal": {
        const it = cur(), q = curQ();
        if (q.type !== "self" && !it.checked) it.peeked = true;
        it.revealed = true;
        saveSession();
        return renderQuiz();
      }
      case "self-ok": case "self-no": {
        const it = cur();
        record(curQ(), it, ds.act === "self-ok", t);
        renderQuiz();
        return;
      }
      case "home": session = null; saveSession(); return renderHome();
      case "again": { const m = session.mode === "retry" ? "mistakes" : session.mode; session = null; return startSession(m); }
      case "retry": { const ids = session.items.filter((x) => x.status !== "correct").map((x) => x.id); return startSession(session.mode === "tsql" ? "tsql" : "retry", { ids }); }
      case "export": {
        const blob = new Blob([JSON.stringify(S)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "dp800-quest-progress.json"; a.click();
        return;
      }
      case "import": {
        const inp = document.createElement("input");
        inp.type = "file"; inp.accept = "application/json";
        inp.onchange = async () => {
          try { S = Object.assign(defaultState(), JSON.parse(await inp.files[0].text())); save(); renderHome(); toast("📥", "Progress imported", ""); }
          catch { toast("⚠️", "Import failed", "That file isn't valid progress data."); }
        };
        inp.click();
        return;
      }
      case "reset":
        if (confirm("Reset all XP, badges, history and question stats?")) { S = defaultState(); session = null; save(); saveSession(); renderHome(); }
        return;
    }
  });

  let dragData = null;
  document.addEventListener("dragstart", (e) => {
    const el = e.target.closest?.("[data-tile], [data-slot]");
    if (!el || !session || !$("#qcard")?.contains(el)) return;
    const q = curQ(), it = cur();
    if (q.type !== "dragdrop" || it.checked) return e.preventDefault();
    dragData = el.dataset.tile !== undefined ? { v: q.dd.values[+el.dataset.tile] } : { v: it.picked[+el.dataset.slot], from: +el.dataset.slot };
    if (!dragData.v) { dragData = null; return e.preventDefault(); }
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData("text/plain", dragData.v);
    el.classList.add("dragging");
  });
  document.addEventListener("dragend", (e) => { e.target.classList?.remove("dragging"); document.querySelectorAll(".slot.over, .dd-values.over").forEach((x) => x.classList.remove("over")); });
  document.addEventListener("dragover", (e) => {
    if (!dragData) return;
    const zone = e.target.closest?.("[data-slot], [data-ddpool]");
    if (!zone) return;
    e.preventDefault();
    document.querySelectorAll(".slot.over, .dd-values.over").forEach((x) => x !== zone && x.classList.remove("over"));
    zone.classList.add("over");
  });
  document.addEventListener("drop", (e) => {
    if (!dragData) return;
    const zone = e.target.closest?.("[data-slot], [data-ddpool]");
    const d = dragData; dragData = null;
    if (!zone) return;
    e.preventDefault();
    if (zone.dataset.slot !== undefined) return ddPlace(+zone.dataset.slot, d.v, d.from);
    if (d.from !== undefined) { cur().picked[d.from] = null; saveSession(); renderQuiz(); } // dragged back to the values pane
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "search") {
      study.q = e.target.value; study.shown = 25;
      const pos = e.target.selectionStart;
      renderStudy();
      const s = $("#search"); s.focus(); s.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.dataset.hs !== undefined && session && !cur().checked) {
      const k = +e.target.dataset.hs, i = e.target.value;
      cur().picked[k] = i === "" ? null : curQ().hs.options[k][+i];
      saveSession();
      renderQuiz();
      $(`select[data-hs="${k}"]`)?.focus();
      return;
    }
    const k = e.target.dataset.pref;
    if (k) { S.prefs[k] = e.target.checked; save(); renderSetup(); }
  });

  document.addEventListener("keydown", (e) => {
    // Drag-drop controls: let focused tiles use native Enter/Space, and make slots keyboard-clickable
    if (e.target.tagName === "SELECT") return;
    if (e.target.closest?.(".dd, .hs")) {
      if (e.target.dataset?.slot !== undefined && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.target.click(); }
      if (e.key === "Enter" || e.key === " ") return;
    }
    if (!session || session.finished || !$("#qcard") || e.target.tagName === "INPUT" || e.ctrlKey || e.metaKey || e.altKey) return;
    const it = cur(), q = curQ();
    const k = e.key.toUpperCase();
    let i = LETTERS.indexOf(k);
    if (i < 0 && /^[1-8]$/.test(e.key)) i = +e.key - 1;
    if (i >= 0 && i < it.order.length && q.type !== "self" && !it.checked) {
      const key = it.order[i];
      if (q.type === "multi") toggleIn(it.picked, key); else it.picked = [key];
      saveSession(); renderQuiz(); e.preventDefault(); return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (q.type !== "self" && !it.checked && it.picked.length) return check();
      if (it.status !== "pending") return session.idx < session.items.length - 1 ? go(session.idx + 1) : finish(false);
    }
    if (e.key === "ArrowRight") go(session.idx + 1);
    if (e.key === "ArrowLeft") go(session.idx - 1);
    if (k === "R" && !it.revealed && (q.type === "self" || session.instant)) $('[data-act="reveal"]')?.click();
  });

  window.addEventListener("beforeunload", pause);

  function toggleIn(arr, v) { const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); }

  // ------------------------------------------------------------------ boot
  marked.setOptions({ gfm: true, breaks: false });
  if (session && session.finished) { session = null; saveSession(); }
  if (session) { session.paused = true; }
  renderPlayer();
  renderHome();
})();
