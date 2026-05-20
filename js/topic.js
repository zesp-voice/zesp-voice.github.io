// topic.html — 주제 상세
import {
  db, auth, collection, doc, getDoc, addDoc, setDoc, deleteDoc, query, orderBy, onSnapshot,
  serverTimestamp, updateDoc, increment, onAuthStateChanged, signOut
} from "./firebase-init.js";
import {
  DEFAULT_DEPARTMENTS, deptColorOf, colorHexOf, DEPT_COLOR_HEX,
  fmtDate, fmtDateTime, fmtRelative,
  esc, qs, deptChipHTML, emojiHTML, toast, sha256, ddayBadgeHTML, topicClosed
} from "./utils.js";
import { countKeywords, topKeywords } from "./keywords.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const topicId = qs("id");
let topicData = null;
let departments = DEFAULT_DEPARTMENTS;
let stopwordsExtra = [];
let allComments = [];
let chartsPublic = { donut: null };   // 모든 사용자에게 노출 (donut 만 Chart.js, 워드클라우드는 SVG)
let chartsAdmin = { bar: null, line: null };
let isAdmin = false;
let pendingDeleteId = null;
let pendingEditId = null;
let pendingEditAdminMode = false;
let unsubTopic = null;
let unsubComments = null;
let unsubAuth = null;
let unsubPrivate = null;
let listSizeObserver = null;
const commentsPrivateMap = new Map();  // commentId → { employeeId, ipHash } (admin only)

// 오른쪽 의견 리스트 높이를 왼쪽 compose 높이와 동기화 (데스크톱 lg+ 만 적용)
function syncListHeight() {
  const compose = document.querySelector(".topic-layout__compose");
  const list = document.querySelector(".topic-layout__list");
  if (!compose || !list) return;
  if (window.innerWidth < 1024) {
    list.style.maxHeight = "";  // 모바일/태블릿 — CSS fallback 사용
    return;
  }
  list.style.maxHeight = compose.offsetHeight + "px";
}

function initListHeightSync() {
  if (listSizeObserver) return;  // 이미 초기화됨
  const compose = document.querySelector(".topic-layout__compose");
  if (!compose) return;
  syncListHeight();
  if (typeof ResizeObserver !== "undefined") {
    listSizeObserver = new ResizeObserver(syncListHeight);
    listSizeObserver.observe(compose);
  }
  window.addEventListener("resize", syncListHeight);
}

// 윈도우 리사이즈 시 워드클라우드 재렌더 (컨테이너 폭이 변하면 d3-cloud 가 새로 배치)
let wordcloudResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(wordcloudResizeTimer);
  wordcloudResizeTimer = setTimeout(() => {
    if (allComments.length) renderWordcloud();
  }, 250);
});

