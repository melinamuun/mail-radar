/**
 * Build Dashboard 필드 추출 회귀 테스트
 *
 * n8n Gmail 노드(simple=false, mailparser)의 **실제 출력 형식**으로 픽스처를 구성해
 * Build Dashboard 코드를 실행하고, from/subject/분류/발신제외/XSS를 검증한다.
 *
 * 배경: 초기 코드가 Gmail API 원본 형식(payload.headers/snippet/internalDate)을 기대했으나,
 * n8n은 { from:{value:[{address,name}],text}, subject, date, text, labelIds } 형식을 준다.
 * 이 불일치로 from/subject가 빈 문자열이 되어 전부 action으로 분류되는 버그가 있었다.
 * 이 테스트는 그 계약(n8n 형식)을 고정해 재발을 막는다.
 *
 * 실행:  node tests/extract.test.js   |   의존성 없음
 */
'use strict';
const fs = require('fs');
const path = require('path');

const WF = path.join(__dirname, '..', 'n8n', 'inbox-dashboard-n8n-workflow.json');
const wf = JSON.parse(fs.readFileSync(WF, 'utf8'));
const code = wf.nodes.find(n => n.name === 'Build Dashboard').parameters.jsCode;

// n8n Gmail(mailparser) 형식 헬퍼
const addr = (name, address) => ({ value: [{ address, name }], text: `"${name}" <${address}>` });
const items = [
  { json: { labelIds: ['INBOX', 'UNREAD'], from: addr('DAILY_BYTE', 'byteteam365@mydailybyte.com'), subject: '(광고) 하반기 변화 10가지', date: '2026-06-30T20:32:17.000Z', text: '본문 내용' } },
  { json: { labelIds: ['INBOX', 'UNREAD'], from: addr('Coursera', 'Coursera@m.learn.coursera.org'), subject: 'Start Writing Prompts', date: '2026-06-30T19:37:05.000Z', text: '강좌 안내' } },
  { json: { labelIds: ['INBOX'], from: addr('Google', 'no-reply@accounts.google.com'), subject: '보안 알림', date: '2026-06-30T10:00:00.000Z', text: '새 로그인' } },
  { json: { labelIds: ['INBOX', 'UNREAD'], from: addr('김동료', 'colleague@gmail.com'), subject: '내일 회의 가능하세요?', date: '2026-06-30T09:00:00.000Z', text: '3시 어때요' } },
  { json: { labelIds: ['INBOX'], from: addr('Attacker', 'evil@x.com'), subject: '<img src=x onerror=alert(1)>', date: '2026-06-30T08:00:00.000Z', text: '<script>bad()</script>' } },
  { json: { labelIds: ['SENT'], from: addr('나', 'me@gmail.com'), subject: '내가 보낸 메일', date: '2026-06-30T07:00:00.000Z', text: '발신' } },
];
const win = { rangeLabel: '6.30 – 7.1 KST', runType: '테스트', runDateLabel: '7.1 (수)', selfEmail: 'soobin7612@gmail.com', end: 1751353200 };

const $ = () => ({ first: () => ({ json: win }) });
const $input = { all: () => items };
const out = new Function('$', '$input', code)($, $input)[0];
const html = Buffer.from(out.binary.data.data, 'base64').toString('utf8');
const mails = JSON.parse(html.match(/const MAILS = (\[.*?\]);/s)[1]);
const byCat = c => mails.filter(m => m.cat === c);

let fail = 0;
const check = (name, cond) => { const ok = !!cond; if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${name}`); };

check('SENT 제외 (5건만 남음)', mails.length === 5);
check('from 전부 채워짐', mails.every(m => m.from));
check('subject 전부 채워짐', mails.every(m => m.subj));
check("발신자명 파싱('DAILY_BYTE')", mails.some(m => m.from === 'DAILY_BYTE'));
check("이메일 파싱(coursera 주소)", mails.some(m => m.email.includes('coursera')));
check('(광고) → news', byCat('news').some(m => m.subj.includes('광고')));
check('Coursera → study', byCat('study').some(m => m.email.includes('coursera')));
check('보안 알림 → security', byCat('security').length >= 1);
check('개인 메일 → action 격상', byCat('action').some(m => m.from === '김동료'));
check('전부 action 아님(분류 다양)', new Set(mails.map(m => m.cat)).size > 1);
check('XSS 이스케이프(&lt;img 有, onerror 실행형 無)', html.includes('&lt;img') && !/<img[^>]*onerror=/i.test(html));

console.log(`\n${mails.length - 0}건 처리 · ${11 - fail}/11 검증 통과`);
if (fail) { console.error(`✗ 실패 ${fail}건`); process.exit(1); }
console.log('✓ 전체 통과');
