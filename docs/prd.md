# PRD — Argos

**문서 버전**: 0.1  
**작성일**: 2026-04-14  
**상태**: Draft  

---

## 1. 개요

### 제품 한 줄 정의
Argos는 Claude Code를 사용하는 개발팀이 팀 전체의 AI 사용 패턴을 추적하고 분석할 수 있는 오픈소스 옵저버빌리티 도구다.

### 배경 및 문제 정의
Claude Code를 적극적으로 사용하는 AI-native 팀에는 다음과 같은 문제가 존재한다.

1. **가시성 부재**: 팀원 각자가 Claude Code를 얼마나, 어떤 방식으로 사용하는지 팀 레벨에서 파악할 방법이 없다.
2. **Skill/Agent 활용률 미지**: 팀이 구축해둔 skill과 subagent가 실제로 잘 활용되고 있는지 알 수 없다. 쓰이지 않는 skill은 유지보수 비용만 발생시킨다.
3. **토큰 비용 블랙박스**: 팀 전체의 AI 사용에 따른 토큰 소모량과 추정 비용을 집계할 수단이 없다.
4. **컨텍스트 관리 부재**: 어떤 세션에서 어떤 도구들이 호출되었는지 기록이 남지 않아 팀의 AI 활용 패턴을 개선하기 어렵다.

### 해결책
Argos는 Claude Code의 hooks 시스템을 활용해 모든 tool 호출 이벤트를 수집하고, 팀 전체의 활동을 웹 대시보드에서 시각화한다. 설치는 프로젝트 저장소에 `argos init`을 한 번 실행하는 것으로 완료되며, 이후 해당 저장소를 clone하는 팀원은 `argos login`만으로 자동으로 트래킹에 합류된다.

---

## 2. 목표

### MVP 목표
- 팀 전체의 Claude Code 사용 이벤트(tool 호출, skill 호출, subagent 호출)를 수집하는 파이프라인을 구축한다.
- 토큰 소모량 및 추정 비용을 사용자/프로젝트 단위로 집계한다.
- skill/subagent의 호출 빈도를 추적해 활용되지 않는 항목을 식별한다.
- 누구나 자신의 인프라에 배포해 사용할 수 있도록 오픈소스로 공개한다.

### 성공 지표
Argos는 현재 오픈소스로서만 배포되므로, 비즈니스 지표 대신 아래 기술적/실용적 지표를 성공 기준으로 삼는다.

| 지표 | 목표 |
|---|---|
| hook 이벤트 수집 성공률 | ≥ 99% (네트워크 장애 제외) |
| hook 처리 시간 (p99) | ≤ 1,000ms (Claude Code UX에 영향 없음) |
| argos init → 첫 이벤트 수집까지 소요 시간 | ≤ 5분 |
| 대시보드 데이터 갱신 지연 | ≤ 5초 (polling 기반) |

---

## 3. 사용자 및 페르소나

### Primary User: AI-Native 팀 리드
- Claude Code를 팀의 주요 개발 도구로 채택한 개발팀의 리더
- 팀의 AI 사용 패턴을 이해하고, skill/agent 라이브러리가 실제로 잘 활용되는지 확인하고 싶다
- 토큰 소모량을 팀원별로 파악해 AI 활용을 코칭하고 싶다

### Secondary User: 개발팀 팀원
- Claude Code를 일상적으로 사용하는 개발자
- `argos login` 한 번으로 설정이 완료되어야 하며, 이후 별도 행동이 필요하지 않아야 한다
- 자신의 사용 패턴을 대시보드에서 확인할 수 있다

### Tertiary User: 오픈소스 기여자 / 셀프호스팅 사용자
- Argos를 자신의 인프라에 배포해 사용하고 싶은 팀
- Docker Compose 또는 Railway/Supabase 조합으로 배포 가능해야 한다

---

## 4. 핵심 기능 (MVP 스코프)

