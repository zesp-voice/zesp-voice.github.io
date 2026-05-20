// admin.html — 관리자 (Firebase Auth ID/PW)
import {
  db, auth, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp, Timestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence, browserSessionPersistence
} from "./firebase-init.js";
import {
  DEFAULT_DEPARTMENTS, fmtDate, fmtDateTime,
  esc, emojiHTML, toast, ddayBadgeHTML
} from "./utils.js";
import { countKeywords, topKeywords } from "./keywords.js";

const $ = (s) => document.querySelector(s);

const EMAIL_DOMAIN = "@eastarjet.com";
const AUTO_LOGIN_KEY = "eastarAdminAutoLogin";
const LAST_ID_KEY = "eastarAdminLastId";
const EMOJI_OPTIONS = [
  ["✈️", "항공 비행기 노선 취항"],
  ["🛫", "출발 신규 취항 시작"],
  ["🛬", "도착 복항 착륙"],
  ["🧭", "방향 전략 항로"],
  ["🗺️", "지도 노선 지역"],
  ["📍", "위치 지점 공항"],
  ["🧳", "여객 수하물 여행"],
  ["🎫", "예약 발권 티켓"],
  ["🛂", "출입국 공항 운송"],
  ["🛡️", "안전 보안 보호"],
  ["⚠️", "주의 위험 리스크"],
  ["✅", "점검 확인 완료"],
  ["📋", "절차 체크리스트 문서"],
  ["📌", "공지 중요 안내"],
  ["💬", "의견 소통 댓글"],
  ["💡", "아이디어 개선 제안"],
  ["🔄", "변경 전환 프로세스"],
  ["📈", "성과 증가 지표"],
  ["📊", "분석 통계 데이터"],
  ["🧩", "문제 해결 조합"],
  ["🛠️", "정비 개선 도구"],
  ["⚙️", "시스템 설정 운영"],
  ["🖥️", "시스템 IT 화면"],
  ["📱", "모바일 앱"],
  ["👥", "조직 임직원 협업"],
  ["🤝", "협력 합의 지원"],
  ["🎓", "교육 훈련 학습"],
  ["📣", "안내 홍보 공지"],
  ["⏱️", "시간 일정 마감"],
  ["📅", "일정 날짜 계획"],
  ["🏢", "부문 조직 사무실"],
  ["🧪", "테스트 검증"],
  ["🚧", "준비 공사 개선중"],
  ["🌏", "국제 해외 노선"],
  ["⭐", "포상 우수"],
  ["🔥", "이슈 긴급 중요"],
  ["🇯🇵", "일본 도쿄 오사카 후쿠오카 삿포로 오키나와 히로시마"],
  ["🇹🇼", "대만 타이베이 타이중 가오슝"],
  ["🇭🇰", "홍콩 hkg"],
  ["🇲🇴", "마카오 mfm"],
  ["🇨🇳", "중국 상하이 장가계 항저우"],
  ["🇲🇳", "몽골 울란바토르 uln"],
  ["🇻🇳", "베트남 나트랑 다낭 푸꾸옥 하노이 호치민"],
  ["🇹🇭", "태국 방콕 치앙마이 푸켓"],
  ["🇵🇭", "필리핀 세부 마닐라 보홀"],
  ["🇲🇾", "말레이시아 코타키나발루 쿠알라룸푸르"],
  ["🇮🇩", "인도네시아 발리 덴파사르 자카르타 dps cgk"],
  ["🇸🇬", "싱가포르"],
  ["🇰🇷", "대한민국 한국 국내 대구 청주 제주 인천 김포 부산"],
  ["🇺🇸", "미국 괌 사이판"],
  ["🇬🇺", "괌 guam"],
  ["🇲🇵", "사이판 북마리아나"]
];

let departments = DEFAULT_DEPARTMENTS;
let editingId = null;
let currentQRFilename = "qr";
let topicsUnsub = null;
let authUnsub = null;

// ─────────────────────────────────────────────
// ID 보완: 사번/아이디만 입력 시 @eastarjet.com 자동 추가
// ─────────────────────────────────────────────
function normalizeEmail(input) {
  const v = (input || "").trim().toLowerCase();
  if (!v) return "";
  if (v.includes("@")) return v;
  return v + EMAIL_DOMAIN;
}

