# Argos

Claude Code를 사용하는 팀을 위한 오픈소스 옵저버빌리티 도구.

`.claude/settings.json`의 hooks 시스템을 활용해 모든 tool 호출 이벤트를 수집하고, 팀 전체의 토큰 사용량 · skill/subagent 활용도 · 세션 활동을 웹 대시보드에서 시각화합니다.

---

## 무엇을 하는가

- **사용자별 토큰 추적** — input / output / cache read·write를 분리해 집계, Claude API 단가 기준 추정 비용 계산
- **Skill 활용 분석** — 어떤 skill이 자주 쓰이고, 어떤 skill은 방치되는지 호출 빈도와 사용자 수를 가시화
- **Agent / Subagent 추적** — 모든 `Agent` tool 호출을 type · description과 함께 기록
- **세션 타임라인** — 세션별 HUMAN / ASSISTANT 메시지와 tool 호출 순서를 그대로 재현
- **팀/프로젝트 대시보드** — Organization · Project 단위로 멤버 활동 집계

## 동작 방식

1. 팀 리드가 저장소 루트에서 `argos` 실행 → 회원가입/로그인 → 프로젝트 생성 → `.claude/settings.json`에 hooks 자동 주입
2. `.argos/project.json`과 수정된 `.claude/settings.json`을 git에 커밋
3. 저장소를 clone 한 팀원이 한 번만 `argos` 실행 → 같은 org에 자동 합류
4. 이후 모든 Claude Code tool 호출이 `argos hook`을 통해 API로 전송 → 대시보드에 실시간 반영

`argos hook`은 항상 `exit 0`으로 종료하며 3초 타임아웃을 가지므로, API가 다운되어도 Claude Code의 작업 흐름을 막지 않습니다.

---

## 설치 및 사용

```bash
npm install -g argos-ai

# 저장소 루트에서 실행 — 상태에 따라 setup / join / status를 자동 분기
argos

# 셀프호스팅 인스턴스를 쓰는 경우
argos --api-url https://argos.your-company.com

argos status   # 로그인 사용자, 프로젝트, hook 설치 상태 확인
argos logout   # 로컬 토큰 삭제 + 서버에 revoke 요청
```

기본 API URL은 `https://server.argos-ai.xyz` 입니다.

`argos`는 현재 상태(로그인 여부 × `.argos/project.json` 존재 여부)를 감지해 다음과 같이 동작합니다:

| 로그인 | `project.json` | 동작 |
|---|---|---|
| ✗ | ✗ | 회원가입/로그인 → org 생성 → 프로젝트 생성 → hook 주입 |
| ✗ | ✓ | 회원가입/로그인 → 기존 org에 자동 합류 |
| ✓ | ✗ | 프로젝트 생성 → hook 주입 |
| ✓ | ✓ | org 멤버십 확인 후 status 출력 |

---

## 모노레포 구조

```
packages/
  cli/      argos-ai CLI (commander + ora) — npm 배포 대상
  api/      Hono + Prisma API 서버 (이벤트 수집 / 인증 / 대시보드 데이터)
  web/      Next.js 대시보드 (Auth.js v5 Credentials)
  shared/   CLI · API · Web 공유 타입
docs/
  prd.md, code-architecture.md, data-schema.md, flow.md, adr.md
```

루트에서:

```bash
pnpm install
pnpm dev         # turbo dev — 모든 패키지 watch
pnpm build
pnpm typecheck
pnpm lint
```

CLI만 빌드하려면 `pnpm --filter argos-ai build`.

---

## 셀프호스팅

`docker-compose.yml`은 로컬 개발용 Postgres만 띄웁니다. 전체 스택은 직접 배포해야 합니다.

```bash
git clone https://github.com/your-org/argos
cd argos
docker compose up -d            # postgres 만 기동

# api
cd packages/api
cp .env.example .env            # DATABASE_URL, JWT_SECRET 설정
pnpm prisma migrate deploy
pnpm dev                        # 또는 docker build -f Dockerfile

# web
cd ../web
pnpm dev
```

필수 환경변수:

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | Postgres 연결 문자열 |
| `JWT_SECRET` | JWT 서명/검증 시크릿 (CLI · Web 공통) |

배포 후 클라이언트 측에서는 `argos --api-url https://...`로 인스턴스를 지정하거나, `.argos/project.json`의 `apiUrl` 필드를 사용합니다.

레퍼런스 배포 구성: API는 Railway (`railway.toml` 포함), Web은 Vercel (`vercel.json` 포함).

---

## 비용 추정

토큰 사용량 × Claude API 공식 단가로 계산합니다 (기준: claude-sonnet-4-6).

| 토큰 유형 | 단가 (1M 토큰당) |
|---|---|
| Input | $3.00 |
| Output | $15.00 |
| Cache write | $3.75 |
| Cache read | $0.30 |

> Max 등 구독 요금제 사용자의 경우 실제 청구액과 다를 수 있습니다 — 대시보드에 명시됩니다.

---

## 문서

- `docs/prd.md` — 제품 요구사항 (스코프 · 비스코프 포함)
- `docs/code-architecture.md` — 패키지 구조와 주요 모듈
- `docs/data-schema.md` — Prisma 스키마와 이벤트 모델
- `docs/flow.md` — 인증/이벤트 수집 시퀀스
- `docs/adr.md` — 아키텍처 결정 기록

## 라이선스

MIT
