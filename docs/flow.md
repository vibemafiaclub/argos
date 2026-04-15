# User Flow — Argos

**문서 버전**: 0.1  
**작성일**: 2026-04-14  
**페르소나**: Google 출신 시니어 UX 리서처

---

## 전체 여정 지도

```
[첫 번째 팀원]                    [이후 팀원]                    [지속 사용]
      │                               │                              │
  argos 실행                      git clone                    Claude Code 사용
      │                           argos 실행                         │
  이메일/비밀번호 인증             이메일/비밀번호 인증           hooks 자동 실행
      │                               │                              │
  org 자동 생성                   org 자동 합류                  이벤트 수집
  프로젝트 생성                         │                              │
  hook 주입                      트래킹 시작                   대시보드 갱신
      │
  git commit & push
```

---

## Flow 1 — 첫 번째 팀원 (프로젝트 최초 설정)

**전제**: `argos-ai` npm 설치 완료. 저장소에 `.argos/project.json` 없음.

```
사용자                          CLI                            브라우저                        API
  │                              │                                │                             │
  ├─ $ argos ──────────────────▶│                                │                             │
  │                              ├─ ~/.argos/config.json 확인    │                             │
  │                              │  (없음 → 로그인 필요)          │                             │
  │                              ├─ .argos/project.json 확인     │                             │
  │                              │  (없음 → 초기화 필요)          │                             │
  │                              │                                │                             │
  │◀─ "이메일을 입력하세요:" ─────┤                                │                             │
  ├─ (이메일 입력) ──────────────▶│                                │                             │
  │◀─ "비밀번호를 입력하세요:" ───┤                                │                             │
  ├─ (비밀번호 입력) ────────────▶│                                │                             │
  │                              ├─ POST /api/auth/login ─────────────────────────────────────▶│
  │                              │  (실패 시 register 안내)       │                             ├─ JWT 발급
  │                              │◀─ { token, user } ─────────────────────────────────────────┤
  │                              ├─ ~/.argos/config.json 저장    │                             │
  │                              │                                │                             │
  │                              │  (project.json 없음 → 프로젝트 생성 단계)
  │                              │                                │                             │
  │◀─ "프로젝트 이름을 입력하세요 [my-project]:" ─────────────────┤                             │
  ├─ (입력 또는 엔터) ───────────▶│                                │                             │
  │                              ├─ POST /api/projects ─────────────────────────────────────▶│
  │                              │  (org 없음 → org 자동 생성)    │                             ├─ Org 생성
  │                              │                                │                             ├─ Project 생성
  │                              │◀─ { projectId, orgId } ────────────────────────────────────┤
  │                              ├─ .argos/project.json 작성     │                             │
  │                              ├─ .argos/.gitignore 작성       │                             │
  │                              ├─ .claude/settings.json hook 주입                            │
  │                              │                                │                             │
  │◀─ 완료 메시지 ───────────────┤                                │                             │
```

**완료 메시지 예시**:
```
✓ 로그인 완료 (jane@example.com)
✓ 조직 생성: jane-dev
✓ 프로젝트 생성: my-project
✓ .argos/project.json 작성
✓ Claude Code hooks 설치 완료

다음 단계:
  git add .argos/project.json .claude/settings.json
  git commit -m "chore: add argos tracking"

팀원들이 이 저장소를 clone한 뒤 argos를 실행하면 자동으로 팀에 합류됩니다.
```

---

## Flow 2 — 이후 팀원 (기존 프로젝트 합류)

**전제**: 팀원이 `.argos/project.json`이 포함된 저장소를 clone함.

```
사용자                          CLI                            브라우저                        API
  │                              │                                │                             │
  ├─ $ git clone org/repo        │                                │                             │
  ├─ $ cd repo                   │                                │                             │
  ├─ $ argos ──────────────────▶│                                │                             │
  │                              ├─ ~/.argos/config.json 확인    │                             │
  │                              │  (없음 → 로그인 필요)          │                             │
  │                              ├─ .argos/project.json 읽기     │                             │
  │                              │  projectId: proj_abc123        │                             │
  │                              │  orgId: org_xyz                │                             │
  │                              │                                │                             │
  │◀─ "이메일을 입력하세요:" ─────┤                                │                             │
  ├─ (이메일/비밀번호 입력) ──────▶│                                │                             │
  │                              ├─ POST /api/auth/login ─────────────────────────────────────▶│
  │                              │◀─ { token, user } ─────────────────────────────────────────┤
  │                              ├─ ~/.argos/config.json 저장    │                             │
  │                              │                                │                             │
  │                              ├─ POST /api/orgs/:orgId/members ─────────────────────────────▶│
  │                              │  (org 자동 합류)               │                             ├─ Membership 생성
  │                              │◀─ { ok: true } ────────────────────────────────────────────┤
  │                              │                                │                             │
  │◀─ 완료 메시지 ───────────────┤                                │                             │
```