// ── 차트 색상 토큰 추출 (tokens.css 변경 시 자동 반영) ─────
const cssVar = (name, fallback) => {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
};
const CHART_COLORS = {
  red:     cssVar("--ej-red",      "#D20015"),
  redDeep: cssVar("--ej-red-deep", "#8E000E"),
  navy:    cssVar("--ej-navy",     "#1B2A4E"),
  ink:     cssVar("--ej-ink",      "#111111"),
  ink3:    cssVar("--ej-ink-3",    "#565A5B"),
  line:    cssVar("--ej-line",     "#EFF1F2")
};
const chartRedFill = `${CHART_COLORS.red}14`;  // 8% alpha (hex 14)

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
  const closed = topicClosed(t);
  const dday = ddayBadgeHTML(t, "의견 접수 종료");

  $("#topic-header").innerHTML = `
    <div class="eyebrow">VOICE OF EASTARJET</div>
    <div class="row" style="gap: var(--sp-3); margin: var(--sp-3) 0 var(--sp-4);">
      <span class="topic-header__emoji">${emojiHTML(t.coverEmoji || "✈️", "flag-emoji--lg")}</span>
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
  const employeeId = $("#employee-id").value.trim();
  const content = $("#comment-text").value.trim();
  const rawPw = $("#comment-password").value;
  const isPrivate = $("#comment-private").checked;
  const msgEl = $("#submit-msg");

  if (!dept)     { toast(msgEl, "danger", "<b>부문을 선택해주세요</b>"); return; }
  // 사번은 선택 입력 — 입력된 경우에만 형식 검증
  if (employeeId && !/^[0-9]{7}$/.test(employeeId)) {
    toast(msgEl, "danger", "<b>사번은 숫자 7자리여야 합니다</b>사번을 남기지 않으면 완전한 익명으로 등록됩니다.");
    return;
  }
  if (!content)  { toast(msgEl, "danger", "<b>의견 내용을 입력해주세요</b>"); return; }
  if (content.length > 1500)   { toast(msgEl, "danger", "<b>1,500자를 초과했습니다</b>"); return; }
  if (!rawPw)    { toast(msgEl, "danger", "<b>비밀번호를 입력해주세요</b>"); return; }
  if (rawPw.length < 4) { toast(msgEl, "danger", "<b>비밀번호는 4자 이상</b>"); return; }

  $("#submit-btn").disabled = true;
  $("#submit-btn").textContent = "등록 중…";

  try {
    const passwordHash = await sha256(rawPw);

    // 공개 도큐먼트 (부문·내용·시간·passwordHash·isPrivate)
    const publicRef = await addDoc(collection(db, "topics", topicId, "comments"), {
      content,
      department: dept,
      createdAt: serverTimestamp(),
      passwordHash,
      isPrivate
    });

    // 비공개 메타 (사번) — 사번을 남긴 경우에만 생성. 미입력 시 완전 익명.
    // 같은 commentId 로 저장하여 공개 댓글과 1:1 매칭.
    if (employeeId) {
      try {
        await setDoc(doc(db, "topics", topicId, "commentsPrivate", publicRef.id), {
          employeeId
        });
      } catch (e) {
        // 비공개 메타 저장 실패 시 공개 댓글도 롤백
        console.error("[commentsPrivate] write failed, rolling back public comment", e);
        try { await deleteDoc(doc(db, "topics", topicId, "comments", publicRef.id)); } catch (_) {}
        throw new Error("사번 저장에 실패했습니다. 다시 시도해주세요.");
      }
    }

    // commentCount 증가 — 원자적 카운터
    try {
      await updateDoc(doc(db, "topics", topicId), { commentCount: increment(1) });
    } catch (e) {
      console.error("[commentCount] update failed", e);
    }

    $("#comment-text").value = "";
    $("#comment-password").value = "";
    $("#employee-id").value = "";
    $("#comment-private").checked = false;
    $("#counter").textContent = "0";
    msgEl.classList.add("hidden");
    $("#submit-modal").classList.remove("hidden");
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
  const topicClosedNow = topicData ? topicClosed(topicData) : false;
  listEl.innerHTML = list.map(c => {
    const canAuthorAct = !!c.passwordHash;
    // 비공개 의견은 비관리자 화면에서 본문을 가림 (집계에는 포함)
    const masked = !!c.isPrivate && !isAdmin;
    const actBtns = [];
    if (isAdmin) {
      // 관리자는 마감 여부와 무관하게 수정·삭제 가능
      actBtns.push(`<button class="comment__edit" data-id="${c.id}" data-mode="admin" title="관리자 수정">수정</button>`);
      actBtns.push(`<button class="comment__del" data-id="${c.id}" data-mode="admin" title="관리자 삭제">삭제</button>`);
    } else if (canAuthorAct) {
      // 작성자 수정은 마감 전 + 본문이 보일 때만 노출. 삭제는 마감 후에도 가능.
      if (!topicClosedNow && !masked) {
        actBtns.push(`<button class="comment__edit" data-id="${c.id}" data-mode="author" title="비밀번호로 수정">수정</button>`);
      }
      actBtns.push(`<button class="comment__del" data-id="${c.id}" data-mode="author" title="비밀번호로 삭제">삭제</button>`);
    }
    // 관리자에게만 사번 표시 (commentsPrivateMap 은 admin only read 라 비admin 에서는 비어 있음)
    const priv = isAdmin ? commentsPrivateMap.get(c.id) : null;
    const empChip = priv && priv.employeeId
      ? `<span class="emp-id" title="관리자 전용 — 사번 ${esc(priv.employeeId)}">사번 ${esc(priv.employeeId)}</span>`
      : "";
    const editedBadge = c.editedAt
      ? `<span class="comment__edited text-mute text-small" title="${esc(fmtDateTime(c.editedAt))}">· 수정됨</span>`
      : "";
    const privBadge = c.isPrivate ? `<span class="comment__priv">비공개</span>` : "";
    const bodyHTML = masked
      ? `<div class="comment__body comment__body--private">작성자가 비공개로 남긴 의견입니다.</div>`
      : `<div class="comment__body">${esc(c.content)}</div>`;
    return `
    <div class="comment">
      <div class="comment__head">
        <div class="row" style="gap: var(--sp-2);">
          ${deptChipHTML(c.department, departments)}
          ${privBadge}
          ${empChip}
          <span class="comment__time" title="${esc(fmtDateTime(c.createdAt))}">${esc(fmtRelative(c.createdAt))}</span>
          ${editedBadge}
        </div>
        <div class="row" style="gap: var(--sp-2);">${actBtns.join("")}</div>
      </div>
      ${bodyHTML}
    </div>
  `;
  }).join("");

  // 삭제 버튼 바인딩
  listEl.querySelectorAll(".comment__del").forEach(btn => {
    btn.addEventListener("click", () => handleDeleteClick(btn.dataset.id, btn.dataset.mode));
  });
  // 수정 버튼 바인딩
  listEl.querySelectorAll(".comment__edit").forEach(btn => {
    btn.addEventListener("click", () => handleEditClick(btn.dataset.id, btn.dataset.mode));
  });
}

// ─────────────────────────────────────────────
// 댓글 삭제
// ─────────────────────────────────────────────
async function handleDeleteClick(commentId, mode) {
  const c = allComments.find(x => x.id === commentId);
  if (!c) return;

  if (mode === "admin") {
    if (!confirm("관리자 권한으로 이 의견을 삭제합니다. 계속하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "topics", topicId, "comments", commentId));
      // 비공개 메타도 함께 삭제 (있으면). 없어도 무방.
      try { await deleteDoc(doc(db, "topics", topicId, "commentsPrivate", commentId)); } catch (_) {}
      // commentCount 감소 — 홈 카드·KPI 동기화
      try { await updateDoc(doc(db, "topics", topicId), { commentCount: increment(-1) }); } catch (e) { console.error("[commentCount] decrement failed", e); }
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
    return;
  }

  // 작성자 모드 — 비밀번호 모달
  pendingDeleteId = commentId;
  $("#delete-pw-input").value = "";
  $("#delete-err").classList.add("hidden");
  $("#delete-modal").classList.remove("hidden");
  setTimeout(() => $("#delete-pw-input").focus(), 100);
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  const pw = $("#delete-pw-input").value;
  if (!pw) {
    showDeleteErr("비밀번호를 입력해주세요.");
    return;
  }
  const c = allComments.find(x => x.id === pendingDeleteId);
  if (!c || !c.passwordHash) {
    showDeleteErr("삭제 가능한 의견이 아닙니다.");
    return;
  }
  const inputHash = await sha256(pw);
  if (inputHash !== c.passwordHash) {
    showDeleteErr("비밀번호가 일치하지 않습니다.");
    return;
  }
  $("#delete-confirm").disabled = true;
  try {
    // 공개 댓글 먼저 삭제 — passwordHash 일치 확인은 위에서 끝났고, Rules 는 passwordHash 존재만 검증
    await deleteDoc(doc(db, "topics", topicId, "comments", pendingDeleteId));
    // 비공개 메타 정리 — Rules 가 매칭 공개 도큐먼트 부재 시 허용
    try { await deleteDoc(doc(db, "topics", topicId, "commentsPrivate", pendingDeleteId)); } catch (_) {}
    // commentCount 감소 — Rules 가 anonymous 의 ±1 update 만 허용
    try { await updateDoc(doc(db, "topics", topicId), { commentCount: increment(-1) }); } catch (e) { console.error("[commentCount] decrement failed", e); }
    closeDeleteModal();
  } catch (e) {
    showDeleteErr("삭제 실패: " + e.message);
  } finally {
    $("#delete-confirm").disabled = false;
  }
}

function showDeleteErr(msg) {
  $("#delete-err-msg").innerHTML = `<b>삭제할 수 없습니다</b>${esc(msg)}`;
  $("#delete-err").classList.remove("hidden");
}

function closeDeleteModal() {
  $("#delete-modal").classList.add("hidden");
  pendingDeleteId = null;
}

// ─────────────────────────────────────────────
// 댓글 수정 (2단계: 비밀번호 확인 → 내용 수정)
// ─────────────────────────────────────────────
function handleEditClick(commentId, mode) {
  const c = allComments.find(x => x.id === commentId);
  if (!c) return;

  pendingEditId = commentId;
  pendingEditAdminMode = (mode === "admin");

  // 공통 초기화
  $("#edit-pw-input").value = "";
  $("#edit-content").value = c.content || "";
  $("#edit-counter").textContent = (c.content || "").length;
  $("#edit-pw-err").classList.add("hidden");
  $("#edit-err").classList.add("hidden");

  if (pendingEditAdminMode) {
    // 관리자: Step 1 스킵, 바로 내용 수정
    showEditStep("content");
    $("#edit-intro").textContent = "관리자 권한으로 수정합니다. 부문과 작성 시각은 바뀌지 않습니다.";
  } else {
    // 작성자: Step 1 비밀번호 확인부터
    showEditStep("pw");
    $("#edit-intro").textContent = "내용을 수정해주세요. 부문과 작성 시각은 바뀌지 않습니다.";
  }

  $("#edit-modal").classList.remove("hidden");
  setTimeout(() => {
    if (pendingEditAdminMode) $("#edit-content").focus();
    else $("#edit-pw-input").focus();
  }, 100);
}

function showEditStep(step) {
  const stepPw = $("#edit-step-pw");
  const stepContent = $("#edit-step-content");
  const btnNext = $("#edit-pw-next");
  const btnConfirm = $("#edit-confirm");
  if (step === "pw") {
    stepPw.classList.remove("hidden");
    stepContent.classList.add("hidden");
    btnNext.classList.remove("hidden");
    btnConfirm.classList.add("hidden");
  } else {
    stepPw.classList.add("hidden");
    stepContent.classList.remove("hidden");
    btnNext.classList.add("hidden");
    btnConfirm.classList.remove("hidden");
  }
}

async function verifyEditPassword() {
  if (!pendingEditId) return;
  const c = allComments.find(x => x.id === pendingEditId);
  if (!c) { showEditPwErr("수정할 의견을 찾을 수 없습니다."); return; }
  if (!c.passwordHash) { showEditPwErr("수정 가능한 의견이 아닙니다."); return; }

  const pw = $("#edit-pw-input").value;
  if (!pw) { showEditPwErr("비밀번호를 입력해주세요."); return; }

  $("#edit-pw-next").disabled = true;
  try {
    const inputHash = await sha256(pw);
    if (inputHash !== c.passwordHash) {
      showEditPwErr("비밀번호가 일치하지 않습니다.");
      return;
    }
    // 통과 → 내용 수정 단계로
    showEditStep("content");
    setTimeout(() => $("#edit-content").focus(), 50);
  } finally {
    $("#edit-pw-next").disabled = false;
  }
}

async function confirmEdit() {
  if (!pendingEditId) return;
  const c = allComments.find(x => x.id === pendingEditId);
  if (!c) { showEditErr("수정할 의견을 찾을 수 없습니다."); return; }

  const newContent = $("#edit-content").value.trim();
  if (!newContent) { showEditErr("내용을 입력해주세요."); return; }
  if (newContent.length > 1500) { showEditErr("1,500자를 초과했습니다."); return; }
  if (newContent === (c.content || "")) { showEditErr("변경된 내용이 없습니다."); return; }

  $("#edit-confirm").disabled = true;
  try {
    await updateDoc(doc(db, "topics", topicId, "comments", pendingEditId), {
      content: newContent,
      editedAt: serverTimestamp()
    });
    closeEditModal();
  } catch (e) {
    console.error("[edit] update failed", e);
    showEditErr("수정 실패: " + (e.message || "알 수 없는 오류"));
  } finally {
    $("#edit-confirm").disabled = false;
  }
}

function showEditPwErr(msg) {
  $("#edit-pw-err-msg").innerHTML = `<b>확인할 수 없습니다</b>${esc(msg)}`;
  $("#edit-pw-err").classList.remove("hidden");
}

function showEditErr(msg) {
  $("#edit-err-msg").innerHTML = `<b>수정할 수 없습니다</b>${esc(msg)}`;
  $("#edit-err").classList.remove("hidden");
}

function closeEditModal() {
  $("#edit-modal").classList.add("hidden");
  pendingEditId = null;
  pendingEditAdminMode = false;
}

// 공개 분석 — 모든 사용자에게 항상 노출 (자주 등장한 키워드 + 부문별 분포 + 총 건수)
function renderPublicAnalytics() {
  $("#public-count").textContent = `총: ${allComments.length.toLocaleString()}건`;
  renderWordcloud();
  renderDeptDonut();
}

// 관리자 전용 분석 — KPI(참여 부문, 평균 글자수) + 상위 키워드 + 시간대별 추이
function renderAdminAnalytics() {
  renderKPI();
  renderBarChart();
  renderTimeLine();
}

function destroyCharts() {
  for (const key of Object.keys(chartsPublic)) {
    if (chartsPublic[key]) { chartsPublic[key].destroy(); chartsPublic[key] = null; }
  }
  destroyAdminCharts();
}
function destroyAdminCharts() {
  for (const key of Object.keys(chartsAdmin)) {
    if (chartsAdmin[key]) { chartsAdmin[key].destroy(); chartsAdmin[key] = null; }
  }
}

function renderKPI() {
  const depts = new Set(allComments.map(c => c.department));
  $("#kpi-depts").textContent = depts.size;
  const avg = allComments.length
    ? Math.round(allComments.reduce((s, c) => s + (c.content?.length || 0), 0) / allComments.length)
    : 0;
  $("#kpi-avg").textContent = avg;
}

// ── 워드클라우드 (d3-cloud SVG) — 공개 ─────────────────────
function renderWordcloud() {
  const counter = countKeywords(allComments, stopwordsExtra);
  const top = topKeywords(counter, { topN: 60, minCount: 3 });
  const svgEl = $("#wordcloud");
  const wrap = svgEl.parentElement;

  if (!top.length) {
    $("#wc-empty").classList.remove("hidden");
    wrap.style.display = "none";
    return;
  }
  $("#wc-empty").classList.add("hidden");
  wrap.style.display = "block";

  const width  = wrap.clientWidth  || 320;
  const height = wrap.clientHeight || 320;
  if (typeof d3 === "undefined" || !d3.layout || !d3.layout.cloud) {
    console.warn("[wordcloud] d3-cloud not loaded");
    return;
  }

  // 빈도 → 폰트 크기 (14~56px)
  const freqs = top.map(t => t[1]);
  const maxFreq = Math.max(...freqs);
  const minFreq = Math.min(...freqs);
  const sizeOf = (freq) => {
    if (maxFreq === minFreq) return 28;
    return 14 + (freq - minFreq) / (maxFreq - minFreq) * 42;
  };
  const fontFamily = getComputedStyle(document.body).getPropertyValue("--ej-font").trim() || "Noto Sans KR";
  const words = top.map(([text, freq]) => ({ text, freq, size: sizeOf(freq) }));

  d3.layout.cloud()
    .size([width, height])
    .words(words)
    .padding(3)
    .rotate(() => (Math.random() < 0.25 ? 90 : 0))
    .font(fontFamily)
    .fontSize(d => d.size)
    .spiral("archimedean")
    .on("end", drawCloud)
    .start();

  function drawCloud(placed) {
    // 기존 SVG 자식 제거
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    // width/height 속성 대신 viewBox 만 — CSS 가 실제 표시 크기 제어 (반응형 보장)
    svgEl.removeAttribute("width");
    svgEl.removeAttribute("height");
    svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const NS = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(NS, "g");
    g.setAttribute("transform", `translate(${width/2},${height/2})`);

    for (const w of placed) {
      const fill =
        w.freq >  maxFreq * 0.7 ? CHART_COLORS.red :
        w.freq >  maxFreq * 0.5 ? CHART_COLORS.redDeep :
        w.freq >  maxFreq * 0.3 ? CHART_COLORS.navy :
                                   CHART_COLORS.ink3;
      const weight = w.freq > maxFreq * 0.5 ? 700 : 500;

      const text = document.createElementNS(NS, "text");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("transform", `translate(${w.x},${w.y}) rotate(${w.rotate})`);
      text.setAttribute("font-size", w.size);
      text.setAttribute("font-family", w.font);
      text.setAttribute("font-weight", weight);
      text.setAttribute("fill", fill);
      text.style.cursor = "default";
      text.textContent = w.text;

      const titleEl = document.createElementNS(NS, "title");
      titleEl.textContent = `${w.text} — ${w.freq}회`;
      text.appendChild(titleEl);

      g.appendChild(text);
    }
    svgEl.appendChild(g);
  }
}

// ── 상위 키워드 bar chart — 관리자 ─────────────────────────
function renderBarChart() {
  const counter = countKeywords(allComments, stopwordsExtra);
  const top15 = topKeywords(counter, { topN: 15, minCount: 1 });
  const barCtx = $("#bar-chart").getContext("2d");
  if (chartsAdmin.bar) chartsAdmin.bar.destroy();
  chartsAdmin.bar = new Chart(barCtx, {
    type: "bar",
    data: {
      labels: top15.map(t => t[0]),
      datasets: [{
        label: "언급 빈도",
        data: top15.map(t => t[1]),
        backgroundColor: CHART_COLORS.red,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { precision: 0, color: CHART_COLORS.ink3, font: { size: 11 } }, grid: { color: CHART_COLORS.line } },
        y: { ticks: { color: CHART_COLORS.ink, font: { size: 12, weight: 600 } }, grid: { display: false } }
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
  if (chartsPublic.donut) chartsPublic.donut.destroy();
  chartsPublic.donut = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: "#fff", borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { color: CHART_COLORS.ink, font: { size: 12 } } },
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
  if (chartsAdmin.line) chartsAdmin.line.destroy();
  chartsAdmin.line = new Chart(ctx, {
    type: "line",
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{
        label: "일별 의견 수",
        data: entries.map(e => e[1]),
        borderColor: CHART_COLORS.red,
        backgroundColor: chartRedFill,
        fill: true, tension: 0.3, borderWidth: 2, pointRadius: 3, pointBackgroundColor: CHART_COLORS.red
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: CHART_COLORS.ink3, font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { precision: 0, color: CHART_COLORS.ink3, font: { size: 11 } }, grid: { color: CHART_COLORS.line }, beginAtZero: true }
      }
    }
  });
}

async function init() {
  await loadConfig();
  populateDepartments();

  // 주제 도큐먼트 listen
  unsubTopic = onSnapshot(doc(db, "topics", topicId), (snap) => {
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
    initListHeightSync();
  });

  // 댓글 listen (최신순)
  const qComments = query(
    collection(db, "topics", topicId, "comments"),
    orderBy("createdAt", "asc")
  );
  unsubComments = onSnapshot(qComments, (snap) => {
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

    // 공개 분석은 항상 갱신 (총 건수·워드클라우드·부문 도넛)
    renderPublicAnalytics();
    // 관리자 차트는 admin 일 때만 추가 갱신
    if (isAdmin) {
      renderAdminAnalytics();
    }
  });

  // Auth 상태 → 분석 패널 + 댓글 리스트 재렌더(관리자 삭제 버튼) + 사번 메타 listener
  unsubAuth = onAuthStateChanged(auth, (user) => {
    isAdmin = !!user;
    syncAdminChip(user);
    const panel = document.getElementById("analytics-panel");
    if (isAdmin) {
      panel.classList.remove("hidden");
      if (allComments.length) renderAdminAnalytics();
      // 관리자 진입 시 commentsPrivate(사번·ipHash) 구독 시작 — Rules 가 admin only read
      if (!unsubPrivate) {
        unsubPrivate = onSnapshot(
          collection(db, "topics", topicId, "commentsPrivate"),
          (snap) => {
            commentsPrivateMap.clear();
            snap.forEach(d => commentsPrivateMap.set(d.id, d.data()));
            // 사번 표시 갱신을 위해 리스트 재렌더
            if (allComments.length) {
              const sortedDesc = [...allComments].sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
              const original = allComments;
              allComments = sortedDesc;
              renderCommentList();
              allComments = original;
            }
          },
          (err) => console.error("[commentsPrivate] listen failed", err)
        );
      }
    } else {
      panel.classList.add("hidden");
      // 관리자 전용 차트만 해제 (공개 wordcloud/donut 유지)
      destroyAdminCharts();
      // 관리자 로그아웃 시 사번 listener 해제 + 메모리 비움
      if (unsubPrivate) { unsubPrivate(); unsubPrivate = null; }
      commentsPrivateMap.clear();
    }
    // 댓글 리스트는 상태와 관계없이 버튼 표시 차이만 있으므로 항상 재렌더
    if (allComments.length) {
      const sortedDesc = [...allComments].sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
      const original = allComments;
      allComments = sortedDesc;
      renderCommentList();
      allComments = original;
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

  // 등록 완료 모달 — 확인 버튼으로 닫기
  $("#submit-modal-ok").addEventListener("click", () => {
    $("#submit-modal").classList.add("hidden");
  });

  // 삭제 모달
  $("#delete-confirm").addEventListener("click", confirmDelete);
  $("#delete-pw-input").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmDelete(); });
  document.querySelectorAll("[data-close-delete]").forEach(el => el.addEventListener("click", closeDeleteModal));

  // 수정 모달 (Step 1: 비밀번호 확인 → Step 2: 내용 수정)
  $("#edit-pw-next").addEventListener("click", verifyEditPassword);
  $("#edit-pw-input").addEventListener("keydown", (e) => { if (e.key === "Enter") verifyEditPassword(); });
  $("#edit-confirm").addEventListener("click", confirmEdit);
  $("#edit-content").addEventListener("input", (e) => {
    const len = e.target.value.length;
    const c = $("#edit-counter");
    c.textContent = len;
    c.parentElement.classList.toggle("field__counter--warn", len > 1400);
  });
  document.querySelectorAll("[data-close-edit]").forEach(el => el.addEventListener("click", closeEditModal));

  $("#filter-dept").addEventListener("change", () => {
    // 필터링용: allComments는 asc 순. 표시 시점에 desc로 변환.
    const sortedDesc = [...allComments].sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
    const original = allComments;
    allComments = sortedDesc;
    renderCommentList();
    allComments = original;
  });
}

// ── 관리자 상태 chip + 로그아웃 (topbar 공통) ──────────────
function mountAdminChip() {
  const chip = document.getElementById("admin-chip");
  const navAdmin = document.getElementById("nav-admin");
  const signoutBtn = document.getElementById("admin-signout");
  if (!chip || !signoutBtn) return;

  // 메인 onAuthStateChanged 리스너는 이미 isAdmin 상태를 추적하므로 별도 구독 없이 init 흐름에 위임.
  // 여기서는 DOM 토글 + 로그아웃 핸들러만 담당하고, auth 변경 시 같은 리스너에서 호출되도록 한다.
  signoutBtn.addEventListener("click", async () => {
    if (!confirm("관리자 로그아웃 하시겠습니까?")) return;
    signoutBtn.disabled = true;
    try {
      await signOut(auth);
    } catch (e) {
      alert("로그아웃 실패: " + (e.message || ""));
    } finally {
      signoutBtn.disabled = false;
    }
  });
}

function syncAdminChip(user) {
  const chip = document.getElementById("admin-chip");
  const navAdmin = document.getElementById("nav-admin");
  const chipLabel = document.getElementById("admin-chip-label");
  if (!chip) return;
  if (user) {
    chip.classList.remove("hidden");
    if (navAdmin) navAdmin.classList.add("hidden");
    if (chipLabel) chipLabel.textContent = user.email ? user.email.split("@")[0] : "관리자";
  } else {
    chip.classList.add("hidden");
    if (navAdmin) navAdmin.classList.remove("hidden");
    if (chipLabel) chipLabel.textContent = "관리자";
  }
}

mountAdminChip();

// pagehide 는 unload + bfcache 진입 양쪽 모두에 호출 → Firestore 리스너·차트 정리에 적합
window.addEventListener("pagehide", () => {
  if (unsubTopic) unsubTopic();
  if (unsubComments) unsubComments();
  if (unsubAuth) unsubAuth();
  if (unsubPrivate) unsubPrivate();
  if (listSizeObserver) listSizeObserver.disconnect();
  destroyCharts();
});

init();
