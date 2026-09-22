/* =========================================================
 *  DVA-C02 模擬試験アプリ 共通エンジン
 *  - data/days.js の window.DVA_DAYS に並んだ日をホームに表示する
 *  - 各日の問題は data/dayXXX.js が window.DVA_EXAMS に push する
 *  - 画面遷移はハッシュ（#/ = ホーム、#/day/001 = Day 001）
 *  file:// で開けるよう、fetch や ES Modules は使わない。
 * ========================================================= */
(function () {
  "use strict";

  const DAYS = window.DVA_DAYS || [];
  const PASS_RATE = 0.72;
  const LETTERS = "ABCDEFG";
  const DOMAINS = { 1: "開発", 2: "セキュリティ", 3: "デプロイ", 4: "トラブルシューティングと最適化" };

  const $ = (sel, root = document) => root.querySelector(sel);
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 保存できなくても動作は継続 */ } }
  };
  const historyKey = (day) => `dva-history-${day}`;

  let exam = null;      // 表示中の日のデータ
  let state = null;     // 受験中の状態
  let reviewFilter = "all";

  /* ---------- データ読み込み ---------- */
  const loading = {};
  function loadDay(day) {
    if (!loading[day]) {
      loading[day] = new Promise((resolve, reject) => {
        const found = () => (window.DVA_EXAMS || []).find((e) => e.day === day);
        if (found()) return resolve(found());
        const s = document.createElement("script");
        s.src = `data/day${day}.js`;
        s.onload = () => (found() ? resolve(found()) : reject(new Error(`data/day${day}.js に day: "${day}" のデータがありません`)));
        s.onerror = () => reject(new Error(`data/day${day}.js が見つかりません`));
        document.head.appendChild(s);
      });
    }
    return loading[day];
  }
  const examSeconds = (e) => (e.minutes || e.questions.length * 2) * 60;

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

  function domainChips(e) {
    return [...new Set(e.questions.flatMap(domainsOf))].sort()
      .map((d) => `<span class="chip chip--accent">分野${d} ${DOMAINS[d]}</span>`).join("");
  }

  const isAnswered = (qi) => state.answers[qi].size === exam.questions[qi].pick;

  function isCorrect(qi) {
    const picked = state.answers[qi];
    const correct = exam.questions[qi].options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
    return picked.size === correct.length && correct.every((i) => picked.has(i));
  }

  const inExam = () => state && !state.finished;

  function showView(name) {
    ["home", "start", "exam", "result"].forEach((v) => { $(`#view-${v}`).hidden = v !== name; });
    $("#actionbar").hidden = name !== "exam";
    $("#examStatus").hidden = name !== "exam";
    window.scrollTo(0, 0);
  }

  function setAppbarSub(text) { $("#appDay").textContent = text; }

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

  /* ---------- ルーティング ---------- */
  let currentHash = location.hash;
  let leaving = false;

  function route() {
    // 受験中に戻る操作などで別画面へ移ろうとしたら、確認してから中断する
    if (inExam() && !leaving) {
      const target = location.hash;
      history.replaceState(null, "", currentHash);
      openModal("試験を中断しますか？", `<p style="margin:0;color:var(--ink-2)">回答内容は保存されません。</p>`, "中断する", () => {
        abortExam();
        leaving = true;
        location.hash = target || "#/";
      });
      return;
    }
    leaving = false;
    currentHash = location.hash;

    const m = location.hash.match(/^#\/day\/(\d+)$/);
    if (m) openDay(m[1]); else renderHome();
  }

  function abortExam() {
    if (state) clearInterval(state.timerId);
    state = null;
  }

  /* ---------- ホーム画面 ---------- */
  function renderHome() {
    abortExam();
    exam = null;
    document.title = "DVA-C02 模擬試験";
    setAppbarSub("ホーム");
    showView("home");

    const list = $("#dayList");
    list.innerHTML = DAYS.length ? "" : `<div class="card empty">data/days.js に日が登録されていません</div>`;
    DAYS.forEach((day) => {
      const card = document.createElement("a");
      card.className = "card daycard is-loading";
      card.href = `#/day/${day}`;
      card.innerHTML = `<div class="daycard__day">Day ${day}</div><div class="daycard__title">読み込み中…</div>`;
      list.appendChild(card);
    });

    Promise.allSettled(DAYS.map(loadDay)).then((results) => {
      let questions = 0, taken = 0, okSum = 0, totalSum = 0;
      results.forEach((r, i) => {
        const day = DAYS[i], card = list.children[i];
        card.classList.remove("is-loading");
        if (r.status === "rejected") {
          card.classList.add("is-error");
          card.removeAttribute("href");
          card.innerHTML = `<div class="daycard__day">Day ${day}</div><div class="daycard__title">${r.reason.message}</div>`;
          return;
        }
        const e = r.value, last = store.get(historyKey(day));
        questions += e.questions.length;
        if (last) { taken++; okSum += last.ok; totalSum += last.total; }
        const pass = last && last.ok / last.total >= PASS_RATE;
        card.innerHTML = `
          <div class="daycard__top">
            <span class="daycard__day">Day ${day}</span>
            ${last
              ? `<span class="badge ${pass ? "badge--ok" : "badge--ng"}">前回 ${last.ok}/${last.total}</span>`
              : `<span class="chip">未受験</span>`}
          </div>
          <div class="daycard__title">${e.title || ""}</div>
          <div class="chips">${domainChips(e)}</div>
          <div class="daycard__meta">${e.questions.length} 問 ・ ${examSeconds(e) / 60} 分${e.date ? ` ・ ${e.date}` : ""}</div>`;
      });
      $("#homeDays").textContent = `${DAYS.length} 日`;
      $("#homeQuestions").textContent = `${questions} 問`;
      $("#homeTaken").textContent = `${taken} / ${DAYS.length}`;
      $("#homeRate").textContent = totalSum ? `${Math.round((okSum / totalSum) * 100)}%` : "—";
    });
  }

  /* ---------- 開始画面 ---------- */
  function openDay(day) {
    abortExam();
    loadDay(day).then((e) => {
      exam = e;
      renderStart();
      showView("start");
    }).catch((err) => {
      toast(err.message);
      location.hash = "#/";
    });
  }

  function renderStart() {
    const qs = exam.questions;
    document.title = `DVA-C02 模擬試験 Day ${exam.day}`;
    setAppbarSub(`Day ${exam.day}`);
    $("#startTitle").textContent = `Day ${exam.day} 模擬試験`;
    $("#startSubtitle").textContent = exam.title || "";
    $("#statCount").textContent = `${qs.length} 問`;
    $("#statTime").textContent = `${examSeconds(exam) / 60} 分`;
    $("#statMulti").textContent = `${qs.filter((q) => q.type === "multi").length} 問`;
    $("#startDomains").innerHTML = domainChips(exam);

    const last = store.get(historyKey(exam.day));
    $("#statLast").textContent = last ? `${last.ok} / ${last.total}` : "—";
    $("#statLastDate").textContent = last ? new Date(last.at).toLocaleDateString("ja-JP") : "未受験";
  }

  /* ---------- 試験 ---------- */
  function startExam() {
    abortExam();
    state = {
      current: 0,
      order: exam.questions.map((q) => shuffle(q.options.map((_, i) => i))),
      answers: exam.questions.map(() => new Set()),
      flags: new Set(),
      total: examSeconds(exam),
      remaining: examSeconds(exam),
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
    state.remaining = Math.max(state.total - Math.floor((Date.now() - state.startedAt) / 1000), 0);
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
    const total = exam.questions.length;
    const done = exam.questions.filter((_, i) => isAnswered(i)).length;
    $("#progressText").textContent = `${done} / ${total} 回答`;
    $("#progressBar").style.width = `${(done / total) * 100}%`;
    $("#actionStatus").textContent = `問題 ${state.current + 1} / ${total}`;
  }

  function renderNav() {
    const list = $("#qnavList");
    list.innerHTML = "";
    exam.questions.forEach((_, i) => {
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
    const qi = state.current, q = exam.questions[qi], picked = state.answers[qi];
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
    $("#nextBtn").disabled = qi === exam.questions.length - 1;
    const flagged = state.flags.has(qi);
    $("#flagBtn").classList.toggle("is-on", flagged);
    $("#flagBtn").setAttribute("aria-pressed", String(flagged));
    $("#flagLabel").textContent = flagged ? "見直し中" : "見直し";
  }

  function choose(optIdx) {
    const qi = state.current, q = exam.questions[qi], picked = state.answers[qi];
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
    if (i < 0 || i >= exam.questions.length) return;
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
    const unanswered = exam.questions.filter((_, i) => !isAnswered(i)).length;
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
    if (!inExam()) return;
    state.finished = true;
    clearInterval(state.timerId);
    closeModal();

    const qs = exam.questions;
    state.results = qs.map((_, i) => isCorrect(i));
    const ok = state.results.filter(Boolean).length;
    const rate = ok / qs.length;
    const pass = rate >= PASS_RATE;
    store.set(historyKey(exam.day), { ok, total: qs.length, at: Date.now() });

    const ring = $("#scoreRing");
    ring.style.setProperty("--p", Math.round(rate * 100));
    ring.classList.toggle("is-pass", pass);
    ring.classList.toggle("is-fail", !pass);
    $("#scoreValue").textContent = `${ok}/${qs.length}`;
    $("#scoreRate").textContent = `${Math.round(rate * 100)}%`;
    $("#verdict").textContent = pass ? "合格ライン到達" : "合格ライン未達";
    $("#verdict").className = "verdict " + (pass ? "is-pass" : "is-fail");
    $("#summaryMeta").textContent =
      `Day ${exam.day} ／ 合格ラインの目安 ${Math.round(PASS_RATE * 100)}% ／ 所要時間 ${fmtTime(state.total - state.remaining)} ／ 見直しフラグ ${state.flags.size} 問`;

    // 分野別の正答（複数分野にまたがる問題は各分野に計上）
    const byDomain = {};
    qs.forEach((q, i) => domainsOf(q).forEach((d) => {
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

    renderReviews();
    showView("result");
  }

  function renderReviews() {
    const counts = {
      all: exam.questions.length,
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
    const targets = exam.questions.map((_, i) => i).filter((i) =>
      reviewFilter === "all" || (reviewFilter === "wrong" && !state.results[i]) || (reviewFilter === "flagged" && state.flags.has(i)));

    if (!targets.length) {
      list.innerHTML = `<div class="card empty">該当する問題はありません</div>`;
      return;
    }
    targets.forEach((qi) => list.insertAdjacentHTML("beforeend", reviewHtml(qi)));
  }

  function reviewHtml(qi) {
    const q = exam.questions[qi], picked = state.answers[qi], order = state.order[qi], ok = state.results[qi];
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
    if (modalOpen() || !inExam() || $("#view-exam").hidden) return;
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
  $("#modalCancel").addEventListener("click", closeModal);
  $("#overlay").addEventListener("click", (e) => { if (e.target === $("#overlay")) closeModal(); });
  $("#themeBtn").addEventListener("click", toggleTheme);
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
    reviewFilter = tab.dataset.filter;
    renderReviews();
  }));
  document.addEventListener("keydown", onKey);
  window.addEventListener("hashchange", route);

  route();
})();
