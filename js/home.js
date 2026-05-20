// index.html — 홈
import {
  db, auth, collection, doc, getDoc, query, orderBy, onSnapshot,
  onAuthStateChanged, signOut
} from "./firebase-init.js";
import {
  topicClosed, renderTopicCard
} from "./utils.js";

const $ = (s) => document.querySelector(s);

let unsubTopics = null;
let unsubAuth = null;

async function loadDepartmentsConfig() {
  try {
    const snap = await getDoc(doc(db, "config", "departments"));
    if (snap.exists()) return snap.data().list || [];
  } catch (e) { console.warn("departments config load fail", e); }
  return [];
}

function renderEmpty(label) {
  return `
    <div class="empty" style="grid-column: 1 / -1;">
      <div class="empty__title">${label}</div>
      <div>관리자 페이지에서 새 주제를 등록할 수 있습니다.</div>
    </div>
  `;
}

async function init() {
  await loadDepartmentsConfig(); // warm cache

  const topicsCol = collection(db, "topics");
  // 정렬: 진행 중은 마감 빠른 순, 종료는 최근 마감 순으로
  const qAll = query(topicsCol, orderBy("dueAt", "desc"));

  unsubTopics = onSnapshot(qAll, (snap) => {
    const active = [], closed = [];
    let totalComments = 0;

    snap.forEach((d) => {
      const t = d.data();
      const id = d.id;
      const item = { id, ...t };
      if (topicClosed(t)) closed.push(item);
      else active.push(item);
      totalComments += (t.commentCount || 0);
    });

    // 진행 중: 마감 빠른 순
    active.sort((a, b) => {
      const ad = a.dueAt?.toMillis ? a.dueAt.toMillis() : 0;
      const bd = b.dueAt?.toMillis ? b.dueAt.toMillis() : 0;
      return ad - bd;
    });

    // 홈에는 각 최근 3개만 — 전체는 주제 페이지에서
    $("#active-topics").innerHTML = active.length
      ? active.slice(0, 3).map(t => renderTopicCard(t, t.id)).join("")
      : renderEmpty("진행 중인 주제가 없습니다");

    $("#closed-topics").innerHTML = closed.length
      ? closed.slice(0, 3).map(t => renderTopicCard(t, t.id)).join("")
      : renderEmpty("지난 주제가 없습니다");

    $("#active-count").textContent = active.length ? `${active.length}개 진행 중` : "";
    $("#closed-count").textContent = closed.length ? `${closed.length}개 보관됨` : "";

    // 3개 초과 섹션에만 헤더 '전체보기' 링크 노출 (주제 페이지로 이동)
    $("#active-more")?.classList.toggle("hidden", active.length <= 3);
    $("#closed-more")?.classList.toggle("hidden", closed.length <= 3);

    $("#stat-active").textContent = active.length;
    $("#stat-comments").textContent = totalComments.toLocaleString();
  }, (err) => {
    console.error("topics listen error", err);
    $("#active-topics").innerHTML = `
      <div class="alert alert--danger" style="grid-column: 1 / -1;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 10 17H2z"/><path d="M12 10v4M12 17v.01"/></svg>
        <div><b>주제를 불러올 수 없습니다</b>Firebase 구성을 확인해주세요.</div>
      </div>
    `;
  });
}

// ── 관리자 상태 chip + 로그아웃 ────────────────────────────
function mountAdminChip() {
  const chip = $("#admin-chip");
  const navAdmin = $("#nav-admin");
  const signoutBtn = $("#admin-signout");
  if (!chip || !signoutBtn) return;

  const chipLabel = document.getElementById("admin-chip-label");
  unsubAuth = onAuthStateChanged(auth, (user) => {
    if (user) {
      chip.classList.remove("hidden");
      if (navAdmin) navAdmin.classList.add("hidden");  // 로그인 상태면 '관리자' 링크 숨김
      if (chipLabel) chipLabel.textContent = user.email ? user.email.split("@")[0] : "관리자";
    } else {
      chip.classList.add("hidden");
      if (navAdmin) navAdmin.classList.remove("hidden");
      if (chipLabel) chipLabel.textContent = "관리자";
    }
  });

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

mountAdminChip();

// pagehide 는 unload + bfcache 진입 양쪽 모두에 호출
window.addEventListener("pagehide", () => {
  if (unsubTopics) unsubTopics();
  if (unsubAuth) unsubAuth();
});

init();
