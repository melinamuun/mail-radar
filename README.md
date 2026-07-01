# 메일 레이더 (mail-radar)

매주 월·금 06:00(KST), 최근 수신 메일을 자동 수집·분류해 트리아지 대시보드를 만들고 본인 이메일로 발송하는 개인 자동화 시스템. 노이즈에 묻힌 "확인필요" 메일을 레이더처럼 위로 끌어올린다.

해결하는 문제: 수신함의 약 80%가 뉴스레터·광고. "처리할 메일"이 노이즈에 묻힘 → 주 2회 정해진 시각에 확인필요 메일만 위로 끌어올린 요약을 받아 빠르게 트리아지.

---

## 구조

```
mail-radar/
├─ README.md                     이 문서
├─ docs/
│  ├─ SRS.md                     요구사항 명세 (FR/NFR + 인수조건) — 단일 진실 공급원
│  ├─ 아키텍처.md                 5노드 데이터 흐름 + Compute Window 순서도
│  ├─ 합류명세서.md               Given-When-Then 인수조건 (정상·예외·롤백) + 한계표
│  ├─ UI-UX-화면설계서.md          [프론트 F1] 대시보드 디자인 토큰·레이아웃·Breakpoint Map
│  ├─ 상태-이벤트-흐름도.md         [프론트 F2] 클라이언트 상태·이벤트(위임)·렌더 + XSS
│  ├─ 배포가이드.md                 n8n 임포트·OAuth·Error Trigger·수동 테스트 절차
│  └─ 수신_메일_대시보드_프로젝트_프롬프트.md   킥오프 문서(배경·결정)
├─ n8n/
│  ├─ inbox-dashboard-n8n-workflow.json   본체 워크플로 (5노드)
│  └─ error-handler-workflow.json         에러 알림 워크플로 (NFR-8)
└─ tests/
   └─ classify.test.js              분류 회귀 테스트 (NFR-7)
```

## 아키텍처 요약

```
[Schedule 0 6 * * 1,5 · Asia/Seoul]
  → [Compute Window] 요일별 시간 창(epoch) 계산
  → [Gmail 수신 조회] in:inbox + receivedAfter/Before
  → [Build Dashboard] 레코드화·분류·정렬 → 인터랙티브 HTML(첨부) + 정적 요약(본문)
  → [Gmail 발송(본인)]
```

상세는 [docs/아키텍처.md](docs/아키텍처.md).

## 현재 상태

| 항목 | 상태 |
|---|---|
| 설계 문서(SRS v1.2·아키텍처·합류명세서·F1·F2·배포가이드) | 완료 |
| 코드 마감(L-5 XSS·L-6 분류·이벤트 위임·회귀 테스트) | 완료 |
| 배포 산출물(본체 + 에러 알림 워크플로) | 준비 완료 |
| 실제 배포(임포트·자격증명·Active) | **본인 수동 단계** — 배포가이드 참조 |

## 배포 (요약)

1. 본체 `n8n/inbox-dashboard-n8n-workflow.json` 임포트
2. Gmail OAuth2 자격증명 — 조회·발송 2노드(동일 자격증명)
3. Compute Window 노드의 `selfEmail` 확인
4. 에러 알림 `n8n/error-handler-workflow.json` 임포트 → 본체 Settings의 Error Workflow로 지정(NFR-8)
5. 수동 Execute로 테스트(본문 표·첨부 HTML·XSS·0건·발신 제외)
6. 타임존 `Asia/Seoul` → Active ON, 호스트 상시 가동(NAS 권장)

**상세 절차·체크리스트는 [docs/배포가이드.md](docs/배포가이드.md).** 배포 전 검증 위험은 [docs/합류명세서.md](docs/합류명세서.md) AC-3.2(0건)·AC-8.1(본문 HTML) 참고.

## 테스트

```
node tests/classify.test.js   # 분류 규칙 회귀 (18케이스)
node tests/extract.test.js     # Build Dashboard 필드 추출 회귀 (n8n Gmail 형식, 11케이스)
```

두 테스트 모두 워크플로 JSON에서 실제 코드를 추출해 검증하므로 로직 드리프트가 없다(NFR-7). `extract.test.js`는 n8n Gmail 노드의 실제 출력 형식(mailparser: `from:{value:[{address,name}]}`·`subject`·`date`·`text`)을 픽스처로 고정해, 필드 매핑 버그(L-7) 재발을 막는다. 의존성 없음(Node 내장만).

## 환경·제약

- 실행기: n8n (Python·venv 의존 없음 → `requirements.txt` 해당 없음)
- 알림 채널: 이메일(본인 발송), 기본 수신 `soobin7612@gmail.com`
- 호스팅: Synology NAS(Docker, 상시) 권장
- 확정 사양(SRS)을 임의로 바꾸지 않는다. 변경 필요 시 SRS 버전업 후 반영.

## 백로그

1. n8n 실제 배포·활성화 (우선)
2. 분류를 Gemini 노드로 정밀화
3. Telegram(UniAssist) 알림 이중화
4. NAS 정적 호스팅 + Tailscale 링크 발송
5. 운영 안정화(실패 알림·중복 발신자 압축)
