import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function Home() {
  const session = await auth();
  const isLoggedIn = !!session;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/argos-logo.svg"
              alt="Argos"
              width={28}
              height={28}
              priority
              className="rounded-md"
            />
            <span className="text-lg font-semibold tracking-tight">Argos</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              analytics for Claude Code teams
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Privacy
            </Link>
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className={buttonVariants({ size: "sm" })}
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className={buttonVariants({ size: "sm", variant: "ghost" })}
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className={buttonVariants({ size: "sm" })}
                >
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
          <h1 className="text-5xl font-semibold tracking-tight leading-tight max-w-3xl">
            Analytics for
            <br />
            <span className="text-brand">Your Claude Code.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            토큰 사용량, 자주 쓰는 스킬과 에이전트, 반복 실패 지점까지 한번에
            모아보세요.
            <br />
            먼저 측정해야, 관리할 수 있습니다.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Link
              href={isLoggedIn ? "/dashboard" : "/register"}
              className={buttonVariants({ size: "lg" })}
            >
              {isLoggedIn ? "Go to dashboard" : "Get started"}
            </Link>
            <a
              href="#install"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              어떻게 동작하나요?
            </a>
          </div>
          <p className="text-sm text-muted-foreground pt-1">
            가입 → 프롬프트 복사 → Claude Code에 붙여넣기. 터미널 명령어 타이핑 0개.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center rounded-full bg-brand-subtle text-brand px-3 py-1 text-xs font-medium">
              무료로 시작
            </span>
            <span className="inline-flex items-center rounded-full bg-brand-subtle text-brand px-3 py-1 text-xs font-medium">
              오픈소스 (MIT)
            </span>
            <span className="inline-flex items-center rounded-full bg-brand-subtle text-brand px-3 py-1 text-xs font-medium">
              자체호스팅 가능
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            신용카드 필요 없음
          </p>
        </section>

        {/* Section 2: Screenshots / product peek */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">대시보드 미리보기</h2>
            <span className="text-xs text-muted-foreground">스크린샷</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { title: "Overview", desc: "세션·유저·토큰 사용량 요약" },
              { title: "Sessions", desc: "세션별 타임라인과 전사" },
              { title: "Skills", desc: "스킬별 호출량과 최근 사용" },
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

        {/* Section 3: Who is this for? */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">이런 분들에게 잘 맞습니다</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <PersonaCard
              badge="관리자"
              title="우리 팀 토큰, 효율적으로 쓰고 있을까?"
              body="팀·프로젝트 단위 토큰 사용량을 실시간으로 확인하고, 과도하게 사용되는 지점을 빠르게 찾아냅니다."
            />
            <PersonaCard
              badge="실무자"
              title="다들 어떻게 쓰고 있지?"
              body="다른 팀원의 프롬프트, 자주 쓰는 스킬을 확인할 수 있습니다. 잘 쓰지 않는 스킬은 개선하거나 제거하는 근거로 삼을 수 있죠."
            />
            <PersonaCard
              badge="플랫폼 · 보안팀"
              title="거버넌스는 어떻게 하지?"
              body="모든 프롬프트/활동을 기록하고, 문제가 되는 사용패턴을 빠르게 찾아낼 수 있습니다. 자체호스팅으로 보안까지 보장합니다."
            />
            <PersonaCard
              badge="1인 인디해커"
              title="내 바이브코딩, 뭘 개선해야 할까?"
              body="혼자 Claude Code로 제품을 만드는 분에게도 그대로 작동합니다. 토큰을 어디에 태우는지, 어떤 루프에서 실패가 반복되는지 세션 단위로 돌아볼 수 있습니다. 자체호스팅하면 내 프롬프트는 내 머신에만 남습니다."
            />
          </div>
        </section>

        {/* Section 4: What we collect (summary) */}
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
              />
              <CollectItem
                label="대화 전사"
                body="세션 종료 시 HUMAN / ASSISTANT / TOOL 메시지 전체. 각 메시지 최대 50,000자, 요약 최대 10,000자."
              />
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            전문은{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            에서 확인할 수 있습니다. 자체호스팅 시 데이터는 조직 인프라를
            벗어나지 않습니다.
          </p>
        </section>

        {/* Section 5: With Argos vs Without Argos */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              Argos가 있을 때 vs 없을 때
            </h2>
            <p className="text-sm text-muted-foreground">
              똑같이 Claude Code를 쓰는데, 팀이 보는 풍경은 이만큼 달라집니다.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Card size="sm">
              <CardContent className="space-y-3 py-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  NO Argos
                </div>
                <ul className="space-y-3">
                  <CompareRow
                    tone="off"
                    body="누가 토큰을 얼마나 태웠는지 알 길이 없다"
                  />
                  <CompareRow
                    tone="off"
                    body="팀원별 사용량은 각자에게 일일이 물어본다"
                  />
                  <CompareRow
                    tone="off"
                    body="스킬·에이전트들이 잘 쓰이고 있는지 감으로 추측"
                  />
                  <CompareRow
                    tone="off"
                    body="실패한 세션은 당사자 터미널에서만 확인 가능"
                  />
                  <CompareRow
                    tone="off"
                    body="온보딩 팀원은 선배의 프롬프트를 어깨너머로 학습"
                  />
                </ul>
              </CardContent>
            </Card>
            <Card size="sm" className="ring-brand/40 bg-card-elevated">
              <CardContent className="space-y-3 py-2">
                <div className="text-xs uppercase tracking-wider text-brand">
                  With Argos
                </div>
                <ul className="space-y-3">
                  <CompareRow
                    tone="on"
                    body="실시간 토큰 사용 대시보드, 주·월 단위 추세 조회"
                  />
                  <CompareRow
                    tone="on"
                    body="팀원·프로젝트별 사용량을 한 화면에서 비교"
                  />
                  <CompareRow
                    tone="on"
                    body="사용 데이터 가시화, 안 쓰이는 스킬 개선 또는 제거"
                  />
                  <CompareRow
                    tone="on"
                    body="모든 세션 타임라인을 팀이 열람·공유"
                  />
                  <CompareRow
                    tone="on"
                    body="숙련자 팀원의 세션을 참고하여 다 함께 성장"
                  />
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 6: Install */}
        <section id="install" className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">어떻게 동작하나요?</h2>
            <p className="text-sm text-muted-foreground">
              가입하면 전용 세팅 프롬프트가 발급됩니다. Claude Code에 한 번
              붙여넣으면 끝.
            </p>
          </div>
          <Card>
            <CardContent className="space-y-3">
              <InstallStep
                n={1}
                label="가입"
                body="이메일로 가입하면 1회용·1시간 수명의 세팅 프롬프트가 발급됩니다."
              />
              <InstallStep
                n={2}
                label="새 프로젝트 최초 연결"
                body="발급된 프롬프트를 복사해 새로 추적할 프로젝트 루트의 Claude Code 세션에 붙여넣으면 CLI 설치 · 조직 · 프로젝트 · hook 설치가 자동 진행됩니다."
                preview={`npm install -g argos-ai@latest && argos setup --token=argos_onb_•••`}
              />
              <InstallStep
                n={3}
                label="팀원 자동 합류"
                body="저장소에 .argos/project.json 과 .claude/settings.json 을 커밋하면, 팀원은 clone 후 repo 루트에서 argos 한 번만 실행해 기존 프로젝트에 합류합니다."
              />
            </CardContent>
          </Card>
        </section>

        {/* Section 7: FAQ */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">자주 묻는 질문</h2>
            <p className="text-sm text-muted-foreground">
              도입 전에 팀이 가장 많이 묻는 것들.
            </p>
          </div>
          <Card>
            <CardContent className="py-1">
              <FaqItem
                q="가입 후 받는 세팅 프롬프트는 안전한가요?"
                a="프롬프트 안의 토큰은 발급 후 1시간만 유효하고, Claude Code가 1번 사용하면 즉시 폐기됩니다. 프롬프트 자체가 유출되더라도 교환 유효기간이 지났거나 이미 소비된 토큰은 아무 일도 일으킬 수 없습니다. 교환 이후 실제 인증에 쓰이는 토큰은 로컬 ~/.argos/config.json 에만 저장됩니다."
              />
              <FaqItem
                q="프롬프트 원문이 서버로 전송되나요?"
                a="세션 종료 시 HUMAN / ASSISTANT / TOOL 메시지 전체가 서버로 전송됩니다. 각 메시지 최대 50,000자에서 절단됩니다. 민감한 프롬프트를 다루는 환경이라면 자체호스팅을 권장합니다."
              />
              <FaqItem
                q="Anthropic API 키나 토큰이 수집되나요?"
                a="아니오. Argos는 Claude Code 훅 이벤트만 받습니다. Anthropic API 키, 시스템 환경변수, OAuth 토큰은 수집 대상이 아닙니다."
              />
              <FaqItem
                q="팀원이 제 세션 내용을 볼 수 있나요?"
                a="같은 조직의 구성원은 대시보드에서 조직 내 세션을 열람할 수 있습니다. 팀 학습·코드리뷰를 염두에 둔 기본값이며, 조직 권한 모델로 제어할 수 있습니다."
              />
              <FaqItem
                q="자체호스팅은 어떻게 하나요?"
                a="저장소를 클론하고 PostgreSQL 1개, 앱 컨테이너 1개만 올리면 됩니다. Docker Compose 예제를 제공합니다. CLI의 API URL만 자체 도메인으로 바꾸면 데이터가 조직 인프라를 벗어나지 않습니다."
              />
              <FaqItem
                q="가격은 얼마인가요?"
                a="오픈소스(MIT)입니다. 자체호스팅은 무료, 관리형 클라우드는 향후 팀 규모에 맞춘 플랜을 계획 중입니다. 현재는 가입 후 바로 사용 가능합니다."
              />
              <FaqItem
                q="CI/CD나 headless 환경에서도 동작하나요?"
                a="동작합니다. Claude Code가 돌아가는 어떤 환경이든 훅이 실행되면 이벤트를 보냅니다. CI 러너, GitHub Actions, 로컬 개발자 머신 모두에서 동일한 대시보드로 모입니다."
              />
              <FaqItem
                q="토큰 사용량만 보고 싶다면 ccusage 같은 OSS CLI로 충분하지 않나요?"
                a="토큰 합계만 보려면 CLI로도 충분합니다. Argos는 그 위에 세션 타임라인 재생, 실패 구간 하이라이팅, 스킬·에이전트 호출 패턴 시각화, 세션별 전사 조회까지 제공합니다. '얼마 썼는지'가 아니라 '어디서 태웠고, 어디서 깨졌고, 뭐가 반복되는지'를 눈으로 추적하고 싶다면 CLI는 부족합니다. 자체호스팅하면 데이터도 외부로 나가지 않습니다."
              />
              <FaqItem
                q="자체 대시보드를 직접 구축하는 것 대비 이점은?"
                a="Argos는 Claude Code 훅 스키마·세션 재조립·스킬 집계·토큰 회계를 이미 내장하고 있습니다. 자체 구축 시 데이터 파이프라인·UI·유지보수를 1~3개월 단위로 안고 가야 하며, 그 사이 Claude Code의 훅 포맷 변경을 따라가야 합니다. MIT 라이선스라 필요하면 포크해서 원하는 대로 커스터마이징할 수도 있습니다."
              />
            </CardContent>
          </Card>
        </section>

        {/* Section 8: Why we built this */}
        <section className="space-y-3 max-w-3xl">
          <h2 className="text-xl font-semibold">왜 이걸 만들었나</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            팀 차원에서 Claude Code를 사용해보니, 여러 문제가 있었습니다.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2 leading-relaxed">
              <span
                className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-brand"
                aria-hidden
              />
              <span>잘 쓰는 사람과 그렇지 않은 사람의 편차가 커졌습니다.</span>
            </li>
            <li className="flex gap-2 leading-relaxed">
              <span
                className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-brand"
                aria-hidden
              />
              <span>
                누군가 추가한 스킬이 공유되지 않고 혼자만 쓰거나, 그대로
                버려지는 경우가 많았습니다.
              </span>
            </li>
            <li className="flex gap-2 leading-relaxed">
              <span
                className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-brand"
                aria-hidden
              />
              <span>
                우리가 팀 차원에서 AI를 잘 쓰고 있는지 누구도 파악할 수
                없었습니다.
              </span>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            그래서 대시보드를 직접 만들었습니다. 같은 고민을 하는 팀들을 위해
            오픈소스로 공개합니다.
          </p>
        </section>

        {/* Section 9: Final CTA */}
        <section>
          <Card className="bg-card-elevated">
            <CardContent className="py-8 text-center space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight">
                Claude Code 사용 패턴을 파악하고, 개선하세요.
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                새 프로젝트는 Claude Code에 프롬프트 하나를 붙여넣어 연결하세요.
                팀원은 저장소를 clone한 뒤 argos 한 번으로 합류합니다.
              </p>
              <div className="flex flex-wrap gap-2 justify-center pt-2">
                <Link
                  href={isLoggedIn ? "/dashboard" : "/register"}
                  className={buttonVariants({ size: "lg" })}
                >
                  {isLoggedIn ? "Go to dashboard" : "Get started"}
                </Link>
                <a
                  href="https://github.com/vibemafiaclub/argos"
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ size: "lg", variant: "outline" })}
                >
                  Star on GitHub
                </a>
              </div>
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
              href="https://github.com/vibemafiaclub/argos"
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
  );
}