// ─────────────────────────────────────────────
// 초기 설정 도큐먼트 생성 (departments / stopwords)
// ─────────────────────────────────────────────
async function ensureDepartmentsConfig() {
  try {
    const ref = doc(db, "config", "departments");
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { list: DEFAULT_DEPARTMENTS });
    } else if (Array.isArray(snap.data().list)) {
      departments = snap.data().list;
    }
  } catch (e) { console.warn("departments init", e); }
}

async function ensureStopwordsConfig() {
  try {
    const ref = doc(db, "config", "stopwords");
    const snap = await getDoc(ref);
    if (!snap.exists()) await setDoc(ref, { ko: [] });
  } catch (e) { console.warn("stopwords init", e); }
}

// ─────────────────────────────────────────────
// 인증 흐름
// ─────────────────────────────────────────────
async function handleLogin() {
  const adminId = $("#admin-id").value.trim();
  const email = normalizeEmail(adminId);
  const pw = $("#pw-input").value;
  const keepSignedIn = $("#auto-login").checked;
  if (!adminId || !pw) {
    showAuthError("ID와 PW를 입력해주세요.");
    return;
  }
  $("#login-btn").disabled = true;
  $("#login-btn").textContent = "로그인 중…";
  try {
    await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, pw);
    localStorage.setItem(AUTO_LOGIN_KEY, keepSignedIn ? "1" : "0");
    localStorage.setItem(LAST_ID_KEY, adminId.toLowerCase());
    // onAuthStateChanged 가 나머지 처리
  } catch (e) {
    const msg = friendlyAuthError(e.code) || e.message;
    showAuthError(msg);
  } finally {
    $("#login-btn").disabled = false;
    $("#login-btn").textContent = "로그인";
  }
}

function friendlyAuthError(code) {
  const map = {
    "auth/invalid-email":       "ID 형식이 올바르지 않습니다.",
    "auth/user-disabled":       "이 계정은 비활성화되어 있습니다.",
    "auth/user-not-found":      "등록되지 않은 계정입니다. Firebase 콘솔에서 사용자를 추가하세요.",
    "auth/wrong-password":      "비밀번호가 일치하지 않습니다.",
    "auth/invalid-credential":  "ID 또는 PW가 올바르지 않습니다.",
    "auth/too-many-requests":   "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
    "auth/network-request-failed": "네트워크 연결을 확인해주세요.",
  };
  return map[code] || null;
}

function showAuthError(msg, type) {
  const el = $("#auth-err");
  el.classList.remove("hidden", "alert--success", "alert--danger");
  el.classList.add(type === "success" ? "alert--success" : "alert--danger");
  $("#auth-err-msg").innerHTML = type === "success"
    ? `<b>전송 완료</b>${esc(msg)}`
    : `<b>로그인 실패</b>${esc(msg)}`;
}

async function handleLogout() {
  try {
    if (topicsUnsub) { topicsUnsub(); topicsUnsub = null; }
    await signOut(auth);
  } catch (e) { console.error(e); }
}

// ─────────────────────────────────────────────
// 인증 상태 변경 → 화면 전환
// ─────────────────────────────────────────────
function setAuthed(user) {
  const chip = $("#admin-chip");
  const chipLabel = $("#admin-chip-label");
  const navAdmin = $("#nav-admin");
  if (user) {
    $("#gate").classList.add("hidden");
    $("#admin-main").classList.remove("hidden");
    if (chip) chip.classList.remove("hidden");
    if (navAdmin) navAdmin.classList.add("hidden");
    if (chipLabel) chipLabel.textContent = user.email ? user.email.split("@")[0] : "관리자";
    listenTopics();
  } else {
    $("#gate").classList.remove("hidden");
    $("#admin-main").classList.add("hidden");
    if (chip) chip.classList.add("hidden");
    if (navAdmin) navAdmin.classList.remove("hidden");
    if (chipLabel) chipLabel.textContent = "관리자";
    $("#auth-err").classList.add("hidden");
    if (topicsUnsub) { topicsUnsub(); topicsUnsub = null; }
  }
}

