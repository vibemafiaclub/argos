"""persuasion-review 설득력 시뮬 오케스트레이터.

페르소나 하나에 대해 5a ~ 5e 단계를 순차/병렬로 실행한다.

Usage:
    python scripts/run_simulation.py \\
        --persona-id fintech-startup-cto-01 \\
        --value-prop runs/<run_id>/value_proposition.md \\
        --run-id fintech-startup-cto-01_20260422_153000 \\
        --max-parallel 4
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from session_runner import SessionResult, parse_frontmatter, run_session


SKILL_DIR = Path(__file__).resolve().parent.parent
PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


# ============================================================
# Helpers
# ============================================================

def clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def load_persona(persona_id: str) -> tuple[dict, Path]:
    profile_path = SKILL_DIR / "personas" / persona_id / "profile.md"
    if not profile_path.exists():
        raise FileNotFoundError(f"persona not found: {profile_path}")
    content = profile_path.read_text(encoding="utf-8")
    meta, _ = parse_frontmatter(content)
    return meta, profile_path


def write_run_meta(run_dir: Path, run_meta: dict) -> None:
    content = "---\n" + yaml.dump(run_meta, allow_unicode=True, sort_keys=False) + "---\n"
    (run_dir / "run.md").write_text(content, encoding="utf-8")


def summarize_result(r: SessionResult) -> str:
    if not r.ok:
        return f"ERROR({r.error})"
    return f"{r.decision}@{r.confidence}"


def build_inputs_block(paths: list[Path]) -> str:
    lines = ["먼저 아래 파일들을 Read 도구로 읽어라:"]
    for p in paths:
        lines.append(f"- {p}")
    return "\n".join(lines)


async def run_in_executor(sem: asyncio.Semaphore, fn, *args, **kwargs) -> SessionResult:
    """세마포어로 동시 실행량 제한하면서 블로킹 함수를 executor에 위임."""
    async with sem:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))


# ============================================================
# Stage 5a — keyman 초기 판단
# ============================================================

def stage_5a(
    persona_id: str,
    persona_path: Path,
    value_prop_path: Path,
    run_dir: Path,
    run_id: str,
) -> SessionResult:
    output_path = run_dir / "01_keyman_initial.md"
    task = f"""{build_inputs_block([persona_path, value_prop_path])}

당신은 위 페르소나의 keyman(actor_id: km)이다. 세일즈맨이 전달한 가치제안 문서를 비판적으로 검토하고, system prompt의 판정 규칙대로 판단을 내려라.

run_id: {run_id}
출력 파일 경로 (Write 도구로 저장): {output_path}
"""
    return run_session(
        system_prompt_path=PROMPTS_DIR / "keyman_initial.md",
        task_prompt=task,
        output_path=output_path,
    )


# ============================================================
# Stage 5b — 직접 stakeholder 병렬 검토
# ============================================================

async def stage_5b(
    persona_id: str,
    persona_path: Path,
    persona_meta: dict,
    value_prop_path: Path,
    run_dir: Path,
    run_id: str,
    keyman_initial_path: Path,
    max_parallel: int,
) -> list[tuple[dict, SessionResult]]:
    direct = [
        s for s in persona_meta.get("stakeholders", [])
        if s.get("relation_to_keyman") == "direct"
    ]
    if not direct:
        return []

    sem = asyncio.Semaphore(max_parallel)

    def run_one(sh: dict) -> SessionResult:
        sid = sh["id"]
        output_path = run_dir / f"02_stakeholder_{sid}.md"
        task = f"""{build_inputs_block([persona_path, value_prop_path, keyman_initial_path])}

당신은 위 페르소나의 stakeholder이다.
- actor_id: {sid}
- role: {sh.get('role')}
- mode: direct (5b)

판정 규칙: confidence > 70 → accept, 그 외 → drop.

keyman이 `01_keyman_initial.md`에서 당신에게 전달한 요약과 원문(가치제안 문서)을 모두 읽고 본인 전문성 관점에서 비판적으로 판단하라.

run_id: {run_id}
round: 1
출력 파일 경로: {output_path}
"""
        return run_session(
            system_prompt_path=PROMPTS_DIR / "stakeholder_review.md",
            task_prompt=task,
            output_path=output_path,
        )

    async def wrap(sh: dict):
        result = await run_in_executor(sem, run_one, sh)
        return sh, result

    return await asyncio.gather(*(wrap(s) for s in direct))


# ============================================================
# Stage 5c — keyman 응답 + stakeholder 재검토 루프
# ============================================================

async def stage_5c_keyman_responses(
    persona_id: str,
    persona_path: Path,
    value_prop_path: Path,
    run_dir: Path,
    run_id: str,
    keyman_initial_path: Path,
    dropped: list[tuple[dict, SessionResult]],
    round_n: int,
    max_parallel: int,
) -> list[tuple[dict, SessionResult]]:
    sem = asyncio.Semaphore(max_parallel)

    def run_one(sh: dict, sh_result: SessionResult) -> SessionResult:
        sid = sh["id"]
        output_path = run_dir / f"03_keyman_response_{sid}_round{round_n}.md"
        task = f"""{build_inputs_block([persona_path, value_prop_path, keyman_initial_path, sh_result.output_path])}

