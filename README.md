<p align="center">
  <img src="packages/web/public/argos-logo.png" alt="Argos" width="120" />
</p>

<h1 align="center">Argos</h1>

<p align="center">
  <strong>Analytics for Your Claude Code.</strong><br/>
  측정할 수 없다면 개선할 수 없습니다. Argos는 팀의 Claude Code 사용 패턴을 분석해줍니다. 팀이 AI를 어떻게 활용하는지, 어떤 스킬이 효과적인지, 어디서 막히는지를 파악해보세요.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/argos-ai"><img src="https://img.shields.io/npm/v/argos-ai.svg" alt="npm"/></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"/>
</p>

---

## Quick Start

```bash
npm install -g argos-ai

cd your-project
argos    # 브라우저 로그인 → 조직·프로젝트 초기화까지 한 번에

git add .argos/project.json .claude/settings.json
git commit -m "chore: add argos tracking"
```

이제 팀원이 저장소를 pull하고 `argos`를 한 번 실행하면 자동으로 같은 조직에 합류합니다.

### AI 에이전트에게 맡기기

Claude Code · Cursor · Copilot 대화창에 아래 프롬프트를 붙여넣으면 위 단계를 대신 수행합니다.

```
이 프로젝트에 Argos를 설치해줘. Argos는 Claude Code 팀을 위한 사용량 애널리틱스야.
참고: https://github.com/vibemafiaclub/argos

다음 3단계로 진행:

1. `npm install -g argos-ai` 로 CLI를 전역 설치.
2. 프로젝트 루트에서 `argos` 를 실행. 브라우저 기반 로그인과 프로젝트 초기화가 진행되는데,
   이 단계는 사용자 인증이 필요하므로 사용자에게 직접 실행을 요청하고 완료 확인을
   받은 뒤 다음 단계로 넘어갈 것.
3. 생성·수정된 파일을 커밋:
   git add .argos/project.json .claude/settings.json
   git commit -m "chore: add argos tracking"

기타 파일은 수정하지 마.
```

---

## What Argos gives you

- **팀 토큰 사용 추세** — 주 단위 추세와 팀원·프로젝트별 드릴다운
- **스킬·에이전트 호출 TOP** — 자주 호출되는 것, 안 쓰이는 것, 반복 실패 지점까지
- **세션 타임라인 & 전사** — 팀이 서로의 성공 세션을 열람·공유해 온보딩 가속
- **MIT 오픈소스 · 자체호스팅 가능** — 데이터는 조직 인프라 안에 유지

## Why we built it

팀 차원에서 Claude Code를 사용해보니, 여러 문제가 있었습니다.

- 잘 쓰는 사람과 그렇지 않은 사람의 편차가 커졌습니다.
- 누군가 추가한 스킬이 공유되지 않고 혼자만 쓰거나, 그대로 버려지는 경우가 많았습니다.
- 우리가 팀 차원에서 AI를 잘 쓰고 있는지 누구도 파악할 수 없었습니다.

그래서 대시보드를 직접 만들었습니다. Anthropic Console은 개인 단위였고, 우리가 원한 건 팀 단위였습니다. 같은 고민을 하는 팀들을 위해 오픈소스로 공개합니다.

## How it works

1. `argos`를 처음 실행하면 브라우저 OAuth로 로그인하고, 조직·프로젝트를 초기화합니다 (`.argos/project.json` 생성 + `.claude/settings.json`에 훅 항목 추가).
2. 이후 Claude Code가 훅을 발사할 때마다 `argos hook`이 호출되어 세션 메타·토큰·툴 호출·전사를 Argos API로 전송합니다.
3. 팀원은 저장소를 pull한 뒤 `argos`를 한 번 실행하면 같은 조직으로 자동 합류합니다.

## Self-hosting

요구사항: PostgreSQL 하나 + 앱 컨테이너 하나.

```bash
git clone https://github.com/vibemafiaclub/argos
cd argos
docker compose up
```

CLI가 자체 인스턴스를 가리키도록 설정합니다.

```bash
argos --api-url https://your-instance.example.com
```

혹은 `.argos/project.json`의 `apiUrl` 필드를 직접 수정해도 됩니다. 이렇게 하면 모든 데이터는 조직 인프라를 벗어나지 않습니다.

## FAQ

**프롬프트 원문이 서버로 전송되나요?**
세션 종료 시 HUMAN / ASSISTANT / TOOL 메시지 전체가 전송됩니다 (각 메시지 최대 50,000자에서 절단). 민감한 프롬프트를 다루는 환경이라면 자체호스팅을 권장합니다.

**Anthropic API 키가 수집되나요?**
아니오. Argos는 Claude Code 훅 이벤트만 받습니다. API 키·OAuth 토큰·시스템 환경변수는 수집 대상이 아닙니다.

**팀원이 제 세션을 볼 수 있나요?**
같은 조직 구성원은 대시보드에서 조직 내 세션을 열람할 수 있습니다. 팀 학습·리뷰를 염두에 둔 기본값이며, 조직 권한 모델로 제어할 수 있습니다.

**CI/CD·headless 환경에서도 동작하나요?**
예. Claude Code 훅이 실행되는 어떤 환경에서든 이벤트가 전송됩니다. CI 러너, GitHub Actions, 로컬 개발 머신 모두 동일한 대시보드로 모입니다.

## Links

- Hosted: https://argos-ai.xyz
- Privacy: https://argos-ai.xyz/privacy
- Architecture: [docs/code-architecture.md](docs/code-architecture.md)
- PRD: [docs/prd.md](docs/prd.md)

## 자율 주행 하네스

이 레포는 [`greatSumini/cc-system`](https://github.com/greatSumini/cc-system) 의 자율 주행 하네스를 이식해 쓴다. `scripts/run-server.py` 를 돌리면 ideation → plan-and-build → commit → check → rollback 루프가 반복되며, 이터레이션별 산출물은 `iterations/<N>-<timestamp>/` 아래에 남는다. 하네스가 spawn 하는 서브 세션에는 `HARNESS_HEADLESS=1` 이 주입돼 사용자 확인 단계가 자동 승인된다 — 쉘에서 이 변수를 직접 export 하지 말 것 (인터랙티브 세션이 무인 모드로 튄다). 트리거는 레포 관리자(메인테이너) 수동.

## License

MIT