function CollectItem({
  label,
  body,
  warn,
}: {
  label: string;
  body: string;
  warn?: string;
}) {
  return (
    <div className="grid gap-1 py-2 border-b border-border last:border-b-0">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-sm text-muted-foreground leading-relaxed">
        {body}
      </div>
      {warn && (
        <div className="mt-1 text-xs text-danger/90 leading-relaxed">
          ⚠ {warn}
        </div>
      )}
    </div>
  );
}

function InstallStep({
  n,
  label,
  body,
  preview,
}: {
  n: number;
  label: string;
  body: string;
  preview?: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-brand-subtle text-brand text-xs flex items-center justify-center font-medium tabular-nums">
        {n}
      </div>
      <div className="flex-1 space-y-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-sm text-muted-foreground leading-relaxed">
          {body}
        </div>
        {preview && (
          <pre className="mt-2 bg-muted text-foreground/90 rounded-md px-3 py-2 text-xs font-mono whitespace-pre overflow-x-auto">
            {preview}
          </pre>
        )}
      </div>
    </div>
  );
}

function PersonaCard({
  badge,
  title,
  body,
}: {
  badge: string;
  title: string;
  body: string;
}) {
  return (
    <Card size="sm" className="h-full">
      <CardContent className="space-y-2 py-2">
        <div className="inline-flex items-center rounded-full bg-brand-subtle text-brand px-2 py-0.5 text-xs font-medium">
          {badge}
        </div>
        <div className="text-base font-medium">{title}</div>
        <div className="text-sm text-muted-foreground leading-relaxed">
          {body}
        </div>
      </CardContent>
    </Card>
  );
}

function CompareRow({ tone, body }: { tone: "on" | "off"; body: string }) {
  const isOn = tone === "on";
  return (
    <li className="flex gap-2 text-sm">
      <span
        className={
          isOn
            ? "flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-brand-subtle text-brand text-[10px] flex items-center justify-center"
            : "flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] flex items-center justify-center"
        }
        aria-hidden
      >
        {isOn ? "✓" : "×"}
      </span>
      <span
        className={
          isOn
            ? "text-foreground leading-relaxed"
            : "text-muted-foreground leading-relaxed"
        }
      >
        {body}
      </span>
    </li>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-border last:border-b-0 py-3">
      <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium list-none [&::-webkit-details-marker]:hidden">
        <span>{q}</span>
        <span className="flex-shrink-0 text-muted-foreground text-lg leading-none transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="pt-2 pr-8 text-sm text-muted-foreground leading-relaxed">
        {a}
      </div>
    </details>
  );
}