당신은 페르소나의 keyman(actor_id: km)이다.
방금 직접 연결된 stakeholder '{sid}' ({sh.get('role')})가 drop 의견을 보내왔다 (`{sh_result.output_path.name}`).

당신은 drop을 수용할지, 아니면 reconvince(재설득)할지 system prompt의 규칙에 따라 판단하라.
한 번이라도 drop을 내면 전체 run이 종결된다.

run_id: {run_id}
round: {round_n}
출력 파일 경로: {output_path}
"""
        return run_session(
            system_prompt_path=PROMPTS_DIR / "keyman_response.md",
            task_prompt=task,
            output_path=output_path,
        )

    async def wrap(sh: dict, r: SessionResult):
        result = await run_in_executor(sem, run_one, sh, r)
        return sh, result

    return await asyncio.gather(*(wrap(sh, r) for sh, r in dropped))


async def stage_5c_stakeholder_recheck(
    persona_id: str,
    persona_path: Path,
    value_prop_path: Path,
    run_dir: Path,
    run_id: str,
    keyman_initial_path: Path,
    dropped: list[tuple[dict, SessionResult]],
    keyman_responses: list[tuple[dict, SessionResult]],
    round_n: int,
    max_parallel: int,
) -> list[tuple[dict, SessionResult]]:
    sem = asyncio.Semaphore(max_parallel)

    # stakeholder id -> keyman response result
    km_by_sid = {sh["id"]: r for sh, r in keyman_responses}

    def run_one(sh: dict, prev_sh_result: SessionResult) -> SessionResult:
        sid = sh["id"]
        output_path = run_dir / f"04_stakeholder_recheck_{sid}_round{round_n}.md"
        km_resp = km_by_sid.get(sid)
        history = [keyman_initial_path, prev_sh_result.output_path]
        if km_resp is not None:
            history.append(km_resp.output_path)

        task = f"""{build_inputs_block([persona_path, value_prop_path] + history)}

당신은 stakeholder '{sid}' ({sh.get('role')})이다.
당신의 이전 drop 의견(`{prev_sh_result.output_path.name}`)에 대해 keyman이 재설득 메시지를 보내왔다 (`{km_resp.output_path.name if km_resp else 'N/A'}`).

keyman의 재설득이 당신의 걱정을 **구체적 새 근거**로 해소하는지 엄격히 판단하라. 단순 반복이면 confidence를 올리지 마라.
mode: direct (재검토 라운드 {round_n})
판정 규칙: confidence > 70 → accept, 그 외 → drop.

run_id: {run_id}
round: {round_n}
출력 파일 경로: {output_path}
"""
        return run_session(
            system_prompt_path=PROMPTS_DIR / "stakeholder_review.md",
            task_prompt=task,
            output_path=output_path,
        )

    async def wrap(sh: dict, r: SessionResult):
        result = await run_in_executor(sem, run_one, sh, r)
        return sh, result

    return await asyncio.gather(*(wrap(sh, r) for sh, r in dropped))


# ============================================================
# Stage 5d — downstream BFS
# ============================================================

async def stage_5d(
    persona_id: str,
    persona_path: Path,
    persona_meta: dict,
    value_prop_path: Path,
    run_dir: Path,
    run_id: str,
    keyman_initial_path: Path,
    direct_final_results: dict[str, Path],  # sid -> latest result path
    max_parallel: int,
) -> dict[str, SessionResult]:
    stakeholders = persona_meta.get("stakeholders", [])
    sh_map = {s["id"]: s for s in stakeholders}

    # Build reverse-parent map: for each downstream node, list upstream ids that connect to it
    parents_of: dict[str, list[str]] = {}
    for s in stakeholders:
        for c in s.get("connected_to", []) or []:
            tid = c.get("id") if isinstance(c, dict) else None
            if tid:
                parents_of.setdefault(tid, []).append(s["id"])

    # Result paths for all processed nodes (direct + downstream visited)
    result_paths: dict[str, Path] = dict(direct_final_results)
    results_by_sid: dict[str, SessionResult] = {}

    visited: set[str] = set(direct_final_results.keys())
    current_layer: set[str] = set(direct_final_results.keys())

    sem = asyncio.Semaphore(max_parallel)

    while current_layer:
        # Collect next layer: unvisited downstream nodes that are connected from any current layer node
        next_layer: set[str] = set()
        for sid in current_layer:
            sh = sh_map.get(sid)
            if not sh:
                continue
            for c in sh.get("connected_to", []) or []:
                tid = c.get("id") if isinstance(c, dict) else None
                if not tid or tid in visited:
                    continue
                target = sh_map.get(tid)
                if not target:
                    continue
                if target.get("relation_to_keyman") != "downstream":
                    continue
                next_layer.add(tid)

        if not next_layer:
            break

        def run_one(tid: str) -> tuple[str, SessionResult]:
            sh = sh_map[tid]
            parent_ids = [p for p in parents_of.get(tid, []) if p in result_paths]
            upstream_paths = [keyman_initial_path] + [result_paths[p] for p in parent_ids]

            output_path = run_dir / f"05_staff_{tid}.md"
            task = f"""{build_inputs_block([persona_path, value_prop_path] + upstream_paths)}