### 4.1 CLI (`argos-ai`)

#### `argos` (메인 커맨드)
컨텍스트를 감지해 필요한 작업을 자동으로 수행하는 만능 진입점이다. 사용자는 상황에 따라 다른 커맨드를 외울 필요 없이 `argos`만 실행하면 된다.

감지 로직:

| 상태 | 동작 |
|---|---|
| 로그인 X + `project.json` X | 이메일/비밀번호 로그인(또는 회원가입) → org 생성 → 프로젝트 생성 → hook 주입 |
| 로그인 X + `project.json` O | 이메일/비밀번호 로그인(또는 회원가입) → org 자동 합류 |
| 로그인 O + `project.json` X | 프로젝트 생성 → hook 주입 |
| 로그인 O + `project.json` O + org 미합류 | org 자동 합류 |
| 모두 완료 | 현재 상태 출력 (status) |

- `--api-url` 플래그로 셀프호스팅 인스턴스 지정 가능.
- 기존 hook 설정 보존 (멱등성 보장).
- `.argos/project.json`은 git commit 대상이다.

#### `argos hook` (internal)
- Claude Code hooks에 의해 자동으로 호출되는 내부 커맨드.
- stdin에서 hook 이벤트 JSON을 읽어 API로 전송한다.
- Stop/SubagentStop 이벤트 시 transcript JSONL에서 토큰 사용량을 추출해 함께 전송한다.
- **반드시 exit 0**으로 종료한다 (Claude Code의 작업 흐름을 절대 차단하지 않음).
- API 요청 타임아웃: 3초. 실패 시 로컬 파일에 로그만 기록하고 무시한다.

#### `argos status`
- 현재 로그인된 사용자, 연결된 프로젝트, API URL, hook 설치 여부를 출력한다.

#### `argos logout`
- 로컬 토큰을 삭제하고 서버에 revoke 요청을 보낸다.

### 4.2 API 서버 (Hono + Prisma + Supabase)

#### 인증
- Email/Password 자체 인증 + JWT (bcrypt 해시, 1년 유효 JWT). CLI와 웹 모두 동일 방식.
  - `POST /api/auth/register` — 회원가입
  - `POST /api/auth/login` — 로그인 → JWT 발급
  - `POST /api/auth/logout` — CliToken revoke
- Bearer 토큰 검증 미들웨어 (DB revocation 체크 포함).

#### 조직/프로젝트 관리
- Organization 생성, 프로젝트 생성.
- `.argos/project.json`의 `projectId`로 프로젝트 식별.
- 기존 project에 `argos login`으로 합류 시, 사용자를 org에 자동 추가.

#### 이벤트 수집
- `POST /api/events`: CLI hook이 전송하는 이벤트를 수신, 저장.
- Skill 호출 (`tool_name = "Skill"`) 및 Agent 호출 (`tool_name = "Agent"`) 자동 감지 및 파생 필드 저장.
- 토큰 사용량 및 추정 비용 저장 (Stop/SubagentStop 이벤트).

#### 대시보드 데이터 API
- 프로젝트 요약, 토큰 사용량 시계열, 사용자별 통계, skill/agent 호출 빈도, 세션 목록을 제공.

### 4.3 웹 대시보드 (Next.js)

#### 인증
- Email/Password 로그인 (Auth.js v5 Credentials provider).
- 로그인 시 API의 `/api/auth/login` 호출 → JWT를 세션에 저장 → API 요청 시 Bearer로 전달.

#### 대시보드 — Overview
- 총 세션 수, 활성 사용자 수, 총 토큰 사용량, 추정 비용 (카드)
- 일별 토큰 사용량 시계열 차트 (input / output / cache read)
- Top Skills 차트, Top Agent Types 차트

#### 대시보드 — Users
- 팀원별 세션 수, 토큰 사용량, 추정 비용, skill/agent 호출 수

