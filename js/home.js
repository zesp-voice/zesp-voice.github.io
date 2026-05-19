// index.html — 홈
import {
  db, collection, doc, getDoc, query, orderBy, onSnapshot
} from "./firebase-init.js";
import {
  fmtDate, esc, emojiHTML, topicClosed, ddayBadgeHTML
} from "./utils.js";

const $ = (s) => document.querySelector(s);

let unsubTopics = null;

async function loadDepartmentsConfig() {
  try {
    const snap = await getDoc(doc(db, "config", "departments"));
    if (snap.exists()) return snap.data().list || [];
  } catch (e) { console.warn("departments config load fail", e); }
  return [];
}

function renderTopicCard(t, id) {
  const closed = topicClosed(t);
  const dday = ddayBadgeHTML(t);

  return `
    <a class="topic-card ${closed ? "topic-card--closed" : ""}" href="topic.html?id=${encodeURIComponent(id)}">
      <div class="topic-card__head">
        <div class="topic-card__emoji">${emojiHTML(t.coverEmoji || "✈️")}</div>
        ${dday}
      </div>
      <h3 class="topic-card__title">${esc(t.title || "(제목 없음)")}</h3>
      <p class="topic-card__desc">${esc(t.description || "")}</p>
      <div class="topic-card__meta">
        <span>의견 <strong class="text-num">${t.commentCount ?? 0}</strong></span>
        <span>·</span>
        <span>마감 ${fmtDate(t.dueAt)}</span>
      </div>
    </a>
  `;
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

    $("#active-topics").innerHTML = active.length
      ? active.map(t => renderTopicCard(t, t.id)).join("")
      : renderEmpty("진행 중인 주제가 없습니다");

    $("#closed-topics").innerHTML = closed.length
      ? closed.map(t => renderTopicCard(t, t.id)).join("")
      : renderEmpty("지난 주제가 없습니다");

    $("#active-count").textContent = active.length ? `${active.length}개 진행 중` : "";
    $("#closed-count").textContent = closed.length ? `${closed.length}개 보관됨` : "";

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

// pagehide 는 unload + bfcache 진입 양쪽 모두에 호출
window.addEventListener("pagehide", () => {
  if (unsubTopics) unsubTopics();
});

init();
