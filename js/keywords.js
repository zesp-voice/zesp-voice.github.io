// 한국어 키워드 추출 (클라이언트 사이드, 형태소 분석기 미사용)
// 정확도: 명사 위주 어림 추출. 빈도가 충분히 쌓이면 노이즈가 평균에 묻힘.

import { STOPWORDS_KO, stripSuffix } from "./stopwords-ko.js";

// 토큰화: 한글 2자 이상 시퀀스 추출
const TOKEN_RE = /[가-힣]{2,}/g;

export function tokenize(text) {
  const matches = String(text || "").match(TOKEN_RE) || [];
  const out = [];
  for (const m of matches) {
    const norm = stripSuffix(m);
    if (norm.length < 2) continue;
    if (STOPWORDS_KO.has(norm)) continue;
    out.push(norm);
  }
  return out;
}

// 코멘트 배열 → 키워드 빈도 Map
export function countKeywords(comments, extraStop = []) {
  const stop = new Set(extraStop);
  const counter = new Map();
  for (const c of comments || []) {
    const seen = new Set(); // 한 댓글 내 중복 카운트 방지 → 다양성 가중
    for (const tok of tokenize(c.content)) {
      if (stop.has(tok)) continue;
      if (seen.has(tok)) continue;
      seen.add(tok);
      counter.set(tok, (counter.get(tok) || 0) + 1);
    }
  }
  return counter;
}

// 상위 N + 임계값 필터
export function topKeywords(counter, { topN = 50, minCount = 3 } = {}) {
  return [...counter.entries()]
    .filter(([_, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
}

// WordCloud2.js 가중치 ([단어, 가중치])
export function toWordCloudList(topList) {
  if (!topList.length) return [];
  const maxN = topList[0][1];
  return topList.map(([w, n]) => [w, 10 + (60 * Math.sqrt(n / maxN))]);
}

// 부문별 키워드 분리 집계
export function countByDept(comments) {
  const byDept = new Map();
  for (const c of comments || []) {
    const dept = c.department || "기타";
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept).push(c);
  }
  const result = {};
  for (const [dept, list] of byDept) {
    result[dept] = topKeywords(countKeywords(list), { topN: 20, minCount: 2 });
  }
  return result;
}
