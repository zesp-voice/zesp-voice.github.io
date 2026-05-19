// admin.html — 관리자 (Firebase Auth 이메일/비밀번호)
import {
  db, auth, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp, Timestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "./firebase-init.js";
import {
  DEFAULT_DEPARTMENTS, ddayLabel, ddayBadgeClass, fmtDate, fmtDateTime,
  isExpired, esc, toast
} from "./utils.js";
import { countKeywords, topKeywords } from "./keywords.js";

const $ = (s) => document.querySelector(s);

const EMAIL_DOMAIN = "@eastarjet.com";

let departments = DEFAULT_DEPARTMENTS;
let editingId = null;
let currentQRTopicId = null;
let topicsUnsub = null;
let authUnsub = null;

// ─────────────────────────────────────────────
// 이메일 보완: 사번/아이디만 입력 시 @eastarjet.com 자동 추가
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
  const email = normalizeEmail($("#email-input").value);
  const pw = $("#pw-input").value;
  if (!email || !pw) {
    showAuthError("이메일과 비밀번호를 입력해주세요.");
    return;
  }
  $("#login-btn").disabled = true;
  $("#login-btn").textContent = "로그인 중…";
  try {
    await signInWithEmailAndPassword(auth, email, pw);
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
    "auth/invalid-email":       "이메일 형식이 올바르지 않습니다.",
    "auth/user-disabled":       "이 계정은 비활성화되어 있습니다.",
    "auth/user-not-found":      "등록되지 않은 계정입니다. Firebase 콘솔에서 사용자를 추가하세요.",
    "auth/wrong-password":      "비밀번호가 일치하지 않습니다.",
    "auth/invalid-credential":  "이메일 또는 비밀번호가 올바르지 않습니다.",
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
  if (user) {
    $("#gate").classList.add("hidden");
    $("#admin-main").classList.remove("hidden");
    $("#logout-link").classList.remove("hidden");
    $("#current-user").classList.remove("hidden");
    $("#current-user").textContent = user.email;
    listenTopics();
  } else {
    $("#gate").classList.remove("hidden");
    $("#admin-main").classList.add("hidden");
    $("#logout-link").classList.add("hidden");
    $("#current-user").classList.add("hidden");
    $("#current-user").textContent = "";
    $("#auth-err").classList.add("hidden");
    if (topicsUnsub) { topicsUnsub(); topicsUnsub = null; }
  }
}

// ─────────────────────────────────────────────
// 주제 리스트
// ─────────────────────────────────────────────
function topicRowHTML(t, id) {
  const closed = t.status === "closed" || isExpired(t.dueAt);
  const dday = closed
    ? `<span class="badge badge--gray">종료</span>`
    : `<span class="${ddayBadgeClass(t.dueAt)}">${esc(ddayLabel(t.dueAt))}</span>`;

  return `
    <div class="chart-card" data-id="${id}">
      <div class="row row--between" style="flex-wrap: wrap; gap: var(--sp-3);">
        <div style="flex: 1; min-width: 240px;">
          <div class="row" style="gap: var(--sp-2);">
            <span style="font-size: 22px;">${esc(t.coverEmoji || "✈️")}</span>
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
      $("#topic-emoji").value = t.coverEmoji || "✈️";
      $("#topic-title").value = t.title || "";
      $("#topic-desc").value = t.description || "";
      const due = t.dueAt?.toDate ? t.dueAt.toDate() : null;
      $("#topic-due").value = due ? due.toISOString().slice(0,10) : "";
      $("#topic-status").value = t.status || "active";
    });
  } else {
    $("#topic-emoji").value = "✈️";
    $("#topic-title").value = "";
    $("#topic-desc").value = "";
    const d = new Date(); d.setDate(d.getDate() + 14);
    $("#topic-due").value = d.toISOString().slice(0,10);
    $("#topic-status").value = "active";
  }
  $("#modal-err").classList.add("hidden");
  $("#topic-modal").classList.remove("hidden");
}

function closeModals() {
  $("#topic-modal").classList.add("hidden");
  $("#qr-modal").classList.add("hidden");
  editingId = null;
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
function openQRModal(id) {
  currentQRTopicId = id;
  const base = location.href.replace(/\/admin\.html.*$/, "/");
  const url = `${base}topic.html?id=${encodeURIComponent(id)}`;
  $("#qr-url").textContent = url;
  $("#qr-target").innerHTML = "";

  if (typeof QRCode !== "undefined") {
    new QRCode($("#qr-target"), {
      text: url, width: 256, height: 256,
      colorDark: "#D20015", colorLight: "#FFFFFF",
      correctLevel: QRCode.CorrectLevel.M
    });
  }
  $("#qr-modal").classList.remove("hidden");
}

function downloadQR() {
  const img = $("#qr-target img") || $("#qr-target canvas");
  if (!img) return;
  const dataUrl = img.toDataURL ? img.toDataURL("image/png") : img.src;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `eastar-changemgmt-${currentQRTopicId}.png`;
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
    return { id: d.id, ...pub, employeeId: priv.employeeId || "", ipHash: priv.ipHash || "" };
  });
}

async function exportTopicCSV(topicId) {
  toast($("#ops-msg"), "notice", "<b>CSV 내보내는 중…</b>잠시만 기다려주세요.");
  try {
    const tSnap = await getDoc(doc(db, "topics", topicId));
    const t = tSnap.data() || {};
    const comments = await fetchAllCommentsOf(topicId);
    const rows = [["주제ID","주제","본부","사번","의견","작성시각","주요키워드"]];
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
    const rows = [["주제ID","주제","상태","마감일","본부","사번","의견","작성시각","주요키워드"]];
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
  // 로그인 폼
  $("#login-btn").addEventListener("click", handleLogin);
  $("#email-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#pw-input").focus(); });
  $("#pw-input").addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
  $("#logout-link").addEventListener("click", (e) => { e.preventDefault(); handleLogout(); });

  // 이메일에 @ 들어가면 suffix 숨김
  const emailInput = $("#email-input");
  const suffix = $("#email-suffix");
  emailInput.addEventListener("input", () => {
    suffix.style.display = emailInput.value.includes("@") ? "none" : "";
  });

  // 관리자 본문
  $("#new-topic-btn").addEventListener("click", () => openEditModal(null));
  $("#topic-save").addEventListener("click", saveTopic);
  $("#topic-delete").addEventListener("click", deleteCurrentTopic);
  $("#export-all-btn").addEventListener("click", exportAllCSV);
  $("#sync-sheets-btn").addEventListener("click", triggerSheetsSync);
  $("#qr-download").addEventListener("click", downloadQR);
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
