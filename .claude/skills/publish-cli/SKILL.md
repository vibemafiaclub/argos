`packages/cli`(argos-ai) 를 npm에 배포하는 전 과정을 두 단계로 자동화한다. `npm login`과 `npm publish`는 **직접 수행하지 않고** 사용자가 수동 실행한다. 트리거: "cli 배포", "argos-ai publish", "/publish-cli", "cli 퍼블리시", "릴리즈 마무리", "/publish-cli finalize" 등 argos-ai 배포/릴리즈 의도가 보이는 모든 발화.

**두 단계 구조** — 실행 시 인자로 Part를 선택한다:

- **Part 1 (기본)** — `/publish-cli [patch|minor|major|X.Y.Z]`: 버전 범프 ~ 빌드 검증 ~ pack 프리뷰까지. 끝나면 사용자에게 `npm publish` 수동 실행을 안내하고 종료.
- **Part 2** — `/publish-cli finalize`: 사용자가 수동 publish를 완료한 뒤 호출. 레지스트리 확인 → tag → push(commits + tag) → GitHub release 생성.

---

## 0. 대원칙

1. **`npm login` / `npm publish`는 절대 실행하지 않는다.** Part 1 끝에 수동 실행 가이드만 보여준다.
2. **git push / tag / GitHub release는 Part 2에서만 수행한다.** Part 1에서는 tag/push 모두 금지 (publish 실패 시 불일치 방지).
3. `packages/cli` 외부의 파일은 이 스킬 안에서 수정하지 않는다. 필요 시 사용자에게 보고 후 별도 처리.
4. 하나라도 실패하면 **즉시 중단**하고 원인을 사용자에게 보고한다. 우회(`--no-verify`, 테스트 스킵 등) 금지.
5. 버전 번호는 `packages/cli/package.json`의 `version` 필드만 단일 기준(SSOT). 다른 곳에 하드코딩된 버전 문자열은 건드리지 않는다.
6. Part 2는 **Part 1이 이미 완료되고 사용자가 `npm publish`를 실행했다**는 전제 하에만 동작한다. 확인 후 진행.

---

## Part 1 — 배포 준비 (`/publish-cli [version]`)

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

현재 브랜치를 1-7 안내 메시지에 포함해 사용자가 인지하도록 한다.

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
- **이 시점에서 git tag는 찍지 않는다.** tag는 Part 2에서 publish 확정 후 생성.

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

### 1-7. Part 1 종료 보고 & 수동 publish 안내

모든 단계가 통과하면 아래 형식으로 간결히 보고:

```
✅ argos-ai vX.Y.Z 배포 준비 완료 (Part 1/2)
  - bump commit: <hash> chore(cli): bump to vX.Y.Z
  - 현재 브랜치: <branch>
  - 검증: lint / typecheck / test 통과
  - 빌드: dist/index.js (shebang OK, <size>)
  - npm pack: <file count> files, <unpacked size>

다음 명령으로 직접 배포하세요:

  cd packages/cli
  npm login        # 이미 로그인돼 있으면 생략 가능 (npm whoami로 확인)
  npm publish

publish 완료 후 `/publish-cli finalize`로 tag + push + GitHub release를 마무리하세요.
```

- **Part 1은 여기서 종료**. `npm login` / `npm publish` / `git push` / `git tag` 중 어느 것도 실행하지 않는다.

---

## Part 2 — 릴리즈 마무리 (`/publish-cli finalize`)

사용자가 Part 1을 완료하고 `npm publish`를 실행한 뒤 호출된다. 이 단계는 **publish된 버전을 npm 레지스트리에서 직접 확인한 뒤에만** 진행한다.

### 2-1. 전제 조건 확인

```bash
# 현재 package.json의 버전이 곧 릴리즈할 버전
VERSION=$(node -p "require('./packages/cli/package.json').version")
echo "Target version: v$VERSION"

# 마지막 커밋이 이 버전의 bump commit인지 확인
git log -1 --format=%s   # "chore(cli): bump to v$VERSION" 이어야 함

# 브랜치 / push 상태 확인
git status --short        # clean 이어야 함 (Part 1 이후 새 변경이 생기면 중단)
git branch --show-current
```

