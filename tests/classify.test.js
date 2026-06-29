/**
 * classify() 회귀 테스트 하니스 — SRS NFR-7
 *
 * 워크플로 JSON에서 실제 classify()를 추출해 픽스처로 검증한다.
 * 별도 사본을 두지 않으므로 로직 드리프트가 없다(AC-NFR7.2).
 * 분류 규칙(rubric)을 바꾸면 이 테스트로 회귀를 잡는다(AC-NFR7.1).
 *
 * 실행:  node tests/classify.test.js
 * 의존성: 없음 (Node 내장만)
 */
'use strict';
const fs = require('fs');
const path = require('path');

// --- 1. 워크플로에서 classify() 추출 ---
const WF = path.join(__dirname, '..', 'n8n', 'inbox-dashboard-n8n-workflow.json');
const j = JSON.parse(fs.readFileSync(WF, 'utf8'));
const code = j.nodes.find(n => n.name === 'Build Dashboard').parameters.jsCode;
const s = code.indexOf('function classify');
const e = code.indexOf('const recs', s);
if (s < 0 || e < 0) { console.error('✗ classify() 추출 실패 — 워크플로 구조 변경 확인'); process.exit(1); }
const classify = eval('(' + code.slice(s, e).trim() + ')');

// --- 2. 픽스처: {desc, name, email, subj, expect:{cat,prio}, ac} ---
// expect는 "의도된 분류"(SRS §6 rubric). 규칙 변경 시 여기 기대값을 함께 갱신.
const cases = [
  // security (최우선 검사)
  { ac: 'AC-5.1', desc: '구글 계정 발신', name: 'Google', email: 'no-reply@accounts.google.com', subj: '계정 활동', expect: { cat: 'security', prio: 'low' } },
  { ac: 'AC-5.1', desc: '보안 알림 제목', name: '서비스', email: 'alert@svc.com', subj: '보안 알림: 새 기기', expect: { cat: 'security', prio: 'low' } },
  { ac: 'AC-5.1', desc: '로그인 알림(한글)', name: 'Svc', email: 'a@b.com', subj: '새 로그인이 감지됨', expect: { cat: 'security', prio: 'low' } },
  // study
  { ac: 'AC-5.1', desc: 'Coursera 발신', name: 'Coursera', email: 'no-reply@coursera.org', subj: '새 강좌', expect: { cat: 'study', prio: 'mid' } },
  { ac: 'AC-5.1', desc: '강의 제목', name: '교수', email: 'prof@uni.ac.kr', subj: '3주차 강의 자료', expect: { cat: 'study', prio: 'mid' } },
  { ac: 'AC-5.1', desc: 'Webinar 대소문자', name: 'Org', email: 'x@y.com', subj: 'Join our WEBINAR', expect: { cat: 'study', prio: 'mid' } },
  // outlier
  { ac: 'AC-5.1', desc: '채용 제목', name: 'HR', email: 'hr@corp.com', subj: '채용 제안드립니다', expect: { cat: 'outlier', prio: 'low' } },
  { ac: 'AC-5.1', desc: 'recruit(영문)', name: 'Recruiter', email: 'jobs@corp.com', subj: 'Exciting recruit opportunity', expect: { cat: 'outlier', prio: 'low' } },
  // account
  { ac: 'AC-5.1', desc: '개인정보 처리방침', name: 'Svc', email: 'info@svc.com', subj: '개인정보 처리방침 개정 안내', expect: { cat: 'account', prio: 'mid' } },
  { ac: 'AC-5.1', desc: 'Privacy policy(영문)', name: 'Svc', email: 'info@svc.com', subj: 'Updated privacy policy', expect: { cat: 'account', prio: 'mid' } },
  // news
  { ac: 'AC-5.1', desc: 'no-reply 발신', name: 'Brand', email: 'no-reply@brand.com', subj: '주간 소식', expect: { cat: 'news', prio: 'low' } },
  { ac: 'AC-5.1', desc: 'newsletter 제목', name: 'Letter', email: 'hi@letter.com', subj: 'Weekly Newsletter #12', expect: { cat: 'news', prio: 'low' } },
  { ac: 'AC-5.1', desc: '광고(한글)', name: 'Shop', email: 'shop@mall.com', subj: '[광고] 여름 세일', expect: { cat: 'news', prio: 'low' } },
  // action 격상 (노이즈 미적중)
  { ac: 'AC-5.2', desc: '개인 메일(키워드 무) → 격상', name: '김동료', email: 'colleague@gmail.com', subj: '내일 회의 가능하세요?', expect: { cat: 'action', prio: 'high' } },
  { ac: 'AC-5.3', desc: 'CI 실패(키워드 무) → 격상', name: 'GitHub', email: 'notifications@github.com', subj: 'Run failed: build #42', expect: { cat: 'action', prio: 'high' } },
  // 우선순위(검사 순서) 잠금: security 키워드 + news 키워드 동시 → security 우선
  { ac: 'AC-5.x', desc: '보안+뉴스 동시 → security 우선', name: 'G', email: 'no-reply@accounts.google.com', subj: '보안 알림 newsletter', expect: { cat: 'security', prio: 'low' } },
  // L-6 회귀 잠금: 'mission' 제거로 submission/commission 오매칭 없음
  { ac: 'L-6', desc: "'submission' → outlier 오매칭 없음(격상)", name: '지원자', email: 'a@b.com', subj: 'Your submission was received', expect: { cat: 'action', prio: 'high' } },
  { ac: 'L-6', desc: "'commission' → outlier 오매칭 없음(격상)", name: '동료', email: 'a@b.com', subj: 'commission report draft', expect: { cat: 'action', prio: 'high' } },
];

// --- 3. 실행 ---
let fail = 0;
for (const c of cases) {
  const got = classify(c.name, c.email, c.subj);
  const ok = got.cat === c.expect.cat && got.prio === c.expect.prio;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} [${c.ac}] ${c.desc} → ${got.cat}/${got.prio}` +
    (ok ? '' : `  (기대: ${c.expect.cat}/${c.expect.prio})`));
}

// --- 4. 결과 ---
console.log(`\n${cases.length - fail}/${cases.length} 통과`);
if (fail) { console.error(`✗ 회귀 실패 ${fail}건`); process.exit(1); }
console.log('✓ 전체 통과');