당신은 페르소나의 downstream 실무자 stakeholder이다.
- actor_id: {tid}
- role: {sh.get('role')}
- mode: staff (5d)

keyman 및 상위 stakeholder들과 오간 커뮤니케이션(위 파일들)을 읽고, 본인 실무 관점에서 비판적으로 판단하라.

판정 규칙 (4단계):
- confidence < 35 → reject
- 35 <= confidence < 50 → critical_accept
- 50 <= confidence < 75 → accept
- confidence >= 75 → positive_accept

run_id: {run_id}
round: 1
출력 파일 경로: {output_path}
"""
            res = run_session(
                system_prompt_path=PROMPTS_DIR / "stakeholder_review.md",
                task_prompt=task,
                output_path=output_path,
            )
            return tid, res

        async def wrap(tid: str):
            return await run_in_executor(sem, run_one, tid)

        layer_results = await asyncio.gather(*(wrap(t) for t in next_layer))

        for tid, res in layer_results:
            visited.add(tid)
            result_paths[tid] = res.output_path
            results_by_sid[tid] = res

        current_layer = next_layer

    return results_by_sid


# ============================================================
# Stage 5e — 최종 리포트
# ============================================================

def stage_5e_report(
    persona_id: str,
    persona_path: Path,
    run_dir: Path,
    run_id: str,
    failure_reason: str | None,
) -> SessionResult:
    report_path = run_dir / "report.md"
    task = f"""다음 디렉토리의 모든 세션 출력 파일을 Read 도구로 읽고 종합 분석하라:

- run 디렉토리: {run_dir}
- 페르소나 프로파일: {persona_path}

읽어야 할 파일 패턴:
- {run_dir}/01_keyman_initial.md
- {run_dir}/02_stakeholder_*.md
- {run_dir}/03_keyman_response_*_round*.md
- {run_dir}/04_stakeholder_recheck_*_round*.md
- {run_dir}/05_staff_*.md

(존재하지 않는 패턴은 건너뛰어라. `run.md`는 run 메타데이터일 뿐이니 읽어도 무방.)

system prompt의 규칙에 따라 최종 판정·실행 리스크·공통 우려 패턴·페르소나 보정 힌트를 작성하라.

참고: 오케스트레이터가 판단한 failure_reason 힌트: `{failure_reason or 'null'}`

