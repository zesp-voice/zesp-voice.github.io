// topic.html — 주제 상세
import {
  db, auth, collection, doc, getDoc, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, updateDoc, onAuthStateChanged
} from "./firebase-init.js";
import {
  DEFAULT_DEPARTMENTS, deptColorOf, colorHexOf, DEPT_COLOR_HEX,
  ddayLabel, ddayBadgeClass, fmtDate, fmtDateTime, fmtRelative,
  isExpired, esc, qs, deptChipHTML, dailyBrowserHash, toast
} from "./utils.js";
import { countKeywords, topKeywords, toWordCloudList } from "./keywords.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const topicId = qs("id");
let topicData = null;
let departments = DEFAULT_DEPARTMENTS;
let stopwordsExtra = [];
let allComments = [];
let charts = { bar: null, donut: null, line: null };
let isAdmin = false;

if (!topicId) {
  document.getElementById("topic-loading").innerHTML = `
    <div class="empty__title">주제를 찾을 수 없습니다</div>
    <div><a href="./index.html">← 전체 주제로 돌아가기</a></div>
  `;
  throw new Error("topicId missing");
}

async function loadConfig() {
  try {
    const dSnap = await getDoc(doc(db, "config", "departments"));
    if (dSnap.exists() && Array.isArray(dSnap.data().list)) {
      departments = dSnap.data().list;
    }
    const sSnap = await getDoc(doc(db, "config", "stopwords"));
    if (sSnap.exists() && Array.isArray(sSnap.data().ko)) {
      stopwordsExtra = sSnap.data().ko;
    }
  } catch (e) { console.warn("config load fail", e); }
}

function populateDepartments() {
  const sel = $("#dept-select");
  const filterSel = $("#filter-dept");
  for (const d of departments) {
    sel.insertAdjacentHTML("beforeend", `<option value="${esc(d.name)}">${esc(d.name)}</option>`);
    filterSel.insertAdjacentHTML("beforeend", `<option value="${esc(d.name)}">${esc(d.name)}</option>`);
  }
}

function renderHeader(t) {
  const closed = t.status === "closed" || isExpired(t.dueAt);
  const dday = closed
    ? `<span class="badge badge--gray">의견 접수 종료</span>`
    : `<span class="${ddayBadgeClass(t.dueAt)}">${esc(ddayLabel(t.dueAt))}</span>`;

  $("#topic-header").innerHTML = `
    <div class="eyebrow">VOICE OF EASTARJET</div>
    <div class="row" style="gap: var(--sp-3); margin: var(--sp-3) 0 var(--sp-4);">
      <span style="font-size: 40px; line-height: 1;">${esc(t.coverEmoji || "✈️")}</span>
      <h1 style="margin: 0; font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.1;">${esc(t.title || "(제목 없음)")}</h1>
    </div>
    <p style="margin: 0 0 var(--sp-4); color: var(--ej-ink-3); line-height: 1.7; white-space: pre-wrap;">${esc(t.description || "")}</p>
    <div class="row">
      ${dday}
      <span class="text-small text-mute">마감일 ${fmtDate(t.dueAt)}</span>
    </div>
  `;

  if (closed) {
    $("#compose-area").classList.add("hidden");
    $("#closed-notice").classList.remove("hidden");
  }
}

async function submitComment() {
  const dept = $("#dept-select").value;
  const content = $("#comment-text").value.trim();
  const msgEl = $("#submit-msg");

  if (!dept) { toast(msgEl, "danger", "<b>본부를 선택해주세요</b>익명 통계 분석을 위해 본부 정보가 필요합니다."); return; }
  if (!content) { toast(msgEl, "danger", "<b>의견 내용을 입력해주세요</b>"); return; }
  if (content.length > 1500) { toast(msgEl, "danger", "<b>1,500자를 초과했습니다</b>"); return; }

  $("#submit-btn").disabled = true;
  $("#submit-btn").textContent = "등록 중…";

  try {
    const ipHash = await dailyBrowserHash();
    await addDoc(collection(db, "topics", topicId, "comments"), {
      content, department: dept, createdAt: serverTimestamp(), ipHash
    });
    // commentCount 증가 (간단 카운터, 정확하진 않지만 v1엔 충분)
    try {
      await updateDoc(doc(db, "topics", topicId), {
        commentCount: (topicData?.commentCount || 0) + 1
      });
    } catch (e) { /* ignore */ }

    $("#comment-text").value = "";
    $("#counter").textContent = "0";
    toast(msgEl, "success", "<b>의견이 등록되었습니다</b>참여해 주셔서 감사합니다.");
  } catch (e) {
    console.error(e);
    toast(msgEl, "danger", `<b>등록에 실패했습니다</b>${esc(e.message || "")}`);
  } finally {
    $("#submit-btn").disabled = false;
    $("#submit-btn").textContent = "의견 등록";
  }
}