#### 대시보드 — Skills
- Skill별 호출 횟수, 사용한 팀원 수, 마지막 호출 시각

#### 대시보드 — Agents
- Agent type별 호출 횟수, 대표 description 샘플, 사용한 팀원 수

#### 대시보드 — Sessions
- 세션 목록: 사용자, 시작 시각, 지속 시간, 이벤트 수, 토큰 수, 추정 비용
- 세션 상세: 클릭 시 해당 세션의 전체 대화 내역 조회 (HUMAN / ASSISTANT 메시지)

---

## 5. 비용 추정 방식

토큰 사용량에 Claude API 공식 단가를 곱해 계산한다.
**중요**: 구독 요금제(Max 등) 사용자의 경우 실제 지불 금액과 크게 다를 수 있다. 대시보드에 이를 명시한다.

기준 단가 (claude-sonnet-4-6 기준, 변경 가능):

| 토큰 유형 | 단가 (1M 토큰당) |
|---|---|
| Input | $3.00 |
| Output | $15.00 |
| Cache write | $3.75 |
| Cache read | $0.30 |

모델별 단가는 서버 설정 파일로 관리해 업데이트 가능하게 한다.

---

## 6. 비기능 요구사항

### 성능
- `POST /api/events` 응답: p99 ≤ 200ms
- 대시보드 API 응답: p99 ≤ 1,000ms

### 안정성
- `argos hook`은 API 서버 다운 시에도 Claude Code 동작에 영향을 주지 않아야 한다.
- 이벤트 전송 실패는 `~/.argos/hook-debug.log`에 기록된다 (`ARGOS_DEBUG=1` 설정 시).

### 배포 용이성
- 환경 변수(`DATABASE_URL`, `JWT_SECRET`)만 설정하면 어느 인프라에서도 동작해야 한다.
- `docker-compose.yml` 한 파일로 전체 스택을 로컬에서 실행 가능해야 한다.

### 보안
- JWT 토큰은 DB에서 revocation 관리.
- 사용자는 자신이 속한 org의 프로젝트 데이터만 접근 가능.
- 비밀번호는 bcrypt로 해시 저장. 평문 저장 금지.

### 데이터
- MVP에서는 데이터 만료/삭제 정책을 적용하지 않는다.
- 이벤트 데이터는 수집된 그대로 보존된다.

---

## 7. 명시적 비스코프 (MVP 제외)

| 기능 | 이유 |
|---|---|
| 비용 알림 / 임계값 경고 | v2로 이관 |
| Skill 추천 / 인사이트 자동 생성 | v2로 이관 |
| 예산 설정 및 hard limit | v2로 이관 |
| 이메일 초대 방식 팀 온보딩 | GitHub org 기반 자동 합류로 대체 |
| Claude 외 모델 지원 | v2로 이관 |
| 데이터 보존 기간 설정 | v2로 이관 |
| 역할 기반 권한 세분화 (RBAC) | OWNER/MEMBER 2단계만 지원 |
| SaaS 호스팅 / 과금 | 현재 오픈소스 전용 |
| 모바일 지원 | 데스크톱 전용 (1280px+) |

---

## 8. 의존성 및 전제 조건

- 사용자는 Claude Code를 사용하고 있어야 한다.
- `argos-ai` CLI가 PATH에 설치되어 있어야 hook이 동작한다.
- 프로젝트 저장소에 `.claude/settings.json` 파일이 git으로 관리되어야 팀원 전체에 hook이 배포된다.
- 이메일 주소와 비밀번호가 필요하다 (인증 수단). GitHub 계정 불필요.

---

## 9. 오픈소스 전략

- 라이선스: MIT
- 배포: GitHub 공개 저장소
- CLI는 npm에 `argos-ai`로 배포
- 셀프호스팅 가이드를 README에 포함
- 환경 변수로 DB URL 및 OAuth 자격증명을 주입하는 방식으로 어느 클라우드에서도 배포 가능