run_id: {run_id}
persona_id: {persona_id}
출력 파일 경로: {report_path}
"""
    return run_session(
        system_prompt_path=PROMPTS_DIR / "final_analyzer.md",
        task_prompt=task,
        output_path=report_path,
        timeout_sec=900,
    )


# ============================================================
# Orchestrator
# ============================================================

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--persona-id", required=True)
    parser.add_argument("--value-prop", required=True, help="value_proposition.md 경로")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--max-parallel", type=int, default=4)
    args = parser.parse_args()

    persona_meta, persona_path = load_persona(args.persona_id)
    run_dir = SKILL_DIR / "runs" / args.run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    value_prop_path = Path(args.value_prop).resolve()
    if not value_prop_path.exists():
        print(f"ERROR: value_prop not found: {value_prop_path}", file=sys.stderr)
        return 2

    # run 메타 저장
    run_meta = {
        "run_id": args.run_id,
        "persona_id": args.persona_id,
        "persona_version": persona_meta.get("version"),
        "value_prop_path": str(value_prop_path),
        "started_at": now_iso(),
        "max_parallel": args.max_parallel,
    }
    write_run_meta(run_dir, run_meta)

    failure_reason: str | None = None

    # ---- 5a
    print(f"[5a] keyman initial 판단 …", flush=True)
    r5a = stage_5a(args.persona_id, persona_path, value_prop_path, run_dir, args.run_id)
    print(f"     → {summarize_result(r5a)}", flush=True)

    if not r5a.ok:
        print(f"     ERROR: {r5a.error}\n{r5a.stderr}", file=sys.stderr)
        failure_reason = "keyman_session_error"
    elif r5a.decision == "drop" or r5a.confidence <= 75:
        failure_reason = "keyman_drop"

    if failure_reason is not None:
        print(f"[5e] 최종 리포트 생성 (조기 종결: {failure_reason}) …", flush=True)
        report = stage_5e_report(args.persona_id, persona_path, run_dir, args.run_id, failure_reason)
        print(f"     → {summarize_result(report)} @ {report.output_path}", flush=True)
        return 0

    # ---- 5b
    print(f"[5b] 직접 stakeholder 병렬 검토 …", flush=True)
    sh_results = asyncio.run(stage_5b(
        args.persona_id, persona_path, persona_meta, value_prop_path, run_dir,
        args.run_id, r5a.output_path, args.max_parallel,
    ))
    for sh, r in sh_results:
        print(f"     - {sh['id']}: {summarize_result(r)}", flush=True)

    # direct stakeholder별 최종 결과 경로 (5d에서 사용). 초기값은 5b.
    direct_final_paths: dict[str, Path] = {sh["id"]: r.output_path for sh, r in sh_results}

    # 5b 기준 drop 판정
    def is_drop(r: SessionResult) -> bool:
        return (not r.ok) or r.decision == "drop" or r.confidence <= 70

    dropped = [(sh, r) for sh, r in sh_results if is_drop(r)]

    # ---- 5c (필요 시)
    if dropped:
        trust = persona_meta.get("trust_with_salesman") or 0
        try:
            trust_int = int(trust)
        except (TypeError, ValueError):
            trust_int = 0
        M = clamp(round(trust_int / 33), 1, 3)
        print(f"[5c] 재설득 루프 시작. trust_with_salesman={trust_int}, max_rounds={M}", flush=True)

        still_dropped = dropped
        for round_n in range(1, M + 1):
            print(f"  round {round_n} / {M}: keyman 응답 …", flush=True)
            km_responses = asyncio.run(stage_5c_keyman_responses(
                args.persona_id, persona_path, value_prop_path, run_dir, args.run_id,
                r5a.output_path, still_dropped, round_n, args.max_parallel,
            ))
            for sh, r in km_responses:
                print(f"     - keyman→{sh['id']}: {summarize_result(r)}", flush=True)

            any_keyman_drop = any(r.decision == "drop" for _, r in km_responses)
            if any_keyman_drop:
                print(f"  → keyman이 drop 선택. run 종결.", flush=True)
                failure_reason = "keyman_gives_up"
                break

            # 모두 reconvince → stakeholder 재검토
            print(f"  round {round_n}: stakeholder 재검토 …", flush=True)
            recheck = asyncio.run(stage_5c_stakeholder_recheck(
                args.persona_id, persona_path, value_prop_path, run_dir, args.run_id,
                r5a.output_path, still_dropped, km_responses, round_n, args.max_parallel,
            ))
            for sh, r in recheck:
                print(f"     - {sh['id']}: {summarize_result(r)}", flush=True)

            # 재검토 결과로 direct_final_paths 갱신
            for sh, r in recheck:
                if r.ok:
                    direct_final_paths[sh["id"]] = r.output_path

            still_dropped = [(sh, r) for sh, r in recheck if is_drop(r)]
            if not still_dropped:
                print(f"  → round {round_n} 이후 drop 없음. 5d로 진행.", flush=True)
                break

        if failure_reason is None and still_dropped:
            print(f"  → max_rounds 도달 후에도 drop 잔존 ({len(still_dropped)}명). run 종결.", flush=True)
            failure_reason = "stakeholders_persist_drop"

    if failure_reason is not None:
        print(f"[5e] 최종 리포트 생성 (조기 종결: {failure_reason}) …", flush=True)
        report = stage_5e_report(args.persona_id, persona_path, run_dir, args.run_id, failure_reason)
        print(f"     → {summarize_result(report)} @ {report.output_path}", flush=True)
        return 0

    # ---- 5d
    print(f"[5d] downstream BFS …", flush=True)
    staff_results = asyncio.run(stage_5d(
        args.persona_id, persona_path, persona_meta, value_prop_path, run_dir, args.run_id,
        r5a.output_path, direct_final_paths, args.max_parallel,
    ))
    for sid, r in staff_results.items():
        print(f"     - {sid}: {summarize_result(r)}", flush=True)

    # ---- 5e
    print(f"[5e] 최종 리포트 생성 …", flush=True)
    report = stage_5e_report(args.persona_id, persona_path, run_dir, args.run_id, None)
    print(f"     → {summarize_result(report)} @ {report.output_path}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