function renderCommentList() {
  const filter = $("#filter-dept").value;
  const list = filter ? allComments.filter(c => c.department === filter) : allComments;
  const listEl = $("#comments-list");
  if (!list.length) {
    listEl.innerHTML = `
      <div class="empty">
        <div class="empty__title">아직 의견이 없습니다</div>
        <div>가장 먼저 의견을 남겨주세요.</div>
      </div>
    `;
    return;
  }
  listEl.innerHTML = list.map(c => `
    <div class="comment">
      <div class="comment__head">
        ${deptChipHTML(c.department, departments)}
        <span class="comment__time">${esc(fmtRelative(c.createdAt))}</span>
      </div>
      <div class="comment__body">${esc(c.content)}</div>
    </div>
  `).join("");
}

function renderAnalytics() {
  renderKPI();
  renderWordcloud();
  renderDeptDonut();
  renderTimeLine();
}

function destroyCharts() {
  for (const key of Object.keys(charts)) {
    if (charts[key]) { charts[key].destroy(); charts[key] = null; }
  }
}

function renderKPI() {
  $("#kpi-count").textContent = allComments.length.toLocaleString();
  const depts = new Set(allComments.map(c => c.department));
  $("#kpi-depts").textContent = depts.size;
  const avg = allComments.length
    ? Math.round(allComments.reduce((s, c) => s + (c.content?.length || 0), 0) / allComments.length)
    : 0;
  $("#kpi-avg").textContent = avg;
}

function renderWordcloud() {
  const counter = countKeywords(allComments, stopwordsExtra);
  const top = topKeywords(counter, { topN: 60, minCount: 3 });
  const canvas = $("#wordcloud");
  const wrap = canvas.parentElement;

  if (!top.length) {
    $("#wc-empty").classList.remove("hidden");
    wrap.style.display = "none";
    return;
  }
  $("#wc-empty").classList.add("hidden");
  wrap.style.display = "block";

  // 컨테이너의 고정 크기(width/height)를 캔버스 버퍼에 동기화 → 무한 확장 방지
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  canvas.style.width  = "100%";
  canvas.style.height = "100%";

  if (typeof WordCloud !== "undefined") {
    WordCloud(canvas, {
      list: toWordCloudList(top),
      gridSize: 8,
      weightFactor: 1,
      fontFamily: getComputedStyle(document.body).getPropertyValue("--ej-font").trim() || "Noto Sans KR",
      color: (word, weight) => {
        // 가중치별로 brand red 변형
        if (weight > 50) return "#D20015";
        if (weight > 30) return "#8E000E";
        if (weight > 20) return "#1B2A4E";
        return "#565A5B";
      },
      backgroundColor: "transparent",
      rotateRatio: 0.2,
      minSize: 12,
      shrinkToFit: true
    });
  }

  // bar chart 상위 15
  const top15 = top.slice(0, 15);
  const barCtx = $("#bar-chart").getContext("2d");
  if (charts.bar) charts.bar.destroy();
  charts.bar = new Chart(barCtx, {
    type: "bar",
    data: {
      labels: top15.map(t => t[0]),
      datasets: [{
        label: "언급 빈도",
        data: top15.map(t => t[1]),
        backgroundColor: "#D20015",
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { precision: 0, color: "#565A5B", font: { size: 11 } }, grid: { color: "#EFF1F2" } },
        y: { ticks: { color: "#111", font: { size: 12, weight: 600 } }, grid: { display: false } }
      }
    }
  });
}

