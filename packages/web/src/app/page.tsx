import Link from 'next/link'
import { auth } from '@/auth'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default async function Home() {
  const session = await auth()
  const isLoggedIn = !!session

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">Argos</span>
            <span className="text-xs text-muted-foreground">observability for Claude Code teams</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            {isLoggedIn ? (
              <Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
                  Sign in
                </Link>
                <Link href="/register" className={buttonVariants({ size: 'sm' })}>
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16 space-y-20">
        {/* Section 1: Value prop */}
        <section className="space-y-6">
          <h1 className="text-4xl font-semibold tracking-tight leading-tight max-w-3xl">
            팀이 쓰는 Claude Code를 <span className="text-brand">한 화면에서</span> 본다.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            누가 얼마나 쓰는지, 어떤 스킬과 에이전트가 반복 호출되는지, 세션이 어디서 멈추는지.
            Claude Code 훅 한 번 설치로 팀 전체 사용 현황을 대시보드에 모읍니다.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Link
              href={isLoggedIn ? '/dashboard' : '/register'}
              className={buttonVariants({ size: 'lg' })}
            >
              {isLoggedIn ? 'Go to dashboard' : 'Get started'}
            </Link>
            <a href="#install" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              Install in 30s
            </a>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-sm text-muted-foreground">
            <span>✓ 팀원 1명당 토큰·비용 집계</span>
            <span>✓ 스킬 / 에이전트 호출 추적</span>
            <span>✓ 세션 타임라인 & 전사(transcript)</span>
            <span>✓ 자체호스팅 가능 (MIT)</span>
          </div>
        </section>

        {/* Section 2: Screenshots / product peek */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">대시보드 미리보기</h2>
            <span className="text-xs text-muted-foreground">스크린샷</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { title: 'Overview', desc: '세션·유저·토큰·비용 요약' },
              { title: 'Sessions', desc: '세션별 타임라인과 전사' },
              { title: 'Skills', desc: '스킬별 호출량과 최근 사용' },
            ].map((s) => (
              <Card key={s.title} size="sm" className="aspect-[4/3]">
                <CardContent className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                  <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    screenshot placeholder
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Section 3: What we collect (summary) */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">수집하는 데이터</h2>
            <p className="text-sm text-muted-foreground">
              감추지 않습니다. 훅이 발사될 때 서버로 전송되는 항목 전부입니다.
            </p>
          </div>
          <Card>
            <CardContent className="space-y-4 py-2">
              <CollectItem
                label="세션 메타"
                body="세션 ID, 시작/종료 시각, 프로젝트·조직 식별자, 사용자 이메일·ID"
              />
              <CollectItem
                label="토큰 사용량"
                body="입력/출력/캐시 생성/캐시 조회 토큰, 모델명, 턴별 분포, 추정 비용(USD)"
              />
              <CollectItem
                label="도구 호출"
                body="툴 이름, 툴 입력(toolInput) 및 응답(toolResponse, 2,000자에서 절단)"
                warn="toolInput은 절단 없이 원문 전송 — 민감 파일 경로·비밀키 포함 여부를 사용자가 관리해야 합니다."
              />
              <CollectItem
                label="대화 전사"
                body="세션 종료 시 HUMAN / ASSISTANT / TOOL 메시지 전체. 각 메시지 최대 50,000자, 요약 최대 10,000자."
                warn="조직에 소속된 팀원이 대시보드에서 열람할 수 있습니다."
              />
              <CollectItem
                label="로컬 저장"
                body="~/.argos/config.json (JWT, 이메일, API URL), .argos/project.json (프로젝트 ID, 커밋 대상), .claude/settings.json 훅 항목 (커밋 대상)"
              />
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            전문은{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            에서 확인할 수 있습니다. 자체호스팅 시 데이터는 조직 인프라를 벗어나지 않습니다.
          </p>
        </section>

        {/* Section 4: Install */}
        <section id="install" className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">30초 설치</h2>
            <p className="text-sm text-muted-foreground">
              가입 후 프로젝트 루트에서 실행하세요. 팀원은 같은 저장소에서 <code className="text-foreground">argos</code>만 실행하면 자동 합류합니다.
            </p>
          </div>
          <Card>
            <CardContent className="space-y-3">
              <InstallStep n={1} label="CLI 설치" cmd="npm install -g @argos-ai/cli" />
              <InstallStep n={2} label="로그인 & 프로젝트 초기화" cmd="cd your-project && argos" />
              <InstallStep
                n={3}
                label="팀 저장소에 커밋"
                cmd={'git add .argos/project.json .claude/settings.json\ngit commit -m "chore: add argos tracking"'}
              />
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Argos · MIT License</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <a
              href="https://github.com/your-org/argos"
              className="hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function CollectItem({ label, body, warn }: { label: string; body: string; warn?: string }) {
  return (
    <div className="grid gap-1 py-2 border-b border-border last:border-b-0">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-sm text-muted-foreground leading-relaxed">{body}</div>
      {warn && (
        <div className="mt-1 text-xs text-danger/90 leading-relaxed">⚠ {warn}</div>
      )}
    </div>
  )
}

function InstallStep({ n, label, cmd }: { n: number; label: string; cmd: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-brand-subtle text-brand text-xs flex items-center justify-center font-medium tabular-nums">
        {n}
      </div>
      <div className="flex-1 space-y-1">
        <div className="text-sm font-medium">{label}</div>
        <pre className="bg-muted text-foreground/90 rounded-md px-3 py-2 text-xs font-mono whitespace-pre overflow-x-auto">
          {cmd}
        </pre>
      </div>
    </div>
  )
}
