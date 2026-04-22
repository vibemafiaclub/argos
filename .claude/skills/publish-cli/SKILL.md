`packages/cli`(argos-ai) 를 npm에 배포하기 직전까지의 모든 준비 작업을 수행한다. `npm login`과 `npm publish`는 **수행하지 않고** 마지막에 사용자에게 수동 실행을 안내한다. 트리거: "cli 배포", "argos-ai publish 준비", "/publish-cli", "cli 퍼블리시" 등 argos-ai CLI 배포 의도가 보이는 모든 발화.

---

## 0. 대원칙

1. **`npm login` / `npm publish`는 절대 실행하지 않는다.** 스킬의 마지막 출력으로 수동 실행 가이드만 보여준다.
2. `packages/cli` 외부의 파일은 이 스킬 안에서 수정하지 않는다. 필요 시 사용자에게 보고 후 별도 처리.
3. 하나라도 실패하면 **즉시 중단**하고 원인을 사용자에게 보고한다. 우회(`--no-verify`, 테스트 스킵 등) 금지.
4. 버전 번호는 `packages/cli/package.json`의 `version` 필드만 단일 기준(SSOT). 다른 곳에 하드코딩된 버전 문자열은 건드리지 않는다.

---

## 1. 절차

### 1-1. 버전 범프 타입 결정

인자(`patch` / `minor` / `major` / `X.Y.Z`)가 주어졌으면 그대로 사용. 없으면 사용자에게 묻는다. 현재 버전은 `packages/cli/package.json`의 `version`에서 읽어 새 버전을 계산하고 사용자에게 확인받는다.

```bash
# 현재 버전 확인
node -p "require('./packages/cli/package.json').version"
```

- 계산한 새 버전이 npm 레지스트리에 이미 존재하면 publish가 실패하므로 사전 체크:

```bash
npm view argos-ai@<new-version> version 2>/dev/null
```

비어 있으면 OK. 값이 나오면 중단하고 사용자에게 알림.

### 1-2. uncommitted 변경 처리

```bash
git status --short
git branch --show-current
```

- working tree가 **clean** 이면 1-3으로.
- **변경이 있으면** — 이 스킬에서 직접 커밋하지 않고 **`commit` 스킬을 호출**해 사용자 세션 컨텍스트에 맞게 커밋을 완료시킨 뒤 1-3으로 진행한다. (commit 스킬의 모든 대원칙/관련 파일 선별/승인 절차를 그대로 따른다.)
- 커밋 후 다시 `git status --short`로 clean 확인. 여전히 파일이 남아 있으면 중단하고 사용자에게 보고.

브랜치가 `main` / `master`가 아니어도 무방하지만 publish는 일반적으로 릴리즈 브랜치에서 수행되므로, 현재 브랜치를 1-7 안내 메시지에 포함해 사용자가 인지하도록 한다.

### 1-3. 버전 범프 커밋

```bash
# packages/cli/package.json의 "version"만 수정 — 다른 필드는 건드리지 않는다
# (Edit 툴로 수정)

cd packages/cli && git diff package.json   # 변경 확인: version 한 줄만 바뀌어야 함

git add packages/cli/package.json
git commit -m "$(cat <<'EOF'
chore(cli): bump to vX.Y.Z

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- 메시지는 기존 히스토리(`git log --oneline -- packages/cli/package.json`)와 **정확히 동일한 형식**: `chore(cli): bump to vX.Y.Z` (X.Y.Z는 새 버전).
- 본문 없음. trailer만.
- **git tag는 찍지 않는다.** (기존 컨벤션에 없음)

### 1-4. 검증 — lint / typecheck / test

모노레포 루트에서 실행. 하나라도 실패하면 즉시 중단.

```bash
pnpm --filter argos-ai lint
pnpm --filter argos-ai typecheck
pnpm --filter argos-ai test
```

### 1-5. 빌드 및 산출물 확인

```bash
pnpm --filter argos-ai build
```

`packages/cli/scripts/add-shebang.js`가 빌드 후 `dist/index.js`에 shebang을 붙인다. 확인:

```bash
head -1 packages/cli/dist/index.js   # '#!/usr/bin/env node' 이어야 함
ls -l packages/cli/dist/index.js
```

- 첫 줄이 shebang이 아니면 중단하고 원인 조사.
- `dist/` 존재 및 `index.js` 생성 여부 확인.

### 1-6. `npm pack --dry-run`으로 포함 파일 프리뷰

```bash
cd packages/cli && npm pack --dry-run
```

출력에서 아래를 확인하고 사용자에게 요약 보고:

- `files` 배열 규약(`dist`, `README.md`)에 따라 의도한 것만 포함됐는지
- `src/`, `__tests__/`, `node_modules/`, `.turbo/`, `tsconfig.json`, `vitest.config.ts` 등 **포함되면 안 되는 항목**이 섞이지 않았는지
- 총 파일 수 / unpacked 크기가 이전 릴리즈 대비 크게 튀지 않는지 (이상 시 사용자에게 flag)

### 1-7. 사용자에게 배포 수동 실행 안내

모든 단계가 통과하면 아래 형식으로 간결히 보고:

```
✅ argos-ai vX.Y.Z 배포 준비 완료
  - bump commit: <hash> chore(cli): bump to vX.Y.Z
  - 현재 브랜치: <branch>
  - 검증: lint / typecheck / test 통과
  - 빌드: dist/index.js (shebang OK, <size>)
  - npm pack: <file count> files, <unpacked size>

다음 명령으로 직접 배포하세요:

  cd packages/cli
  npm login        # 이미 로그인돼 있으면 생략 가능 (npm whoami로 확인)
  npm publish

배포 후 필요 시 bump commit을 원격에 push하세요:
  git push
```

- **이 스킬은 여기서 종료**. `npm login` / `npm publish` / `git push` 중 어느 것도 실행하지 않는다.

---

## 2. 자주 하는 실수 (하지 말 것)

- ❌ `npm publish` 또는 `npm login`을 대신 실행
- ❌ uncommitted 변경이 있는 상태에서 버전 bump 커밋에 무관 변경을 끼워 넣기 (반드시 commit 스킬 경유)
- ❌ `package.json`의 `version` 외 다른 필드 수정 (dependencies 정리, scripts 변경 등은 별도 작업)
- ❌ 검증/빌드 실패를 우회 (`--no-verify`, `vitest run --reporter=... || true`, 등)
- ❌ git tag 생성 (기존 컨벤션에 없음 — 필요하면 사용자가 명시적으로 요청할 때만)
- ❌ 이미 publish된 버전으로 bump (`npm view argos-ai@X.Y.Z`로 사전 체크)
- ❌ `packages/cli` 밖의 파일 수정