// ─────────────────────────────────────────────
// 주제 리스트
// ─────────────────────────────────────────────
function topicRowHTML(t, id) {
  const dday = ddayBadgeHTML(t);

  return `
    <div class="chart-card" data-id="${id}">
      <div class="row row--between" style="flex-wrap: wrap; gap: var(--sp-3);">
        <div style="flex: 1; min-width: 240px;">
          <div class="row" style="gap: var(--sp-2);">
            <span class="admin-topic-emoji">${emojiHTML(t.coverEmoji || "✈️")}</span>
            <strong style="font-size: 16px;">${esc(t.title || "(제목 없음)")}</strong>
            ${dday}
          </div>
          <div class="text-small text-mute" style="margin-top: 6px;">
            마감 ${fmtDate(t.dueAt)} · 의견 <span class="text-num">${t.commentCount ?? 0}</span>건
          </div>
        </div>
        <div class="row">
          <a class="btn btn--tertiary btn--sm" href="topic.html?id=${encodeURIComponent(id)}" target="_blank">미리보기</a>
          <button class="btn btn--ghost btn--sm" data-act="qr" data-id="${id}">QR</button>
          <button class="btn btn--ghost btn--sm" data-act="export" data-id="${id}">CSV</button>
          <button class="btn btn--secondary btn--sm" data-act="edit" data-id="${id}">편집</button>
        </div>
      </div>
    </div>
  `;
}

function listenTopics() {
  const qAll = query(collection(db, "topics"), orderBy("createdAt", "desc"));
  topicsUnsub = onSnapshot(qAll, (snap) => {
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    $("#admin-topics").innerHTML = list.length
      ? list.map(t => topicRowHTML(t, t.id)).join("")
      : `<div class="empty"><div class="empty__title">등록된 주제가 없습니다</div>+ 새 주제 등록 버튼으로 시작하세요.</div>`;

    $("#admin-topics").querySelectorAll("[data-act]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === "edit") openEditModal(id);
        else if (act === "qr") openQRModal(id);
        else if (act === "export") exportTopicCSV(id);
      });
    });
  }, (err) => {
    console.error("topics listen", err);
    $("#admin-topics").innerHTML = `<div class="alert alert--danger">권한 오류: Firestore Rules가 게시되었는지 확인해주세요.</div>`;
  });
}

// ─────────────────────────────────────────────
// 주제 편집 모달
// ─────────────────────────────────────────────
function openEditModal(id) {
  editingId = id;
  $("#modal-title").textContent = id ? "주제 편집" : "새 주제 등록";
  $("#topic-delete").classList.toggle("hidden", !id);

  if (id) {
    getDoc(doc(db, "topics", id)).then(snap => {
      if (!snap.exists()) return;
      const t = snap.data();
      setTopicEmoji(t.coverEmoji || "✈️");
      $("#topic-title").value = t.title || "";
      $("#topic-desc").value = t.description || "";
      const due = t.dueAt?.toDate ? t.dueAt.toDate() : null;
      $("#topic-due").value = due ? due.toISOString().slice(0,10) : "";
      $("#topic-status").value = t.status || "active";
    });
  } else {
    setTopicEmoji("✈️");
    $("#topic-title").value = "";
    $("#topic-desc").value = "";
    const d = new Date(); d.setDate(d.getDate() + 14);
    $("#topic-due").value = d.toISOString().slice(0,10);
    $("#topic-status").value = "active";
  }
  $("#modal-err").classList.add("hidden");
  closeEmojiPicker();
  $("#topic-modal").classList.remove("hidden");
}

function closeModals() {
  $("#topic-modal").classList.add("hidden");
  $("#qr-modal").classList.add("hidden");
  closeEmojiPicker();
  editingId = null;
}

function setTopicEmoji(emoji) {
  const value = emoji || "✈️";
  $("#topic-emoji").value = value;
  $("#emoji-picker-current").innerHTML = emojiHTML(value);
  renderEmojiOptions($("#emoji-search")?.value || "");
}

function openEmojiPicker() {
  $("#emoji-picker-panel").classList.remove("hidden");
  $("#emoji-picker-btn").setAttribute("aria-expanded", "true");
  $("#emoji-search").focus();
  renderEmojiOptions($("#emoji-search").value);
}

function closeEmojiPicker() {
  $("#emoji-picker-panel").classList.add("hidden");
  $("#emoji-picker-btn").setAttribute("aria-expanded", "false");
}

