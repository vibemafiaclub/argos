# Argos

Observability for AI-native engineering teams using Claude Code.

Track token consumption, skill/agent invocations, and session activity across your team — all in one dashboard.

## What it does

- **Per-user token tracking** — see who's consuming what, and what it costs
- **Skill usage analytics** — which skills are getting used, which are being ignored
- **Agent/subagent tracking** — every Agent tool call recorded with type and description
- **Session history** — full timeline of Claude Code activity per project
- **Team dashboard** — aggregate view across all developers on a project

## How it works

1. Developers run `argos login` once → GitHub OAuth → JWT stored locally
2. `argos init` in a repo → injects Claude Code hooks into `.claude/settings.json`
3. Every Claude Code tool call fires `argos hook` → event sent to Argos API
4. Team sees everything in the web dashboard

## Setup

```bash
npm install -g argos-cc

argos login          # GitHub OAuth
argos init           # in your project root
git add .argos/project.json .claude/settings.json
git commit -m "chore: add argos tracking"
```

Everyone who pulls the repo and runs `argos login` is automatically tracked.

## Self-hosting

```bash
git clone https://github.com/vibemafiaclub/argos
cd argos
docker-compose up
```

Set `apiUrl` in `.argos/project.json` to point to your instance.

## Architecture

See `docs/ARCHITECTURE.md` for full system design.

## Development

See `docs/IMPLEMENTATION_GUIDE.md` for setup instructions.

## License

MIT
