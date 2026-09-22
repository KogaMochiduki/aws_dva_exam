/* =========================================================
 *  DVA-C02 模擬試験アプリ 共通エンジン
 *  問題データは data/dayXXX.js の window.DVA_EXAM から読み込む。
 *  file:// で開けるよう、fetch や ES Modules は使わない。
 * ========================================================= */
(function () {
  "use strict";

  const EXAM = window.DVA_EXAM;
  const QUESTIONS = EXAM.questions;
  const EXAM_SECONDS = (EXAM.minutes || QUESTIONS.length * 2) * 60;
  const PASS_RATE = 0.72;
  const LETTERS = "ABCDEFG";
  const DOMAINS = { 1: "開発", 2: "セキュリティ", 3: "デプロイ", 4: "トラブルシューティングと最適化" };
  const HISTORY_KEY = `dva-history-${EXAM.day}`;

  const $ = (sel, root = document) => root.querySelector(sel);
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 保存できなくても動作は継続 */ } }
  };

  let state = null;
  let reviewFilter = "all";

  /* ---------- ユーティリティ ---------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function domainsOf(q) {
    return [...new Set((q.domain.match(/分野(\d)/g) || []).map((d) => Number(d.slice(2))))];
  }

  function isAnswered(qi) {
    return state.answers[qi].size === QUESTIONS[qi].pick;
  }

  function isCorrect(qi) {
    const picked = state.answers[qi];
    const correct = QUESTIONS[qi].options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
    return picked.size === correct.length && correct.every((i) => picked.has(i));
  }

  function showView(name) {
    ["start", "exam", "result"].forEach((v) => { $(`#view-${v}`).hidden = v !== name; });
    $("#actionbar").hidden = name !== "exam";
    $("#examStatus").hidden = name !== "exam";
    window.scrollTo(0, 0);
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  /* ---------- モーダル（alert / confirm は使わない） ---------- */
  function openModal(title, bodyHtml, okLabel, onOk) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHtml;
    $("#modalOk").textContent = okLabel;
    $("#modalOk").onclick = () => { closeModal(); onOk(); };
    $("#overlay").hidden = false;
    $("#modalOk").focus();
  }
  function closeModal() { $("#overlay").hidden = true; }
  const modalOpen = () => !$("#overlay").hidden;

  /* ---------- 開始画面 ---------- */
  function renderStart() {
    document.title = `DVA-C02 模擬試験 Day ${EXAM.day}`;
    $("#appDay").textContent = `Day ${EXAM.day}`;
    $("#startTitle").textContent = `Day ${EXAM.day} 模擬試験`;
    $("#statCount").textContent = `${QUESTIONS.length} 問`;
    $("#statTime").textContent = `${EXAM_SECONDS / 60} 分`;
    $("#statMulti").textContent = `${QUESTIONS.filter((q) => q.type === "multi").length} 問`;

    const used = new Set(QUESTIONS.flatMap(domainsOf));
    $("#startDomains").innerHTML = [...used].sort()
      .map((d) => `<span class="chip chip--accent">分野${d} ${DOMAINS[d]}</span>`).join("");

    const last = store.get(HISTORY_KEY);
    $("#statLast").textContent = last ? `${last.ok} / ${last.total}` : "—";
    $("#statLastDate").textContent = last ? new Date(last.at).toLocaleDateString("ja-JP") : "未受験";
  }

  /* ---------- 試験 ---------- */
  function startExam() {
    state = {
      current: 0,
      order: QUESTIONS.map((q) => shuffle(q.options.map((_, i) => i))),
      answers: QUESTIONS.map(() => new Set()),
      flags: new Set(),
      remaining: EXAM_SECONDS,
      startedAt: Date.now(),
      timerId: null,
      finished: false
    };
    reviewFilter = "all";
    updateTimer();
    state.timerId = setInterval(tick, 1000);
    renderExam();
    showView("exam");
  }

  function tick() {
    state.remaining = Math.max(EXAM_SECONDS - Math.floor((Date.now() - state.startedAt) / 1000), 0);
    updateTimer();
    if (state.remaining === 0) finishExam();
  }

  function updateTimer() {
    $("#timerText").textContent = fmtTime(state.remaining);
    $("#timer").classList.toggle("is-warn", state.remaining <= 60);
  }

  function renderExam() {
    renderNav();
    renderQuestion();
    renderProgress();
  }

  function renderProgress() {
    const done = QUESTIONS.filter((_, i) => isAnswered(i)).length;
    $("#progressText").textContent = `${done} / ${QUESTIONS.length} 回答`;
    $("#progressBar").style.width = `${(done / QUESTIONS.length) * 100}%`;
    $("#actionStatus").textContent = `問題 ${state.current + 1} / ${QUESTIONS.length}`;
  }

  function renderNav() {
    const list = $("#qnavList");
    list.innerHTML = "";
    QUESTIONS.forEach((q, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qnav__item" +
        (isAnswered(i) ? " is-answered" : "") +
        (state.flags.has(i) ? " is-flagged" : "") +
        (i === state.current ? " is-current" : "");
      btn.textContent = i + 1;
      btn.setAttribute("aria-label", `問題 ${i + 1}${isAnswered(i) ? " 回答済み" : " 未回答"}${state.flags.has(i) ? " 見直し" : ""}`);
      btn.addEventListener("click", () => goTo(i));
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function renderQuestion() {
    const qi = state.current, q = QUESTIONS[qi], picked = state.answers[qi];
    const multi = q.type === "multi";
    const full = multi && picked.size >= q.pick;

    $("#qNo").textContent = `問題 ${qi + 1}`;
    $("#qChips").innerHTML =
      `<span class="chip">${q.domain}</span><span class="chip">${q.tag}</span>` +
      (multi ? `<span class="chip chip--accent">複数選択</span>` : "");
    $("#qText").innerHTML = q.text;
    $("#qInstruction").innerHTML = multi
      ? `${q.pick}つ選択してください <small>選択中 ${picked.size} / ${q.pick}</small>`
      : `1つ選択してください`;

    const box = $("#qOptions");
    box.innerHTML = "";
    state.order[qi].forEach((optIdx, pos) => {
      const selected = picked.has(optIdx);
      const disabled = full && !selected;
      const label = document.createElement("label");
      label.className = "option" + (multi ? " option--multi" : "") +
        (selected ? " is-selected" : "") + (disabled ? " is-disabled" : "");
      const input = document.createElement("input");
      input.type = multi ? "checkbox" : "radio";
      input.name = `q-${qi}`;
      input.checked = selected;
      input.disabled = disabled;
      input.addEventListener("change", () => choose(optIdx));
      label.appendChild(input);
      label.insertAdjacentHTML("beforeend",
        `<span class="option__key">${LETTERS[pos]}</span><span class="option__body">${q.options[optIdx].html}</span>`);
      box.appendChild(label);
    });

    $("#prevBtn").disabled = qi === 0;
    $("#nextBtn").disabled = qi === QUESTIONS.length - 1;
    const flagged = state.flags.has(qi);
    $("#flagBtn").classList.toggle("is-on", flagged);
    $("#flagBtn").setAttribute("aria-pressed", String(flagged));
    $("#flagLabel").textContent = flagged ? "見直し中" : "見直し";
  }

  function choose(optIdx) {
    const qi = state.current, q = QUESTIONS[qi], picked = state.answers[qi];
    if (q.type === "single") {
      picked.clear();
      picked.add(optIdx);
    } else if (picked.has(optIdx)) {
      picked.delete(optIdx);
    } else if (picked.size < q.pick) {
      picked.add(optIdx);
    } else {
      toast(`この問題は ${q.pick} つまで選択できます`);
      return;
    }
    renderExam();
  }

  function goTo(i) {
    if (i < 0 || i >= QUESTIONS.length) return;
    state.current = i;
    renderExam();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleFlag() {
    const qi = state.current;
    if (state.flags.has(qi)) state.flags.delete(qi); else state.flags.add(qi);
    renderExam();
  }

  function confirmFinish() {
    const unanswered = QUESTIONS.filter((_, i) => !isAnswered(i)).length;
    openModal("試験を終了しますか？",
      `<div class="modal__stats">
         <div class="stat"><div class="stat__label">未回答・選択不足</div><div class="stat__value">${unanswered} 問</div></div>
         <div class="stat"><div class="stat__label">見直しフラグ</div><div class="stat__value">${state.flags.size} 問</div></div>
       </div>
       <p style="margin:0;color:var(--ink-2)">終了すると回答は変更できません。</p>`,
      "終了して採点", finishExam);
  }

  /* ---------- 結果 ---------- */
  function finishExam() {
    if (!state || state.finished) return;
    state.finished = true;
    clearInterval(state.timerId);
    closeModal();

    state.results = QUESTIONS.map((_, i) => isCorrect(i));
    const ok = state.results.filter(Boolean).length;
    const total = QUESTIONS.length;
    const rate = ok / total;
    const pass = rate >= PASS_RATE;
    const used = EXAM_SECONDS - state.remaining;
    store.set(HISTORY_KEY, { ok, total, at: Date.now() });

    const ring = $("#scoreRing");
    ring.style.setProperty("--p", Math.round(rate * 100));
    ring.classList.toggle("is-pass", pass);
    ring.classList.toggle("is-fail", !pass);
    $("#scoreValue").textContent = `${ok}/${total}`;
    $("#scoreRate").textContent = `${Math.round(rate * 100)}%`;
    $("#verdict").textContent = pass ? "合格ライン到達" : "合格ライン未達";
    $("#verdict").className = "verdict " + (pass ? "is-pass" : "is-fail");
    $("#summaryMeta").textContent =
      `合格ラインの目安 ${Math.round(PASS_RATE * 100)}% ／ 所要時間 ${fmtTime(used)} ／ 見直しフラグ ${state.flags.size} 問`;

    // 分野別の正答（複数分野にまたがる問題は各分野に計上）
    const byDomain = {};
    QUESTIONS.forEach((q, i) => domainsOf(q).forEach((d) => {
      byDomain[d] = byDomain[d] || { ok: 0, total: 0 };
      byDomain[d].total++;
      if (state.results[i]) byDomain[d].ok++;
    }));
    $("#domainBars").innerHTML = Object.keys(byDomain).sort().map((d) => {
      const v = byDomain[d];
      return `<div class="domain">
        <span class="domain__name">分野${d} ${DOMAINS[d]}</span>
        <span class="domain__bar"><i style="width:${(v.ok / v.total) * 100}%"></i></span>
        <span class="domain__val">${v.ok}/${v.total}</span>
      </div>`;
    }).join("");

    $("#progressText").textContent = "採点済み";
    $("#progressBar").style.width = "100%";
    renderReviews();
    showView("result");
  }

  function renderReviews() {
    const counts = {
      all: QUESTIONS.length,
      wrong: state.results.filter((r) => !r).length,
      flagged: state.flags.size
    };
    document.querySelectorAll(".tab").forEach((tab) => {
      const f = tab.dataset.filter;
      tab.classList.toggle("is-active", f === reviewFilter);
      tab.setAttribute("aria-selected", String(f === reviewFilter));
      tab.querySelector(".count").textContent = counts[f];
    });

    const list = $("#reviewList");
    list.innerHTML = "";
    const targets = QUESTIONS.map((_, i) => i).filter((i) =>
      reviewFilter === "all" || (reviewFilter === "wrong" && !state.results[i]) || (reviewFilter === "flagged" && state.flags.has(i)));

    if (!targets.length) {
      list.innerHTML = `<div class="card empty">該当する問題はありません</div>`;
      return;
    }
    targets.forEach((qi) => list.insertAdjacentHTML("beforeend", reviewHtml(qi)));
  }

  function reviewHtml(qi) {
    const q = QUESTIONS[qi], picked = state.answers[qi], order = state.order[qi], ok = state.results[qi];
    const letterOf = (optIdx) => LETTERS[order.indexOf(optIdx)];
    const correctLetters = order.filter((i) => q.options[i].correct).map(letterOf).join(", ");
    const pickedLetters = order.filter((i) => picked.has(i)).map(letterOf).join(", ") || "未回答";

    const opts = order.map((optIdx, pos) => {
      const o = q.options[optIdx], mine = picked.has(optIdx);
      const cls = o.correct ? "is-correct" : mine ? "is-wrong" : "";
      return `<div class="ropt ${cls}">
        <div class="ropt__head">
          <span class="option__key">${LETTERS[pos]}</span>
          <span class="ropt__mark ${o.correct ? "is-ok" : "is-ng"}">${o.correct ? "✓ 正解" : "✗ 不正解"}</span>
          ${mine ? `<span class="chip">あなたの選択</span>` : ""}
        </div>
        <div class="option__body">${o.html}</div>
        <div class="ropt__why"><strong>${o.correct ? "正しい理由" : "誤りの理由"}：</strong>${o.why}</div>
      </div>`;
    }).join("");

    const refs = q.refs.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${t}</a></li>`).join("");

    return `<details class="card review" ${ok ? "" : "open"}>
      <summary>
        <span class="badge ${ok ? "badge--ok" : "badge--ng"}">${ok ? "正解" : "不正解"}</span>
        <span class="review__title">問題 ${qi + 1}</span>
        ${state.flags.has(qi) ? `<span class="chip chip--flag">見直し</span>` : ""}
        <span class="chip">${q.domain}</span>
        <span class="review__answer">あなた: ${pickedLetters} ／ 正解: ${correctLetters}</span>
      </summary>
      <div class="review__body">
        <div class="prose">${q.text}</div>
        ${opts}
        <div class="explain">${q.explanation}
          <h4>参考ドキュメント</h4>
          <ul class="refs">${refs}</ul>
        </div>
      </div>
    </details>`;
  }

  /* ---------- テーマ ---------- */
  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    store.set("dva-theme", root.dataset.theme);
  }

  /* ---------- キーボード操作 ---------- */
  function onKey(e) {
    if (e.key === "Escape" && modalOpen()) { closeModal(); return; }
    if (modalOpen() || !state || state.finished || $("#view-exam").hidden) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key.toUpperCase();
    const order = state.order[state.current];
    let pos = -1;
    if (/^[1-7]$/.test(key)) pos = Number(key) - 1;
    else if (/^[A-G]$/.test(key)) pos = LETTERS.indexOf(key);

    if (pos >= 0 && pos < order.length) { e.preventDefault(); choose(order[pos]); }
    else if (e.key === "ArrowRight") goTo(state.current + 1);
    else if (e.key === "ArrowLeft") goTo(state.current - 1);
    else if (key === "F") toggleFlag();
  }

  /* ---------- 初期化 ---------- */
  $("#startBtn").addEventListener("click", startExam);
  $("#prevBtn").addEventListener("click", () => goTo(state.current - 1));
  $("#nextBtn").addEventListener("click", () => goTo(state.current + 1));
  $("#flagBtn").addEventListener("click", toggleFlag);
  $("#finishBtn").addEventListener("click", confirmFinish);
  $("#finishBtnSide").addEventListener("click", confirmFinish);
  $("#retryBtn").addEventListener("click", startExam);
  $("#homeBtn").addEventListener("click", () => { renderStart(); showView("start"); });
  $("#modalCancel").addEventListener("click", closeModal);
  $("#overlay").addEventListener("click", (e) => { if (e.target === $("#overlay")) closeModal(); });
  $("#themeBtn").addEventListener("click", toggleTheme);
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
    reviewFilter = tab.dataset.filter;
    renderReviews();
  }));
  document.addEventListener("keydown", onKey);

  renderStart();
  showView("start");
})();