function toggleEmojiPicker() {
  if ($("#emoji-picker-panel").classList.contains("hidden")) openEmojiPicker();
  else closeEmojiPicker();
}

function renderEmojiOptions(filter = "") {
  const q = filter.trim().toLowerCase();
  const selected = $("#topic-emoji")?.value || "✈️";
  const options = EMOJI_OPTIONS.filter(([emoji, label]) => {
    return !q || emoji.includes(q) || label.toLowerCase().includes(q);
  });
  $("#emoji-options").innerHTML = options.length
    ? options.map(([emoji, label]) => `
        <button class="emoji-option" type="button" data-emoji="${esc(emoji)}" title="${esc(label)}" aria-label="${esc(label)}" aria-pressed="${emoji === selected ? "true" : "false"}">${emojiHTML(emoji)}</button>
      `).join("")
    : `<div class="text-small text-mute" style="grid-column: 1 / -1; padding: var(--sp-3);">검색 결과가 없습니다.</div>`;

  $("#emoji-options").querySelectorAll("[data-emoji]").forEach(btn => {
    btn.addEventListener("click", () => {
      setTopicEmoji(btn.dataset.emoji);
      closeEmojiPicker();
      $("#topic-title").focus();
    });
  });
}

async function saveTopic() {
  const title = $("#topic-title").value.trim();
  const desc = $("#topic-desc").value.trim();
  const dueStr = $("#topic-due").value;
  const emoji = $("#topic-emoji").value.trim() || "✈️";
  const status = $("#topic-status").value;

  if (!title) { showModalErr("주제 제목을 입력해주세요."); return; }
  if (!dueStr) { showModalErr("마감일을 선택해주세요."); return; }
  const due = new Date(dueStr + "T23:59:59");
  if (isNaN(due.getTime())) { showModalErr("마감일 형식이 올바르지 않습니다."); return; }

  const payload = {
    title, description: desc, coverEmoji: emoji,
    dueAt: Timestamp.fromDate(due), status,
  };

  try {
    if (editingId) {
      await updateDoc(doc(db, "topics", editingId), { ...payload, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "topics"), {
        ...payload, commentCount: 0, createdAt: serverTimestamp()
      });
    }
    closeModals();
  } catch (e) {
    showModalErr(`저장 실패: ${e.message}`);
  }
}

function showModalErr(msg) {
  $("#modal-err-msg").innerHTML = `<b>입력 확인</b>${esc(msg)}`;
  $("#modal-err").classList.remove("hidden");
}

async function deleteCurrentTopic() {
  if (!editingId) return;
  if (!confirm("이 주제와 모든 의견을 삭제합니다. 계속하시겠습니까?")) return;

  try {
    const cSnap = await getDocs(collection(db, "topics", editingId, "comments"));
    await Promise.all(cSnap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "topics", editingId));
    closeModals();
  } catch (e) {
    showModalErr(`삭제 실패: ${e.message}`);
  }
}

