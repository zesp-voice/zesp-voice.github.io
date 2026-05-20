// 공통 유틸

export const DEFAULT_DEPARTMENTS = [
  { name: "안전",   colorToken: "navy" },
  { name: "보안",   colorToken: "steel" },
  { name: "운송",   colorToken: "amber" },
  { name: "운항",   colorToken: "teal" },
  { name: "객실",   colorToken: "coral" },
  { name: "정비",   colorToken: "gray-dark" },
  { name: "경영",   colorToken: "plum" },
  { name: "통제",   colorToken: "indigo" },
  { name: "커머셜", colorToken: "rose" },
  { name: "IT",     colorToken: "moss" },
  { name: "기타",   colorToken: "gray" }
];

// 부문 → Extended palette hex (Chart.js용)
export const DEPT_COLOR_HEX = {
  navy: "#1B2A4E",
  teal: "#2E7E80",
  amber: "#E8A33D",
  coral: "#F26A5A",
  plum: "#5C2440",
  "gray-dark": "#30383C",
  gray: "#9EA2A1",
  steel: "#5B7C99",
  indigo: "#4C4A8F",
  rose: "#C77B8B",
  moss: "#6E8B4A"
};

// 의견 처리 상태 — 접수 대기 → 접수 완료 → 전달 완료
export const STATUS_ORDER = ['pending', 'received', 'forwarded'];
export const STATUS_LABEL = { pending: '접수 대기', received: '접수 완료', forwarded: '전달 완료' };
export const statusLabel = (s) => STATUS_LABEL[s] || '접수 대기';

// 글로벌 토큰 매핑 (이름이 변경될 수 있어 안전망)
export function deptColorOf(deptName, deptList) {
  const found = (deptList || []).find(d => d.name === deptName);
  return found?.colorToken || "gray";
}

export function colorHexOf(deptName, deptList) {
  return DEPT_COLOR_HEX[deptColorOf(deptName, deptList)] || DEPT_COLOR_HEX.gray;
}

// 마감일 비교 (자정 기준)
export function isExpired(dueAt) {
  if (!dueAt) return false;
  const due = dueAt.toDate ? dueAt.toDate() : new Date(dueAt);
  const cutoff = new Date(due);
  cutoff.setHours(23, 59, 59, 999);
  return new Date() > cutoff;
}

// D-day 계산: 양수=남은 일, 0=오늘 마감, 음수=경과
export function daysUntil(dueAt) {
  if (!dueAt) return null;
  const due = dueAt.toDate ? dueAt.toDate() : new Date(dueAt);
  const dueMid = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const diff = Math.round((dueMid - todayMid) / (24 * 3600 * 1000));
  return diff;
}

export function ddayLabel(dueAt) {
  const d = daysUntil(dueAt);
  if (d === null) return "";
  if (d > 0) return `D-${d}`;
  if (d === 0) return "오늘 마감";
  return `마감 ${-d}일 경과`;
}

export function ddayBadgeClass(dueAt) {
  const d = daysUntil(dueAt);
  if (d === null || d < 0) return "badge badge--gray";
  if (d <= 2) return "badge badge--red";      // 임박: 2일 이내
  if (d <= 7) return "badge badge--wash";     // 진행: 1주 이내
  return "badge badge--out";                  // 여유: 1주 초과 (outline)
}

// 주제 종료 여부 — status=closed 이거나 마감일 경과
export function topicClosed(t) {
  return t.status === "closed" || isExpired(t.dueAt);
}

// D-day 배지 HTML — 종료 시 닫힘 라벨(페이지별 상이)을 인자로 받음
export function ddayBadgeHTML(t, closedLabel = "종료") {
  if (topicClosed(t)) return `<span class="badge badge--gray">${esc(closedLabel)}</span>`;
  return `<span class="${ddayBadgeClass(t.dueAt)}">${esc(ddayLabel(t.dueAt))}</span>`;
}

// 날짜 포맷
export function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
}
export function fmtDateTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${fmtDate(d)} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// 상대 시간
export function fmtRelative(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  if (diff < 7*86400) return `${Math.floor(diff/86400)}일 전`;
  return fmtDate(d);
}

// 안전 escape
export function esc(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

const FLAG_CODE_BY_EMOJI = {
  "🇯🇵": "jp",
  "🇹🇼": "tw",
  "🇭🇰": "hk",
  "🇲🇴": "mo",
  "🇨🇳": "cn",
  "🇲🇳": "mn",
  "🇻🇳": "vn",
  "🇹🇭": "th",
  "🇵🇭": "ph",
  "🇲🇾": "my",
  "🇮🇩": "id",
  "🇸🇬": "sg",
  "🇰🇷": "kr",
  "🇺🇸": "us",
  "🇬🇺": "gu",
  "🇲🇵": "mp"
};

export function emojiHTML(emoji, className = "") {
  const value = emoji || "✈️";
  const code = FLAG_CODE_BY_EMOJI[value];
  if (!code) return esc(value);
  const cls = className ? ` ${esc(className)}` : "";
  return `<img class="flag-emoji${cls}" src="https://flagcdn.com/48x36/${code}.png" alt="${esc(value)}" loading="lazy">`;
}

// SHA-256 (Web Crypto)
export async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,"0")).join("");
}

// 일별 ip-less hash (브라우저 지문 일부 + 날짜)
export async function dailyBrowserHash() {
  const today = new Date().toISOString().slice(0,10);
  const fp = `${navigator.userAgent}|${screen.width}x${screen.height}|${navigator.language}|${today}`;
  return (await sha256(fp)).slice(0, 16);
}

// 쿼리스트링 파서
export function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

// 토스트 (간단)
export function toast(target, type, html) {
  if (!target) return;
  target.className = type === "danger"
    ? "alert alert--danger"
    : type === "success" ? "alert alert--success" : "alert alert--notice";
  target.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M12 11v5"/></svg><div>${html}</div>`;
  target.classList.remove("hidden");
}

// 부문 색 토큰을 chip HTML로
export function deptChipHTML(deptName, deptList) {
  const color = deptColorOf(deptName, deptList);
  return `<span class="dept" data-color="${color}">${esc(deptName || "기타")}</span>`;
}

// 주제 카드 HTML — 홈·주제 페이지 공용
export function renderTopicCard(t, id) {
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