**완료 메시지 예시**:
```
✓ 로그인 완료 (bob@example.com)
✓ 프로젝트 확인: my-project
✓ 조직 합류: jane-dev

트래킹이 활성화되었습니다. Claude Code를 사용하면 자동으로 기록됩니다.
```

---

## Flow 3 — 이미 로그인된 팀원 (새 프로젝트 init)

**전제**: `~/.argos/config.json` 존재, `.argos/project.json` 없음.

```
$ argos

✓ 로그인됨: Jane Dev
→ 이 디렉토리는 아직 Argos 프로젝트가 아닙니다.

? 프로젝트 이름 [my-new-service]:
? 조직 선택:
  ▸ jane-dev (기존)
    새 조직 만들기

✓ 프로젝트 생성: my-new-service
✓ .argos/project.json 작성
✓ Claude Code hooks 설치 완료
```

---

## Flow 4 — 모든 것이 설정된 상태에서 실행

```
$ argos

✓ 모두 준비되어 있습니다.

사용자:   Jane Dev (jane@example.com)
프로젝트: my-project (proj_abc123)
조직:     jane-dev
API:      https://server.argos-ai.xyz
Hooks:    ✓ .claude/settings.json에 설치됨
```

---

## Flow 5 — CLI 인증 흐름 (이메일/비밀번호)

```
┌─────────────────────────────────────────────────────────┐
│  CLI (터미널)                                           │
│                                                         │
│  1. 이메일 입력 프롬프트                                  │
│     > Email: jane@example.com                           │
│                                                         │
│  2. 비밀번호 입력 프롬프트 (입력 시 숨김 처리)             │
│     > Password: ••••••••                                │
│                                                         │
│  3. POST /api/auth/login                                │
│     { email, password }                                 │
│     ← { token, user }                                   │
│                                                         │
│  4. ~/.argos/config.json에 token 저장                   │
│     { "token": "...", "apiUrl": "..." }                  │
│                                                         │
│  ※ 계정이 없는 경우: 로그인 실패 시                       │
│     "계정이 없습니다. argos register를 실행하세요." 출력  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  웹 대시보드 (/login)                                   │
│                                                         │
│  이메일/비밀번호 입력 폼                                  │
│  → POST /api/auth/login 호출                            │
│  → JWT를 Auth.js 세션에 저장                            │
│  → /dashboard로 리다이렉트                              │
└─────────────────────────────────────────────────────────┘
```

---

## Flow 6 — Hook 이벤트 수집 (Claude Code 사용 중)

**전제**: `argos` 설정 완료, Claude Code 사용 중.

```
Claude Code                argos hook (자동 실행)         [detached 자식 프로세스]     API
     │                              │                              │                    │
     ├─ tool 호출 전 ──────────────▶│                              │                    │
     │  stdin: PreToolUse JSON      ├─ stdin 파싱                  │                    │
     │                              ├─ ~/.argos/config.json 읽기   │                    │
     │                              ├─ .argos/project.json 읽기    │                    │
     │                              ├─ payload → /tmp/argos-*.json │                    │
     │                              ├─ spawn(node, detached) ─────▶│                    │
     │◀─ exit 0 ────────────────────┤  child.unref()               ├─ POST /api/events─▶│
     │  (0ms 지연, Claude Code 계속) │                              │  (10초 타임아웃)   ├─ Event 저장
     │                              │                              ├─ tmp 파일 삭제      │
     │                              │                              │                    │
     ├─ Stop 이벤트 ───────────────▶│  Stop                        │                    │
     │                              ├─ transcript.jsonl 읽기 (로컬) │                    │
     │                              ├─ 토큰 사용량 추출             │                    │
     │                              ├─ 대화 메시지 추출             │                    │
     │                              ├─ payload → /tmp/argos-*.json │                    │
     │                              ├─ spawn(node, detached) ─────▶│                    │
     │◀─ exit 0 ────────────────────┤  child.unref()               ├─ POST /api/events─▶│
     │  (0ms 지연)                  │                              │  (usage + messages)├─ UsageRecord 저장
     │                              │                              │                    ├─ Message insert
```

**핵심 설계**: `argos hook` 프로세스는 로컬 파일 처리(stdin 파싱, transcript 읽기) 후 **즉시 exit 0**한다. API 전송은 완전히 분리된(detached + unref) 자식 프로세스가 담당하므로 Claude Code에 어떠한 네트워크 지연도 발생하지 않는다.

