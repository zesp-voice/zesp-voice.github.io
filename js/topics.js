// topics.html — 전체 주제 목록
import {
  db, auth, collection, query, orderBy, onSnapshot,
  onAuthStateChanged, signOut
} from "./firebase-init.js";
import { topicClosed, renderTopicCard } from "./utils.js";

const $ = (s) => document.querySelector(s);

let unsubTopics = null;
let unsubAuth = null;

function renderEmpty(label) {
  return `
    <div class="empty" style="grid-column: 1 / -1;">
      <div class="empty__title">${label}</div>
      <div>관리자 페이지에서 새 주제를 등록할 수 있습니다.</div>
    </div>
  `;
}

function init() {
  // dueAt 기준 내림차순 — 진행 중은 아래에서 다시 마감 빠른 순으로 정렬
  const qAll = query(collection(db, "topics"), orderBy("dueAt", "desc"));

  unsubTopics = onSnapshot(qAll, (snap) => {
    const active = [], closed = [];
    snap.forEach((d) => {
      const t = d.data();
      const item = { id: d.id, ...t };
      if (topicClosed(t)) closed.push(item);
      else active.push(item);
    });

    // 진행 중: 마감 빠른 순
    active.sort((a, b) => {
      const ad = a.dueAt?.toMillis ? a.dueAt.toMillis() : 0;
      const bd = b.dueAt?.toMillis ? b.dueAt.toMillis() : 0;
      return ad - bd;
    });

    $("#active-topics").innerHTML = active.length
      ? active.map(t => renderTopicCard(t, t.id)).join("")
      : renderEmpty("진행 중인 주제가 없습니다");

    $("#closed-topics").innerHTML = closed.length
      ? closed.map(t => renderTopicCard(t, t.id)).join("")
      : renderEmpty("지난 주제가 없습니다");

    $("#active-count").textContent = active.length ? `${active.length}개 진행 중` : "";
    $("#closed-count").textContent = closed.length ? `${closed.length}개 보관됨` : "";
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

// ── 관리자 상태 chip + 로그아웃 (topbar 공통) ──────────────
function mountAdminChip() {
  const chip = $("#admin-chip");
  const navAdmin = $("#nav-admin");
  const signoutBtn = $("#admin-signout");
  if (!chip || !signoutBtn) return;

  const chipLabel = document.getElementById("admin-chip-label");
  unsubAuth = onAuthStateChanged(auth, (user) => {
    if (user) {
      chip.classList.remove("hidden");
      if (navAdmin) navAdmin.classList.add("hidden");
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