function renderDeptDonut() {
  const byDept = new Map();
  for (const c of allComments) {
    byDept.set(c.department, (byDept.get(c.department) || 0) + 1);
  }
  const labels = [...byDept.keys()];
  const data = [...byDept.values()];
  const colors = labels.map(l => colorHexOf(l, departments));

  const ctx = $("#donut-chart").getContext("2d");
  if (charts.donut) charts.donut.destroy();
  charts.donut = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: "#fff", borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { color: "#111", font: { size: 12 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}건` } }
      },
      cutout: "60%"
    }
  });
}

function renderTimeLine() {
  // 일별 카운트
  const byDay = new Map();
  for (const c of allComments) {
    const d = c.createdAt?.toDate ? c.createdAt.toDate() : (c.createdAt instanceof Date ? c.createdAt : null);
    if (!d) continue;
    const key = `${d.getMonth()+1}/${d.getDate()}`;
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  const entries = [...byDay.entries()]; // 순서: insertion = createdAt asc
  const ctx = $("#line-chart").getContext("2d");
  if (charts.line) charts.line.destroy();
  charts.line = new Chart(ctx, {
    type: "line",
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{
        label: "일별 의견 수",
        data: entries.map(e => e[1]),
        borderColor: "#D20015",
        backgroundColor: "rgba(210,0,21,0.08)",
        fill: true, tension: 0.3, borderWidth: 2, pointRadius: 3, pointBackgroundColor: "#D20015"
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#565A5B", font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { precision: 0, color: "#565A5B", font: { size: 11 } }, grid: { color: "#EFF1F2" }, beginAtZero: true }
      }
    }
  });
}

async function init() {
  await loadConfig();
  populateDepartments();

  // 주제 도큐먼트 listen
  onSnapshot(doc(db, "topics", topicId), (snap) => {
    if (!snap.exists()) {
      document.getElementById("topic-loading").innerHTML = `
        <div class="empty__title">존재하지 않는 주제입니다</div>
        <div><a href="./index.html">← 전체 주제로 돌아가기</a></div>
      `;
      return;
    }
    topicData = snap.data();
    document.getElementById("topic-loading").style.display = "none";
    document.getElementById("topic-main").style.display = "block";
    renderHeader(topicData);
  });

  // 댓글 listen (최신순)
  const qComments = query(
    collection(db, "topics", topicId, "comments"),
    orderBy("createdAt", "asc")
  );
  onSnapshot(qComments, (snap) => {
    allComments = [];
    snap.forEach(d => allComments.push({ id: d.id, ...d.data() }));
    // 화면에 최신순으로 표시
    const sortedDesc = [...allComments].sort((a,b) => {
      const am = a.createdAt?.toMillis?.() || 0;
      const bm = b.createdAt?.toMillis?.() || 0;
      return bm - am;
    });
    const original = allComments;
    allComments = sortedDesc;
    renderCommentList();
    allComments = original;

    // 분석은 관리자만 — 패널이 보일 때만 갱신
    if (isAdmin) {
      renderAnalytics();
    }
  });

  // Auth 상태 → 분석 패널 토글
  onAuthStateChanged(auth, (user) => {
    isAdmin = !!user;
    const panel = document.getElementById("analytics-panel");
    if (isAdmin) {
      panel.classList.remove("hidden");
      // 이미 댓글이 로드된 상태라면 즉시 차트 그리기
      if (allComments.length) renderAnalytics();
    } else {
      panel.classList.add("hidden");
      destroyCharts();
    }
  });

  // 이벤트 바인딩
  $("#comment-text").addEventListener("input", (e) => {
    const len = e.target.value.length;
    const c = $("#counter");
    c.textContent = len;
    c.parentElement.classList.toggle("field__counter--warn", len > 1400);
  });
  $("#submit-btn").addEventListener("click", submitComment);
  $("#filter-dept").addEventListener("change", () => {
    // 필터링용: allComments는 asc 순. 표시 시점에 desc로 변환.
    const sortedDesc = [...allComments].sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
    const original = allComments;
    allComments = sortedDesc;
    renderCommentList();
    allComments = original;
  });
}

init();