**Skill 호출 감지**:
```
PreToolUse: { tool_name: "Skill", tool_input: { skill: "commit" } }
→ isSkillCall: true, skillName: "commit"
```

**Agent 호출 감지**:
```
PreToolUse: { tool_name: "Agent", tool_input: { subagent_type: "Explore", description: "..." } }
→ isAgentCall: true, agentType: "Explore", agentDesc: "..."
```

**실패 처리**:
```
API 미응답 또는 오류
→ exit 0 (Claude Code 영향 없음)
→ ARGOS_DEBUG=1 설정 시 ~/.argos/hook-debug.log에 기록
```

---

## Flow 7 — 웹 대시보드 탐색

### 로그인 후 첫 진입
```
/login
  └─ 이메일/비밀번호 입력 후 로그인
      └─ Auth.js Credentials → API /api/auth/login
          └─ /dashboard 리다이렉트
              └─ 첫 번째 프로젝트로 자동 이동
                  └─ /dashboard/[projectId]
```

### 대시보드 탐색 구조
```
/dashboard/[projectId]          ← Overview (기본)
├─ /users                       ← 팀원별 사용량
├─ /skills                      ← Skill 호출 분석
├─ /agents                      ← Agent 호출 분석
└─ /sessions                    ← 세션 이력
```

### 프로젝트 전환
```
사이드바 상단 프로젝트 드롭다운
  └─ 사용자가 속한 모든 프로젝트 목록
      └─ 선택 시 /dashboard/[새projectId]로 이동
```

### 날짜 범위 필터
```
헤더 DateRangePicker
  ├─ 프리셋: 최근 7일 / 30일 / 90일
  └─ 직접 입력: from ~ to
      └─ 변경 시 모든 데이터 자동 갱신 (TanStack Query refetch)
```

---

## Flow 8 — 오류 및 엣지 케이스

### CLI: 로그인 실패 (잘못된 이메일/비밀번호)
```
$ argos

이메일: jane@example.com
비밀번호: ••••••••

✗ 이메일 또는 비밀번호가 올바르지 않습니다.
  계정이 없다면: argos register
```

### CLI: API 서버 미응답
```
$ argos

브라우저에서 GitHub 인증을 완료해주세요...

✗ API 서버에 연결할 수 없습니다: https://server.argos-ai.xyz
  셀프호스팅을 사용 중이라면 --api-url 플래그를 확인하세요.
```

### Hook: 로그인되지 않은 팀원
```
팀원이 argos login 전에 Claude Code 사용
→ ~/.argos/config.json 없음
→ argos hook: 조용히 exit 0
→ 이벤트 미수집 (정상 동작, 사용자에게 영향 없음)
```

### Hook: 프로젝트 미초기화 경로
```
.argos/project.json을 찾을 수 없는 디렉토리에서 Claude Code 사용
→ argos hook: 조용히 exit 0
→ 이벤트 미수집
```

### 웹: 데이터 없음 상태
```
/dashboard/[projectId]
  └─ 이벤트가 한 건도 없는 경우
      └─ Empty state 표시:
         "아직 수집된 데이터가 없습니다.
          팀원들이 argos를 설정하고 Claude Code를 사용하면
          여기에 데이터가 표시됩니다."
```

### `argos` 실행 중 `.argos/project.json`이 손상된 경우
```
$ argos

✗ .argos/project.json을 읽을 수 없습니다. (JSON 파싱 오류)
  파일을 삭제하고 argos를 다시 실행하면 재설정할 수 있습니다.
```

---

## 상태 전이 요약

```
                        ┌─────────────────────────────┐
                        │  argos 실행                  │
                        └──────────────┬──────────────┘
                                       │
              ┌──────── config.json? ──┤
              │ No                     │ Yes
              ▼                        ▼
     ┌─────────────┐         project.json?
     │  브라우저   │              │
     │  GitHub Auth│    ┌─── No ──┴── Yes ───┐
     └──────┬──────┘    ▼                    ▼
            │    ┌──────────────┐   ┌──────────────────┐
            │    │ 프로젝트 생성 │   │ org 합류 확인     │
            │    │ hook 주입     │   │ (미합류 시 합류)  │
            │    └──────┬───────┘   └────────┬─────────┘
            │           │                    │
            └───────────┴────────────────────┘
                                │
                                ▼
                       ┌────────────────┐
                       │  status 출력   │
                       │  (완료 상태)   │
                       └────────────────┘
```