- working tree에 Part 1 이후 생긴 새 변경이 있으면 **중단**하고 사용자에게 보고 (별도 커밋으로 처리).
- bump commit이 가장 위에 있지 않으면(그 사이 다른 커밋이 끼어들었으면) 중단하고 사용자에게 상황 확인.

### 2-2. npm 레지스트리에서 publish 확인

```bash
npm view argos-ai@$VERSION version
```

- 해당 버전이 레지스트리에 존재하면 정상 — 다음 단계로.
- **비어 있으면 중단**하고 "아직 `npm publish`가 완료되지 않았습니다. publish 후 다시 `/publish-cli finalize`를 호출하세요." 라고 안내.

### 2-3. Annotated tag 생성

```bash
git tag -a "v$VERSION" -m "argos-ai v$VERSION"
```

- lightweight tag가 아닌 **annotated tag** 사용(`-a`). GitHub release와 메타데이터 호환.
- 이미 동일한 tag가 있으면 중단하고 사용자 확인. (덮어쓰기 금지)

### 2-4. commits + tag push

```bash
git push --follow-tags
```

- `--follow-tags`로 bump commit과 새 annotated tag를 함께 push.
- upstream이 없으면 `git push -u origin <branch> --follow-tags`.
- non-fast-forward로 거절되면 **`--force` 금지**. 상황을 설명하고 사용자에게 옵션 제시(원격 변경 확인 / rebase 등).

### 2-5. GitHub release 생성

```bash
gh release create "v$VERSION" \
  --title "argos-ai v$VERSION" \
  --generate-notes \
  --target "$(git rev-parse HEAD)"
```

- `--generate-notes`로 이전 tag 이후 커밋/PR에서 자동 생성.
- repo 첫 릴리즈라 이전 tag가 없으면 `--generate-notes`는 전체 커밋 히스토리 기반으로 생성됨(길면 사용자에게 보고 후 수동 수정 권장).
- `gh` CLI가 없거나 인증 안 돼 있으면 실행 전에 감지:

```bash
command -v gh >/dev/null || echo "gh CLI 필요"
gh auth status 2>&1 | head -3
```

- 인증 문제면 중단하고 사용자에게 `gh auth login` 안내.
- 이미 동일 tag의 release가 있으면 중단 (덮어쓰지 말 것).
- **draft / prerelease 옵션**은 기본 사용하지 않음. 사용자가 명시적으로 요청하면 `--draft` 또는 `--prerelease` 추가.

### 2-6. Part 2 종료 보고

```
✅ argos-ai vX.Y.Z 릴리즈 완료 (Part 2/2)
  - npm: argos-ai@X.Y.Z (published 확인)
  - git tag: vX.Y.Z (annotated)
  - pushed: <branch> + tag
  - GitHub release: <url>
```

---

## 3. 자주 하는 실수 (하지 말 것)

- ❌ `npm publish` 또는 `npm login`을 대신 실행
- ❌ Part 1에서 tag/push를 먼저 수행 (publish 전 release가 남는 불일치 유발)
- ❌ Part 2를 publish 확인 없이 진행 (`npm view`로 반드시 확인)
- ❌ uncommitted 변경이 있는 상태에서 버전 bump 커밋에 무관 변경을 끼워 넣기 (반드시 commit 스킬 경유)
- ❌ `package.json`의 `version` 외 다른 필드 수정 (dependencies 정리, scripts 변경 등은 별도 작업)
- ❌ 검증/빌드 실패를 우회 (`--no-verify`, `vitest run --reporter=... || true`, 등)
- ❌ 이미 publish된 버전으로 bump (`npm view argos-ai@X.Y.Z`로 사전 체크)
- ❌ `packages/cli` 밖의 파일 수정
- ❌ lightweight tag 사용 — 반드시 `git tag -a`
- ❌ push 거절을 `--force`로 우회
- ❌ 기존 tag / release를 덮어쓰기 (동일 버전 재릴리즈가 필요하면 사용자에게 확인)
