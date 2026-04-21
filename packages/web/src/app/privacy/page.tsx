import Link from 'next/link'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Argos가 수집하는 데이터 항목·저장 위치·접근 권한·삭제 절차.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Argos
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Privacy &amp; Data Collection</h1>
          <p className="text-sm text-muted-foreground">
            Argos는 Claude Code 사용 활동을 수집해 팀 단위 가시성을 제공합니다. 이 문서는 어떤 데이터가, 어떤 경로로,
            어디에 저장되며, 누가 접근할 수 있는지를 기술합니다.
          </p>
        </div>

        <Section title="1. 수집 주체 & 연락처">
          <p>
            서비스 운영자가 데이터 관리자이며, 자체호스팅(self-hosted) 배포에서는 배포한 조직이 관리자입니다.
            수집·처리·삭제 요청은 운영자 계정 이메일로 요청할 수 있습니다.
          </p>
        </Section>

        <Section title="2. 수집 항목">
          <Field
            name="계정 정보"
            items={['이메일', '이름', '비밀번호(bcrypt 해시)', '조직·프로젝트 멤버십']}
          />
          <Field
            name="세션 메타데이터"
            items={[
              '세션 ID, 시작/종료 타임스탬프',
              '프로젝트 ID, 조직 ID, 사용자 ID',
              '세션 타이틀(최대 500자), 요약(최대 10,000자)',
            ]}
          />
          <Field
            name="토큰 & 비용"
            items={[
              '입력/출력/캐시 생성/캐시 조회 토큰 수',
              '모델 식별자(예: claude-opus-4-7)',
              '턴별 사용량 분포',
              '추정 비용(USD) — 서버 측 계산',
            ]}
          />
          <Field
            name="도구 호출 기록"
            items={[
              '툴 이름 (Read, Edit, Bash 등)',
              '툴 입력값 (toolInput) — 원문 전송, 길이 제한 없음',
              '툴 응답 (toolResponse) — 최대 2,000자에서 절단',
              '실행 종료 코드, tool_use_id, 실행 소요 시간',
            ]}
          />
          <Field
            name="대화 전사 (transcript)"
            items={[
              'HUMAN 메시지 — 사용자가 Claude Code에 입력한 프롬프트, 메시지당 최대 50,000자',
              'ASSISTANT 메시지 — 모델 응답, 메시지당 최대 50,000자',
              'TOOL 메시지 — 툴 호출/응답, toolInput/toolResponse 포함',
              '세션 종료(Stop) 또는 서브에이전트 종료(SubagentStop) 시점에 일괄 전송',
            ]}
          />
          <Field
            name="에이전트 / 스킬 메타"
            items={[
              'Agent tool 호출: agent_id, agentType, agentDesc',
              'Skill 호출 여부 및 스킬 이름 (/skill-name 패턴 감지)',
              '슬래시 커맨드 호출 여부',
            ]}
          />
        </Section>

        <Section title="3. 수집되지 않는 것">
          <ul className="list-disc pl-5 space-y-1">
            <li>Git 저장소 자체의 파일을 디스크 스캔해 업로드하지 않습니다. Claude Code가 Read/Edit 등의 툴을 호출한 경우에만 해당 툴의 입출력이 포함됩니다.</li>
            <li>마우스 움직임·키 입력 등 행동 이벤트는 수집하지 않습니다.</li>
            <li>비밀번호는 평문으로 저장되지 않으며(bcrypt), Claude API 키는 Argos에 전송되지 않습니다.</li>
          </ul>
        </Section>

        <Section title="4. 주의: toolInput 원문 전송">
          <div className="rounded-md border border-danger/30 bg-danger/5 p-4 text-sm leading-relaxed">
            <p className="font-medium text-danger mb-1">사용자 관리 책임 영역</p>
            <p className="text-muted-foreground">
              툴 입력(<code className="text-foreground">toolInput</code>)은 절단 없이 원문 전송됩니다. Claude Code가
              <code className="text-foreground"> .env</code>, 비밀키 파일, 사설 저장소 경로를 Read 했다면 해당 내용이 Argos
              서버로 전송됩니다. 민감 경로는 Claude Code 측 <code className="text-foreground">permissions.deny</code> 설정으로
              차단하는 것을 권장합니다.
            </p>
          </div>
        </Section>

        <Section title="5. 저장 위치">
          <Field
            name="사용자 로컬 (~/.argos/config.json)"
            items={[
              'JWT 토큰 (평문), 사용자 ID, 이메일, API URL',
              '권한 0600 설정 권장',
            ]}
          />
          <Field
            name="저장소 (커밋 대상)"
            items={[
              '.argos/project.json — 프로젝트 ID, 조직 ID, API URL',
              '.claude/settings.json — 훅 명령(argos hook) 5종',
              '이 두 파일은 팀 저장소에 커밋되므로 저장소 접근자는 조직 연결 정보를 알게 됩니다.',
            ]}
          />
          <Field
            name="서버 (PostgreSQL)"
            items={[
              'users, organizations, projects, claude_sessions, events, usage_records, messages',
              'CLI 토큰은 SHA-256 해시로 저장 (cli_tokens)',
              '자체호스팅 시 데이터는 배포한 조직 인프라를 벗어나지 않습니다.',
            ]}
          />
        </Section>

        <Section title="6. 접근 권한">
          <ul className="list-disc pl-5 space-y-1">
            <li>사용자 본인: 자신의 세션 및 전사 전체</li>
            <li>조직 멤버: 같은 조직(프로젝트)에 속한 팀원의 세션 메타 · 전사 · 툴 호출 기록을 대시보드에서 조회 가능</li>
            <li>
              주의: 저장소를 clone하고 <code>argos</code>를 실행한 모든 사용자가 자동으로 조직에 합류하므로, 접근 통제는
              저장소 접근 통제와 동일합니다.
            </li>
          </ul>
        </Section>

        <Section title="7. 전송 보안">
          <ul className="list-disc pl-5 space-y-1">
            <li>HTTPS over TLS (Vercel·자체호스팅 시 해당 인프라 정책을 따름)</li>
            <li>JWT Bearer 인증, 서버 측 CliToken 테이블에서 해시 대조</li>
            <li>훅 요청 타임아웃 10초, 실패 시 재시도 없이 드롭</li>
          </ul>
        </Section>

        <Section title="8. 보존 & 삭제">
          <p>
            현재 버전은 자동 보존기간(TTL)을 적용하지 않으며, 삭제는 운영자에게 이메일로 요청해야 합니다. 자체호스팅 배포는
            PostgreSQL 테이블(users, claude_sessions, messages, events, usage_records)을 직접 삭제/익명화할 수 있습니다.
            로컬 자격증명 제거는 <code>argos logout</code>으로 즉시 가능합니다.
          </p>
        </Section>

        <Section title="9. 변경 이력">
          <p>이 문서가 변경되면 커밋 히스토리에 기록됩니다.</p>
        </Section>

        <div className="pt-8 border-t border-border text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            ← Home
          </Link>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
  )
}

function Field({ name, items }: { name: string; items: string[] }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-foreground">{name}</div>
      <ul className="list-disc pl-5 space-y-1">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