// ─────────────────────────────────────────────
// QR
// ─────────────────────────────────────────────
// QR 모달 — qrcodejs(1.0.0) 생성자 API 사용
function renderQRModal(url, filename, title) {
  currentQRFilename = filename;
  $("#qr-modal-title").textContent = title || "QR 코드";
  $("#qr-url").textContent = url;
  $("#qr-target").innerHTML = "";
  $("#qr-modal").classList.remove("hidden");

  if (typeof QRCode === "undefined") {
    $("#qr-target").textContent = "QR 라이브러리를 불러오지 못했습니다.";
    return;
  }
  try {
    new QRCode($("#qr-target"), {
      text: url,
      width: 256,
      height: 256,
      colorDark: "#D20015",
      colorLight: "#FFFFFF",
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (e) {
    console.error("[QR] render failed", e);
    $("#qr-target").textContent = "QR 생성에 실패했습니다.";
  }
}

function siteBaseUrl() {
  return location.href.replace(/\/admin\.html.*$/, "/");
}

// 주제별 QR
function openQRModal(id) {
  renderQRModal(`${siteBaseUrl()}topic.html?id=${encodeURIComponent(id)}`,
    `eastar-changemgmt-${id}`, "주제 QR 코드");
}

// 사이트 대표 QR (루트 URL)
function openSiteQRModal() {
  renderQRModal(siteBaseUrl(), "eastar-changemgmt-site", "사이트 대표 QR");
}

function downloadQR() {
  // qrcodejs 는 canvas 와 img 를 모두 생성 — canvas 우선, 실패 시 img.src 폴백
  const canvas = $("#qr-target canvas");
  const img = $("#qr-target img");
  let dataUrl = null;
  if (canvas) { try { dataUrl = canvas.toDataURL("image/png"); } catch (_) {} }
  if (!dataUrl && img && img.src) dataUrl = img.src;
  if (!dataUrl) return;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${currentQRFilename}.png`;
  a.click();
}

// ─────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────
async function fetchAllCommentsOf(topicId) {
  // 공개 + 비공개 메타 동시 fetch 후 commentId 로 join
  const [publicSnap, privateSnap] = await Promise.all([
    getDocs(query(collection(db, "topics", topicId, "comments"), orderBy("createdAt", "asc"))),
    getDocs(collection(db, "topics", topicId, "commentsPrivate"))
  ]);
  const privateMap = new Map();
  privateSnap.forEach(d => privateMap.set(d.id, d.data()));
  return publicSnap.docs.map(d => {
    const pub = d.data();
    const priv = privateMap.get(d.id) || {};
    return { id: d.id, ...pub, employeeId: priv.employeeId || "" };
  });
}

async function exportTopicCSV(topicId) {
  toast($("#ops-msg"), "notice", "<b>CSV 내보내는 중…</b>잠시만 기다려주세요.");
  try {
    const tSnap = await getDoc(doc(db, "topics", topicId));
    const t = tSnap.data() || {};
    const comments = await fetchAllCommentsOf(topicId);
    const rows = [["주제ID","주제","부문","사번","의견","작성시각","주요키워드"]];
    for (const c of comments) {
      const tokens = topKeywords(countKeywords([c]), { topN: 5, minCount: 1 }).map(([w]) => w).join(",");
      rows.push([
        topicId, t.title || "", c.department || "", c.employeeId || "", c.content || "",
        c.createdAt?.toDate ? fmtDateTime(c.createdAt) : "", tokens
      ]);
    }
    downloadCSV(rows, `${(t.title || topicId).replace(/[\\/:*?"<>|]/g,"_")}_의견_${new Date().toISOString().slice(0,10)}.csv`);
    toast($("#ops-msg"), "success", `<b>완료</b>${comments.length}건의 의견을 내보냈습니다.`);
  } catch (e) {
    toast($("#ops-msg"), "danger", `<b>실패</b>${esc(e.message)}`);
  }
}

async function exportAllCSV() {
  toast($("#ops-msg"), "notice", "<b>전체 데이터 내보내는 중…</b>");
  try {
    const tSnap = await getDocs(query(collection(db, "topics"), orderBy("createdAt", "desc")));
    const rows = [["주제ID","주제","상태","마감일","부문","사번","의견","작성시각","주요키워드"]];
    let total = 0;
    for (const tDoc of tSnap.docs) {
      const t = tDoc.data();
      const comments = await fetchAllCommentsOf(tDoc.id);
      for (const c of comments) {
        const tokens = topKeywords(countKeywords([c]), { topN: 5, minCount: 1 }).map(([w]) => w).join(",");
        rows.push([
          tDoc.id, t.title || "", t.status || "", fmtDate(t.dueAt),
          c.department || "", c.employeeId || "", c.content || "",
          c.createdAt?.toDate ? fmtDateTime(c.createdAt) : "", tokens
        ]);
      }
      total += comments.length;
    }
    downloadCSV(rows, `eastar-changemgmt-전체_${new Date().toISOString().slice(0,10)}.csv`);
    toast($("#ops-msg"), "success", `<b>완료</b>총 ${total}건 내보냄.`);
  } catch (e) {
    toast($("#ops-msg"), "danger", `<b>실패</b>${esc(e.message)}`);
  }
}

function downloadCSV(rows, filename) {
  const csv = "﻿" + rows.map(r => r.map(cell => {
    const s = String(cell ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"','""')}"`;
    return s;
  }).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────
// Sheets 동기화
// ─────────────────────────────────────────────
async function triggerSheetsSync() {
  // config/sheets 는 Firestore Rules 상 관리자 인증 사용자만 read 가능 (webhookUrl·sharedSecret 보호)
  const cfg = await getDoc(doc(db, "config", "sheets"));
  const url = cfg.exists() ? cfg.data().webhookUrl : null;
  const secret = cfg.exists() ? cfg.data().sharedSecret : null;
  if (!url) {
    toast($("#ops-msg"), "danger", "<b>Sheets Webhook URL이 설정되지 않았습니다</b>apps-script/sync-to-sheets.gs 를 배포한 후 URL을 config/sheets.webhookUrl에 저장하세요.");
    return;
  }
  if (!secret) {
    toast($("#ops-msg"), "danger", "<b>Sheets 인증 토큰이 없습니다</b>Apps Script 스크립트 속성에 등록한 SHARED_SECRET 과 동일한 값을 config/sheets.sharedSecret 에 저장하세요.");
    return;
  }
  toast($("#ops-msg"), "notice", "<b>Sheets에 동기화 중…</b>");
  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ token: secret })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    if (data && data.error === "unauthorized") {
      throw new Error("인증 토큰이 일치하지 않습니다.");
    }
    toast($("#ops-msg"), "success", "<b>동기화 완료</b>Google Sheets에서 결과를 확인하세요.");
  } catch (e) {
    toast($("#ops-msg"), "danger", `<b>동기화 실패</b>${esc(e.message)}`);
  }
}

// ─────────────────────────────────────────────
// UI 바인딩
// ─────────────────────────────────────────────
function bindUI() {
  $("#login-btn").addEventListener("click", handleLogin);
  // 로그인 폼
  $("#login-btn").addEventListener("click", handleLogin);
  $("#admin-id").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#pw-input").focus(); });
  $("#pw-input").addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
  // 통일된 admin-chip 로그아웃 (다른 페이지와 동일 패턴)
  const signoutBtn = $("#admin-signout");
  if (signoutBtn) {
    signoutBtn.addEventListener("click", async () => {
      if (!confirm("관리자 로그아웃 하시겠습니까?")) return;
      signoutBtn.disabled = true;
      try { await handleLogout(); }
      finally { signoutBtn.disabled = false; }
    });
  }

  $("#auto-login").checked = localStorage.getItem(AUTO_LOGIN_KEY) === "1";
  $("#admin-id").value = localStorage.getItem(LAST_ID_KEY) || "";
  $("#emoji-picker-btn").addEventListener("click", toggleEmojiPicker);
  $("#emoji-search").addEventListener("input", (e) => renderEmojiOptions(e.target.value));
  $("#emoji-search").addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeEmojiPicker();
  });
  document.addEventListener("click", (e) => {
    const panel = $("#emoji-picker-panel");
    const button = $("#emoji-picker-btn");
    if (!panel.classList.contains("hidden") && !panel.contains(e.target) && !button.contains(e.target)) {
      closeEmojiPicker();
    }
  });
  renderEmojiOptions();

  // 관리자 본문
  $("#new-topic-btn").addEventListener("click", () => openEditModal(null));
  $("#topic-save").addEventListener("click", saveTopic);
  $("#topic-delete").addEventListener("click", deleteCurrentTopic);
  $("#export-all-btn").addEventListener("click", exportAllCSV);
  $("#sync-sheets-btn").addEventListener("click", triggerSheetsSync);
  $("#qr-download").addEventListener("click", downloadQR);
  $("#site-qr-btn").addEventListener("click", openSiteQRModal);
  document.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeModals));
}

// ─────────────────────────────────────────────
// 진입
// ─────────────────────────────────────────────
async function init() {
  bindUI();

  // 인증 상태 감지
  authUnsub = onAuthStateChanged(auth, async (user) => {
    if (user) {
      // 로그인됨 → 설정 도큐먼트 초기화 + 화면 전환
      try {
        await ensureDepartmentsConfig();
        await ensureStopwordsConfig();
      } catch (e) { console.warn("config init", e); }
      setAuthed(user);
    } else {
      setAuthed(null);
    }
  });
}

// pagehide 는 unload + bfcache 진입 양쪽 모두에 호출
window.addEventListener("pagehide", () => {
  if (topicsUnsub) topicsUnsub();
  if (authUnsub) authUnsub();
});

init();
