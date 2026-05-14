#!/usr/bin/env bash
# strix_quick_gate.sh — CI gate that runs Strix security scans with
# automatic model fallback, transient-error retry, and severity-based
# pass/fail decisions.
#
# STRIX_LOG is a per-attempt temp file consumed only by
# is_transient_same_model_retry_error(); cumulative report dirs in
# STRIX_REPORTS_DIR are never overwritten.  Refer to ARCHITECTURE.md
# for the 3-tier timeout classification hierarchy.
set -euo pipefail

SCRIPT_DIR="$({ CDPATH='' && cd -P -- "$(dirname -- "$0")" && pwd -P; })"
REPO_ROOT="$({ CDPATH='' && cd -P -- "$SCRIPT_DIR/../.." && pwd -P; })"
RAW_TARGET_PATH="${STRIX_TARGET_PATH:-./}"
TARGET_PATH=""
RAW_SCAN_MODE="${STRIX_SCAN_MODE:-quick}"
SCAN_MODE=""
ARTIFACT_REPORTS_DIR="$REPO_ROOT/strix_runs"
STRIX_RUNTIME_DIR="$(mktemp -d /tmp/strix-runtime.XXXXXX)"
STRIX_LOG="$STRIX_RUNTIME_DIR/strix.log"
ACTIVE_REPORTS_DIR="$STRIX_RUNTIME_DIR/reports"
STRIX_REPORTS_DIR="$ACTIVE_REPORTS_DIR"
STRIX_PROCESS_TIMEOUT_SECONDS="${STRIX_PROCESS_TIMEOUT_SECONDS:-1200}"
STRIX_TOTAL_TIMEOUT_SECONDS="${STRIX_TOTAL_TIMEOUT_SECONDS:-0}"
STRIX_PR_SCOPE_MAX_FILES_PER_BATCH="${STRIX_PR_SCOPE_MAX_FILES_PER_BATCH:-20}"
STRIX_DISABLE_PR_SCOPING="${STRIX_DISABLE_PR_SCOPING:-1}"
# shellcheck disable=SC2034  # consumed by sourced normalize_model helper
DEFAULT_PROVIDER_RAW="${STRIX_LLM_DEFAULT_PROVIDER:-}"
# shellcheck disable=SC2034  # consumed indirectly by sourced model helper functions
DEFAULT_PROVIDER=""
LLM_API_BASE_FILE="${LLM_API_BASE_FILE:-}"
STRIX_TRANSIENT_RETRY_PER_MODEL="${STRIX_TRANSIENT_RETRY_PER_MODEL:-0}"
STRIX_TRANSIENT_RETRY_BACKOFF_SECONDS="${STRIX_TRANSIENT_RETRY_BACKOFF_SECONDS:-3}"
STRIX_FAIL_ON_MIN_SEVERITY="${STRIX_FAIL_ON_MIN_SEVERITY:-MEDIUM}"
RUN_START_EPOCH="$(date +%s)"
PREEXISTING_REPORT_DIRS=()
REPO_NAME="${REPO_ROOT##*/}"
# shellcheck source=scripts/ci/strix_model_utils.sh
# shellcheck disable=SC1091  # source path is repo-local; local lint may omit -x
. "$SCRIPT_DIR/strix_model_utils.sh"
# Sticky flag: once ANY attempt encounters an infrastructure error (rate limit,
# LLM connection failure, mid-stream fallback, etc.), this flag stays 1 for
# the rest of the run.  It prevents the "all findings below threshold" bypass
# from masking scan incompleteness — a successful strix run (exit 0) ignores
# this flag because the scan itself produced a complete result set.
INFRA_ERROR_DETECTED=0
ZERO_FINDINGS_REPORTED=0
PR_FINDINGS_DECISION="not_applicable"
CHANGED_FILES=()
PULL_REQUEST_SCOPE_DIRS=()
PULL_REQUEST_SCOPE_FILE_BATCHES=()
CURRENT_PULL_REQUEST_BATCH_FILE_COUNT=0
LAST_PULL_REQUEST_SCOPE_DIR=""
TARGET_PATH_IS_INTERNAL_PR_SCOPE=0

# shellcheck disable=SC2317,SC2329  # invoked from cleanup trap
publish_artifact_reports() {
	if [ -L "$ARTIFACT_REPORTS_DIR" ]; then
		echo "ERROR: artifact reports path must not be a symlink: $ARTIFACT_REPORTS_DIR" >&2
		return 1
	fi
	rm -rf -- "$ARTIFACT_REPORTS_DIR"
	mkdir -p -- "$ARTIFACT_REPORTS_DIR"
	if [ -d "$ACTIVE_REPORTS_DIR" ]; then
		cp -R -- "$ACTIVE_REPORTS_DIR"/. "$ARTIFACT_REPORTS_DIR"/
	fi
}

# shellcheck disable=SC2317,SC2329  # invoked from EXIT/INT/TERM trap
cleanup_runtime() {
	publish_artifact_reports || true
	rm -f "$STRIX_LOG"
	rm -rf "$STRIX_RUNTIME_DIR"
	local scope_dir
	for scope_dir in "${PULL_REQUEST_SCOPE_DIRS[@]}"; do
		if [ -n "$scope_dir" ] && [ -d "$scope_dir" ]; then
			rm -rf -- "$scope_dir"
		fi
	done
}

trap cleanup_runtime EXIT INT TERM

STRIX_LLM_FILE="${STRIX_LLM_FILE:-}"
if [ -z "$STRIX_LLM_FILE" ] || [ ! -f "$STRIX_LLM_FILE" ] || [ -L "$STRIX_LLM_FILE" ]; then
	echo "ERROR: STRIX_LLM_FILE must reference a regular file containing the model." >&2
	exit 2
fi
STRIX_LLM="$(trim_whitespace "$(cat -- "$STRIX_LLM_FILE")")"
if [ -z "$STRIX_LLM" ]; then
	echo "ERROR: STRIX_LLM_FILE must contain a non-empty model value." >&2
	exit 2
fi

LLM_API_KEY_FILE="${LLM_API_KEY_FILE:-}"
if [ -z "$LLM_API_KEY_FILE" ] || [ ! -f "$LLM_API_KEY_FILE" ] || [ -L "$LLM_API_KEY_FILE" ]; then
	echo "ERROR: LLM_API_KEY_FILE must reference a regular file containing the API key." >&2
	exit 2
fi
LLM_API_KEY="$(trim_whitespace "$(cat -- "$LLM_API_KEY_FILE")")"
if [ -z "$LLM_API_KEY" ]; then
	echo "ERROR: LLM_API_KEY_FILE must contain a non-empty API key." >&2
	exit 2
fi

require_non_negative_integer() {
	local value="$1"
	local label="$2"
	if ! [[ "$value" =~ ^[0-9]+$ ]]; then
		echo "ERROR: $label must be a non-negative integer, got '$value'." >&2
		exit 2
	fi
}

require_positive_integer() {
	local value="$1"
	local label="$2"
	require_non_negative_integer "$value" "$label"
	if [ "$value" -le 0 ]; then
		echo "ERROR: $label must be greater than zero, got '$value'." >&2
		exit 2
	fi
	return 0
}

require_safe_scan_mode() {
	local scan_mode="$1"
	if [ -z "$scan_mode" ] || [[ ! "$scan_mode" =~ ^[[:alnum:]_.-]+$ ]]; then
		echo "ERROR: STRIX_SCAN_MODE contains unsupported characters: '$scan_mode'." >&2
		exit 2
	fi
}

validate_raw_target_path_input() {
	local raw_target
	raw_target="$(trim_whitespace "$1")"
	if [ -z "$raw_target" ]; then
		echo "ERROR: STRIX_TARGET_PATH must not be empty." >&2
		return 2
	fi
	if [[ "$raw_target" == -* ]]; then
		echo "ERROR: STRIX_TARGET_PATH contains unsupported path syntax: '$raw_target'." >&2
		return 2
	fi
	case "$raw_target" in
	. | ./ | src | ./src)
		printf '%s\n' "$raw_target"
		return 0
		;;
	*)
		echo "ERROR: STRIX_TARGET_PATH contains unsupported path syntax: '$raw_target'." >&2
		return 2
		;;
	esac
}

normalize_changed_file_path() {
	local changed_file="$1"
	python3 - "$REPO_ROOT" "$changed_file" <<'PY'
from pathlib import Path
import posixpath
import re
import sys

repo_root = Path(sys.argv[1]).resolve(strict=True)
relative_path_str = sys.argv[2]
if "\n" in relative_path_str or "\r" in relative_path_str:
    raise SystemExit(1)
if not relative_path_str:
    raise SystemExit(1)
if relative_path_str != relative_path_str.strip():
    raise SystemExit(1)
if "\x00" in relative_path_str:
    raise SystemExit(1)
if "\\" in relative_path_str:
    raise SystemExit(1)
normalized = posixpath.normpath(relative_path_str)
if normalized in (".", "") or normalized.startswith("../") or normalized == "..":
    raise SystemExit(1)
if not re.fullmatch(r"[A-Za-z0-9_./ -]+", normalized):
    raise SystemExit(1)
relative_path = Path(normalized)
if relative_path.is_absolute():
    raise SystemExit(1)
if any(part in ('', '.', '..') for part in relative_path.parts):
    raise SystemExit(1)
candidate = (repo_root / relative_path).resolve(strict=False)
candidate.relative_to(repo_root)
print(relative_path.as_posix())
PY
}

pull_request_head_blob_required() {
	[ "${GITHUB_EVENT_NAME:-}" = "pull_request_target" ]
}

pr_head_regular_file_mode() {
	local relative_path="$1"
	local head_sha tree_output line_count metadata tree_path mode object_type _object_hash
	head_sha="$(trim_whitespace "${PR_HEAD_SHA:-}")"
	if [ -z "$head_sha" ]; then
		return 2
	fi
	if ! git cat-file -e "$head_sha^{commit}" 2>/dev/null; then
		return 2
	fi
	if ! tree_output="$(git ls-tree "$head_sha" -- "$relative_path")"; then
		return 2
	fi
	if [ -z "$tree_output" ]; then
		return 1
	fi
	line_count="$(printf '%s\n' "$tree_output" | wc -l | tr -d ' ')"
	if [ "$line_count" != "1" ]; then
		return 2
	fi
	IFS=$'\t' read -r metadata tree_path <<<"$tree_output"
	# shellcheck disable=SC2086 # metadata is exactly git ls-tree's mode/type/object tuple.
	read -r mode object_type _object_hash <<<"$metadata"
	if [ "$tree_path" != "$relative_path" ]; then
		return 2
	fi
	if [ "$object_type" != "blob" ]; then
		return 3
	fi
	case "$mode" in
	100644 | 100755)
		printf '%s\n' "$mode"
		return 0
		;;
	*)
		return 3
		;;
	esac
}

changed_file_exists_for_scan() {
	local relative_path="$1"
	if pull_request_head_blob_required; then
		local mode_rc=0
		pr_head_regular_file_mode "$relative_path" >/dev/null || mode_rc=$?
		case "$mode_rc" in
		0)
			return 0
			;;
		1)
			return 1
			;;
		3)
			echo "ERROR: pull request changed file is not a regular PR-head file; failing closed: $relative_path" >&2
			return 2
			;;
		*)
			echo "ERROR: pull request changed file could not be read from PR head; failing closed: $relative_path" >&2
			return 2
			;;
		esac
	fi
	if [ -f "$REPO_ROOT/$relative_path" ] && [ ! -L "$REPO_ROOT/$relative_path" ]; then
		return 0
	fi
	if [ -z "$(trim_whitespace "${PR_HEAD_SHA:-}")" ]; then
		return 1
	fi
	local mode_rc=0
	pr_head_regular_file_mode "$relative_path" >/dev/null || mode_rc=$?
	case "$mode_rc" in
	0)
		return 0
		;;
	2)
		return 2
		;;
	3)
		echo "ERROR: pull request changed file is not a regular PR-head file; failing closed: $relative_path" >&2
		return 2
		;;
	*)
		return 1
		;;
	esac
}

copy_pr_head_blob_to_file() {
	local relative_path="$1"
	local dst_path="$2"
	local head_sha mode mode_rc tmp_dst
	head_sha="$(trim_whitespace "${PR_HEAD_SHA:-}")"
	mode_rc=0
	mode="$(pr_head_regular_file_mode "$relative_path")" || mode_rc=$?
	if [ "$mode_rc" -ne 0 ]; then
		return 2
	fi
	tmp_dst="$(mktemp "$(dirname -- "$dst_path")/.pr-head.XXXXXX")" || return 2
	if ! git show "$head_sha:$relative_path" >"$tmp_dst"; then
		rm -f -- "$tmp_dst"
		return 2
	fi
	if ! mv -- "$tmp_dst" "$dst_path"; then
		rm -f -- "$tmp_dst"
		return 2
	fi
	if [ "$mode" = "100755" ]; then
		chmod 755 "$dst_path" || return 2
	else
		chmod 644 "$dst_path" || return 2
	fi
}

is_supported_source_file() {
	case "$1" in
	*.java | *.kt | *.kts | *.groovy | *.scala | *.py | *.js | *.jsx | *.ts | *.tsx | *.vue | *.yaml | *.yml | *.sh | *.sql | *.xml | *.json | *.html | *.css | *.md)
		return 0
		;;
	*)
		return 1
		;;
	esac
}

is_dependency_manifest_path() {
	case "$1" in
	pom.xml | */pom.xml | package.json | */package.json | package-lock.json | */package-lock.json | pnpm-lock.yaml | */pnpm-lock.yaml | yarn.lock | */yarn.lock | pyproject.toml | */pyproject.toml | requirements.txt | */requirements.txt | requirements-*.txt | */requirements-*.txt | uv.lock | */uv.lock)
		return 0
		;;
	*)
		return 1
		;;
	esac
}

all_vulnerability_locations_are_dependency_manifests() {
	local vulnerability_location
	if [ "$#" -eq 0 ]; then
		return 1
	fi
	for vulnerability_location in "$@"; do
		if ! is_dependency_manifest_path "$vulnerability_location"; then
			return 1
		fi
	done
	return 0
}

severity_rank() {
	case "${1^^}" in
	CRITICAL)
		echo 4
		;;
	HIGH)
		echo 3
		;;
	MEDIUM)
		echo 2
		;;
	LOW)
		echo 1
		;;
	INFO | INFORMATIONAL | NONE)
		echo 0
		;;
	*)
		echo -1
		;;
	esac
}

capture_preexisting_report_dirs() {
	local run_dir
	for run_dir in "$STRIX_REPORTS_DIR"/*; do
		if [ ! -d "$run_dir" ]; then
			continue
		fi
		PREEXISTING_REPORT_DIRS+=("$run_dir")
	done
}

is_preexisting_report_dir() {
	local candidate="$1"
	local existing

	for existing in "${PREEXISTING_REPORT_DIRS[@]}"; do
		if [ "$candidate" = "$existing" ]; then
			return 0
		fi
	done

	return 1
}

# shellcheck disable=SC2034  # consumed indirectly by sourced model helper functions
if DEFAULT_PROVIDER_SANITIZED="$(sanitize_provider_name "$DEFAULT_PROVIDER_RAW")"; then
	DEFAULT_PROVIDER="$DEFAULT_PROVIDER_SANITIZED"
else
	case $? in
	1)
		DEFAULT_PROVIDER=""
		;;
	*)
		exit 2
		;;
	esac
fi

PRIMARY_MODEL="$(normalize_model "$STRIX_LLM")"
if [ "$PRIMARY_MODEL" != "$STRIX_LLM" ]; then
	echo "Normalized STRIX_LLM to provider-qualified model '$PRIMARY_MODEL'."
fi

require_non_negative_integer "$STRIX_TRANSIENT_RETRY_PER_MODEL" "STRIX_TRANSIENT_RETRY_PER_MODEL"
require_non_negative_integer "$STRIX_TRANSIENT_RETRY_BACKOFF_SECONDS" "STRIX_TRANSIENT_RETRY_BACKOFF_SECONDS"
require_non_negative_integer "$STRIX_PROCESS_TIMEOUT_SECONDS" "STRIX_PROCESS_TIMEOUT_SECONDS"
require_non_negative_integer "$STRIX_TOTAL_TIMEOUT_SECONDS" "STRIX_TOTAL_TIMEOUT_SECONDS"
require_positive_integer "$STRIX_PR_SCOPE_MAX_FILES_PER_BATCH" "STRIX_PR_SCOPE_MAX_FILES_PER_BATCH"

if [ "$(severity_rank "$STRIX_FAIL_ON_MIN_SEVERITY")" -lt 0 ]; then
	echo "ERROR: STRIX_FAIL_ON_MIN_SEVERITY must be one of CRITICAL/HIGH/MEDIUM/LOW/INFO/INFORMATIONAL/NONE, got '$STRIX_FAIL_ON_MIN_SEVERITY'." >&2
	exit 2
fi

remaining_total_budget() {
	if [ "$STRIX_TOTAL_TIMEOUT_SECONDS" -eq 0 ]; then
		echo 0
		return 0
	fi

	local now elapsed remaining
	now="$(date +%s)"
	elapsed=$((now - RUN_START_EPOCH))
	remaining=$((STRIX_TOTAL_TIMEOUT_SECONDS - elapsed))
	if [ "$remaining" -lt 0 ]; then
		remaining=0
	fi
	echo "$remaining"
}

capture_preexisting_report_dirs

github_event_payload_has_pull_request() {
	if [ "${STRIX_TEST_CHANGED_FILES_OVERRIDE+x}" = x ] || { [ -n "${PR_BASE_SHA:-}" ] && [ -n "${PR_HEAD_SHA:-}" ]; }; then
		return 0
	fi
	if [ -z "${GITHUB_EVENT_PATH:-}" ] || [ ! -f "$GITHUB_EVENT_PATH" ]; then
		return 1
	fi
	python3 - "$GITHUB_EVENT_PATH" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)
pull_request = payload.get('pull_request') or {}
base = ((pull_request.get('base') or {}).get('sha')) or ''
head = ((pull_request.get('head') or {}).get('sha')) or ''
raise SystemExit(0 if base and head else 1)
PY
}

is_pull_request_event() {
	case "${GITHUB_EVENT_NAME:-}" in
	pull_request | pull_request_target)
		github_event_payload_has_pull_request
		;;
	*)
		return 1
		;;
	esac
}

path_is_within_allowed_scope() {
	local resolved_target="$1"
	case "$resolved_target" in
	"$REPO_ROOT" | "$REPO_ROOT"/*)
		return 0
		;;
	esac

	return 1
}

path_is_within_generated_pr_scope() {
	local resolved_target="$1"

	local scope_dir
	for scope_dir in "${PULL_REQUEST_SCOPE_DIRS[@]}"; do
		scope_dir="$({ CDPATH='' && cd -P -- "$scope_dir" && pwd -P; })"
		case "$resolved_target" in
		"$scope_dir" | "$scope_dir"/*)
			return 0
			;;
		esac
	done

	return 1
}

resolve_scan_target_path() {
	local raw_target="$1"
	local resolved_target
	resolved_target="$({
		python3 - "$REPO_ROOT" "$raw_target" <<'PY'
from pathlib import Path
import sys

repo_root = Path(sys.argv[1]).resolve(strict=True)
raw_target = sys.argv[2]
target_path = Path(raw_target)
if not target_path.is_absolute():
    target_path = repo_root / target_path

resolved = target_path.resolve(strict=False)
print(resolved)
PY
	})" || {
		echo "ERROR: STRIX_TARGET_PATH '$raw_target' must resolve to a valid path." >&2
		return 2
	}
	if ! path_is_within_allowed_scope "$resolved_target"; then
		echo "ERROR: STRIX_TARGET_PATH '$raw_target' must stay within the repository." >&2
		return 2
	fi
	if [ ! -e "$resolved_target" ]; then
		echo "ERROR: STRIX_TARGET_PATH '$raw_target' must resolve to an existing directory." >&2
		return 2
	fi
	if [ ! -d "$resolved_target" ] || [ -L "$resolved_target" ]; then
		echo "ERROR: STRIX_TARGET_PATH '$raw_target' must resolve to a real directory." >&2
		return 2
	fi
	printf '%s\n' "$resolved_target"
}

resolve_internal_pr_scope_target_path() {
	local raw_target="$1"
	local resolved_target
	resolved_target="$({
		python3 - "$raw_target" <<'PY'
from pathlib import Path
import sys

raw_target = sys.argv[1]
target_path = Path(raw_target)
resolved = target_path.resolve(strict=False)
print(resolved)
PY
	})" || {
		echo "ERROR: internal PR scope target '$raw_target' must resolve to a valid path." >&2
		return 2
	}
	if ! path_is_within_generated_pr_scope "$resolved_target"; then
		echo "ERROR: internal PR scope target '$raw_target' must stay within generated PR scope directories." >&2
		return 2
	fi
	if [ ! -e "$resolved_target" ]; then
		echo "ERROR: internal PR scope target '$raw_target' must resolve to an existing directory." >&2
		return 2
	fi
	if [ ! -d "$resolved_target" ] || [ -L "$resolved_target" ]; then
		echo "ERROR: internal PR scope target '$raw_target' must resolve to a real directory." >&2
		return 2
	fi
	printf '%s\n' "$resolved_target"
}

resolve_current_target_path() {
	local raw_target="$1"
	if [ "$TARGET_PATH_IS_INTERNAL_PR_SCOPE" -eq 1 ]; then
		resolve_internal_pr_scope_target_path "$raw_target"
		return $?
	fi
	resolve_scan_target_path "$raw_target"
}

SCAN_MODE="$(trim_whitespace "$RAW_SCAN_MODE")"
require_safe_scan_mode "$SCAN_MODE"
if ! RAW_TARGET_PATH="$(validate_raw_target_path_input "$RAW_TARGET_PATH")"; then
	exit 2
fi
if ! TARGET_PATH="$(resolve_scan_target_path "$RAW_TARGET_PATH")"; then
	exit 2
fi

load_pull_request_changed_files() {
	CHANGED_FILES=()

	if [ "${STRIX_TEST_CHANGED_FILES_OVERRIDE+x}" = x ]; then
		while IFS= read -r changed_file; do
			if [ -n "$changed_file" ]; then
				CHANGED_FILES+=("$changed_file")
			fi
		done <<<"$STRIX_TEST_CHANGED_FILES_OVERRIDE"
		return 0
	fi

	if ! is_pull_request_event; then
		return 1
	fi

	local base_sha head_sha
	base_sha="$(trim_whitespace "${PR_BASE_SHA:-}")"
	head_sha="$(trim_whitespace "${PR_HEAD_SHA:-}")"
	if [ -z "$base_sha" ] || [ -z "$head_sha" ]; then
		if [ -z "${GITHUB_EVENT_PATH:-}" ] || [ ! -f "$GITHUB_EVENT_PATH" ]; then
			return 1
		fi

		local pr_shas
		pr_shas="$(
			python3 - "$GITHUB_EVENT_PATH" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)
pull_request = payload.get('pull_request') or {}
base = ((pull_request.get('base') or {}).get('sha')) or ''
head = ((pull_request.get('head') or {}).get('sha')) or ''
print(base)
print(head)
PY
		)"
		base_sha="$(printf '%s' "$pr_shas" | sed -n '1p')"
		head_sha="$(printf '%s' "$pr_shas" | sed -n '2p')"
	fi
	if [ -z "$base_sha" ] || [ -z "$head_sha" ]; then
		if pull_request_head_blob_required; then
			echo "ERROR: pull request base/head metadata is unavailable; failing closed." >&2
			return 2
		fi
		return 1
	fi
	if ! git cat-file -e "$base_sha^{commit}" 2>/dev/null; then
		if pull_request_head_blob_required; then
			echo "ERROR: pull request base commit could not be read; failing closed: $base_sha" >&2
			return 2
		fi
		return 1
	fi
	if ! git cat-file -e "$head_sha^{commit}" 2>/dev/null; then
		if pull_request_head_blob_required; then
			echo "ERROR: pull request head commit could not be read; failing closed: $head_sha" >&2
			return 2
		fi
		return 1
	fi

	local changed_files_output
	if ! changed_files_output="$(git diff --name-only "$base_sha...$head_sha")"; then
		if pull_request_head_blob_required; then
			echo "ERROR: pull request changed file list could not be read; failing closed." >&2
			return 2
		fi
		return 1
	fi

	while IFS= read -r changed_file; do
		if [ -n "$changed_file" ]; then
			CHANGED_FILES+=("$changed_file")
		fi
	done <<<"$changed_files_output"

	return 0
}

load_pull_request_head_sha() {
	local head_sha
	head_sha="$(trim_whitespace "${PR_HEAD_SHA:-}")"
	if [ -n "$head_sha" ]; then
		printf '%s\n' "$head_sha"
		return 0
	fi

	if [ -z "${GITHUB_EVENT_PATH:-}" ] || [ ! -f "$GITHUB_EVENT_PATH" ]; then
		return 1
	fi

	python3 - "$GITHUB_EVENT_PATH" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)
pull_request = payload.get('pull_request') or {}
head = ((pull_request.get('head') or {}).get('sha')) or ''
if not head:
    raise SystemExit(1)
print(head)
PY
}

load_pull_request_number() {
	local pr_number
	pr_number="$(trim_whitespace "${PR_NUMBER:-}")"
	if [ -n "$pr_number" ]; then
		if [[ "$pr_number" =~ ^[0-9]+$ ]] && [ "$pr_number" -gt 0 ]; then
			printf '%s\n' "$pr_number"
			return 0
		fi
		return 1
	fi

	if [ -z "${GITHUB_EVENT_PATH:-}" ] || [ ! -f "$GITHUB_EVENT_PATH" ]; then
		return 1
	fi

	python3 - "$GITHUB_EVENT_PATH" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)
pull_request = payload.get('pull_request') or {}
number = pull_request.get('number')
if not isinstance(number, int) or number <= 0:
    raise SystemExit(1)
print(number)
PY
}

authoritative_sca_checks_passed_for_pr_head() {
	if [ "${STRIX_TEST_PR_SCA_STATUS_OVERRIDE+x}" = x ]; then
		case "$(trim_whitespace "$STRIX_TEST_PR_SCA_STATUS_OVERRIDE")" in
		passed)
			return 0
			;;
		unverified | failed | "")
			return 1
			;;
		error)
			echo "Unable to verify authoritative SCA checks for this pull request head; failing closed." >&2
			return 1
			;;
		esac
		echo "Unsupported STRIX_TEST_PR_SCA_STATUS_OVERRIDE value; failing closed." >&2
		return 1
	fi

	if ! is_pull_request_event; then
		echo "Unable to verify authoritative SCA checks outside a pull request context; failing closed." >&2
		return 1
	fi

	local head_sha pr_number repository gh_token workflow_runs_json verification_result
	if ! head_sha="$(load_pull_request_head_sha)"; then
		echo "Unable to determine pull request head SHA for authoritative SCA verification; failing closed." >&2
		return 1
	fi
	if ! pr_number="$(load_pull_request_number)"; then
		echo "Unable to determine pull request identity for authoritative SCA verification; failing closed." >&2
		return 1
	fi

	repository="$(trim_whitespace "${GITHUB_REPOSITORY:-}")"
	if [ -z "$repository" ]; then
		echo "GITHUB_REPOSITORY is required for authoritative SCA verification; failing closed." >&2
		return 1
	fi

	gh_token="$(trim_whitespace "${GH_TOKEN:-${GITHUB_TOKEN:-}}")"
	if [ -z "$gh_token" ]; then
		echo "GitHub token is required for authoritative SCA verification; failing closed." >&2
		return 1
	fi

	if ! workflow_runs_json="$(GH_TOKEN="$gh_token" gh api \
		-H "Accept: application/vnd.github+json" \
		"repos/$repository/actions/runs?head_sha=$head_sha&event=pull_request&per_page=100")"; then
		echo "Unable to query authoritative SCA workflow runs for this pull request head; failing closed." >&2
		return 1
	fi

	if ! verification_result="$(
		WORKFLOW_RUNS_JSON="$workflow_runs_json" python3 - "$head_sha" "$pr_number" <<'PY'
import json
import os
import sys

head_sha = sys.argv[1]
pr_number = int(sys.argv[2])
payload = json.loads(os.environ["WORKFLOW_RUNS_JSON"])
runs = payload.get("workflow_runs") or []
required = {
    ".github/workflows/dependency-review.yml": "Dependency review",
    ".github/workflows/osvscanner.yml": "OSV-Scanner",
}
latest = {}
for run in runs:
    path = (run.get("path") or "").strip()
    name = (run.get("name") or "").strip()
    candidate = None
    for required_path, required_name in required.items():
        if path.endswith(required_path) or name == required_name:
            candidate = required_path
            break
    if candidate is None:
        continue
    if (run.get("head_sha") or "") != head_sha:
        continue
    pull_requests = run.get("pull_requests") or []
    if not any(int(pr.get("number") or 0) == pr_number for pr in pull_requests if isinstance(pr, dict)):
        continue
    run_id = int(run.get("id") or 0)
    previous = latest.get(candidate)
    if previous is None or run_id > int(previous.get("id") or 0):
        latest[candidate] = run

missing = [path for path in required if path not in latest]
if missing:
    print("missing")
    raise SystemExit(0)

for required_path, run in latest.items():
    if (run.get("status") or "") != "completed":
        print("unverified")
        raise SystemExit(0)
    if (run.get("conclusion") or "") != "success":
        print("unverified")
        raise SystemExit(0)

print("passed")
PY
		)"; then
		echo "Unable to evaluate authoritative SCA workflow results for this pull request head; failing closed." >&2
		return 1
	fi

	case "$verification_result" in
	passed)
		return 0
		;;
	missing | unverified)
		return 1
		;;
	esac

	echo "Unexpected authoritative SCA verification result '$verification_result'; failing closed." >&2
	return 1
}

is_scannable_changed_file() {
	local changed_file="$1"
	local normalized_changed_file
	if [ -z "$changed_file" ]; then
		return 1
	fi
	if ! normalized_changed_file="$(normalize_changed_file_path "$changed_file")"; then
		if pull_request_head_blob_required; then
			echo "ERROR: pull request changed file path is unsafe: $changed_file" >&2
			return 2
		fi
		return 1
	fi
	if pull_request_head_blob_required; then
		local mode_rc=0
		pr_head_regular_file_mode "$normalized_changed_file" >/dev/null || mode_rc=$?
		case "$mode_rc" in
		0)
			;;
		1)
			return 1
			;;
		3)
			echo "ERROR: pull request changed file is not a regular PR-head file; failing closed: $normalized_changed_file" >&2
			return 2
			;;
		*)
			echo "ERROR: pull request changed file could not be read from PR head; failing closed: $normalized_changed_file" >&2
			return 2
			;;
		esac
	fi
	if [[ "$normalized_changed_file" == *.md || "$normalized_changed_file" == *.txt ]]; then
		return 1
	fi
	if [[ "$normalized_changed_file" == */src/test/* || "$normalized_changed_file" == tests/* || "$normalized_changed_file" == */tests/* ]]; then
		return 1
	fi
	if [[ "$normalized_changed_file" == */__tests__/* || "$normalized_changed_file" == *.test.ts || "$normalized_changed_file" == *.test.tsx || "$normalized_changed_file" == *.spec.ts || "$normalized_changed_file" == *.spec.tsx ]]; then
		return 1
	fi
	if [[ "$normalized_changed_file" == pnpm-lock.yaml || "$normalized_changed_file" == package-lock.json || "$normalized_changed_file" == yarn.lock || "$normalized_changed_file" == uv.lock ]]; then
		return 1
	fi
	if [[ "$normalized_changed_file" == infra/* ]]; then
		return 1
	fi
	if [[ "$normalized_changed_file" == */ ]]; then
		return 1
	fi
	if ! is_supported_source_file "$normalized_changed_file"; then
		return 1
	fi
	local exists_rc=0
	changed_file_exists_for_scan "$normalized_changed_file" || exists_rc=$?
	case "$exists_rc" in
	0)
		return 0
		;;
	2)
		return 2
		;;
	*)
		return 1
		;;
	esac
}

pull_request_scope_context_files() {
	local needs_backend_python=0
	local changed_file normalized_changed_file
	for changed_file in "$@"; do
		normalized_changed_file="$(normalize_changed_file_path "$changed_file")" || return 2
		case "$normalized_changed_file" in
		backend/*.py | backend/*/*.py | backend/*/*/*.py | backend/*/*/*/*.py)
			needs_backend_python=1
			;;
		esac
	done

	if [ "$needs_backend_python" -eq 1 ]; then
		cat <<'EOF'
backend/requirements.txt
backend/api/__init__.py
backend/api/auth.py
backend/core/__init__.py
backend/core/config.py
backend/core/exceptions.py
backend/db/__init__.py
backend/db/models.py
backend/db/session.py
backend/services/__init__.py
backend/services/archive.py
backend/services/email_client.py
backend/services/email_parser.py
backend/services/embedding.py
backend/services/exceptions.py
backend/services/threading_service.py
EOF
	fi
}

build_pull_request_scope_dir() {
	local scope_dir
	scope_dir="$(mktemp -d "${TMPDIR:-/tmp}/strix-pr-scope.XXXXXX")"
	scope_dir="$({ CDPATH='' && cd -P -- "$scope_dir" && pwd -P; })"
	PULL_REQUEST_SCOPE_DIRS+=("$scope_dir")

	copy_changed_file_into_scope() {
		local changed_file="$1"
		local relative_path
		relative_path="$(normalize_changed_file_path "$changed_file")" || {
			echo "ERROR: pull request changed file path is unsafe: $changed_file" >&2
			return 2
		}
		local dst_path
		dst_path="$(
			python3 - "$scope_dir" "$relative_path" <<'PY'
from pathlib import Path
import sys

scope_root = Path(sys.argv[1]).resolve(strict=True)
relative_path = Path(sys.argv[2])
dst_path = scope_root / relative_path
print(dst_path)
PY
		)"
		mkdir -p -- "$(dirname -- "$dst_path")"
		local copy_rc=1
		local head_sha_for_copy
		head_sha_for_copy="$(trim_whitespace "${PR_HEAD_SHA:-}")"
		if pull_request_head_blob_required || { [ -n "$head_sha_for_copy" ] && git cat-file -e "$head_sha_for_copy^{commit}" 2>/dev/null; }; then
			copy_rc=0
			copy_pr_head_blob_to_file "$relative_path" "$dst_path" || copy_rc=$?
		fi
		if [ "$copy_rc" -eq 0 ]; then
			return 0
		fi
		if pull_request_head_blob_required || [ "$copy_rc" -eq 2 ]; then
			echo "ERROR: pull request changed file could not be read from PR head; failing closed: $changed_file" >&2
			return 2
		fi
		local src_path="$REPO_ROOT/$relative_path"
		if [ ! -f "$src_path" ] || [ -L "$src_path" ]; then
			echo "ERROR: pull request changed file is unavailable in both PR head and checkout: $changed_file" >&2
			return 2
		fi
		cp -- "$src_path" "$dst_path"
	}

	copy_trusted_context_file_into_scope() {
		local context_file="$1"
		local relative_path
		relative_path="$(normalize_changed_file_path "$context_file")" || {
			echo "ERROR: pull request context file path is unsafe: $context_file" >&2
			return 2
		}
		local dst_path
		dst_path="$(
			python3 - "$scope_dir" "$relative_path" <<'PY'
from pathlib import Path
import sys

scope_root = Path(sys.argv[1]).resolve(strict=True)
relative_path = Path(sys.argv[2])
dst_path = scope_root / relative_path
print(dst_path)
PY
		)"
		if [ -e "$dst_path" ]; then
			return 0
		fi
		local src_path="$REPO_ROOT/$relative_path"
		if [ ! -e "$src_path" ]; then
			return 0
		fi
		if [ ! -f "$src_path" ] || [ -L "$src_path" ]; then
			echo "ERROR: pull request trusted context file is not a regular checkout file: $context_file" >&2
			return 2
		fi
		mkdir -p -- "$(dirname -- "$dst_path")"
		cp -- "$src_path" "$dst_path"
	}

	copy_scope_support_file() {
		local relative_path="$1"
		local dst_path
		dst_path="$(
			python3 - "$scope_dir" "$relative_path" <<'PY'
from pathlib import Path
import sys

scope_root = Path(sys.argv[1]).resolve(strict=True)
relative_path = Path(sys.argv[2])
dst_path = scope_root / relative_path
print(dst_path)
PY
		)"
		if [ -e "$dst_path" ]; then
			return 0
		fi
		local src_path="$REPO_ROOT/$relative_path"
		if [ ! -f "$src_path" ] || [ -L "$src_path" ]; then
			echo "ERROR: pull request scan support file is unavailable: $relative_path" >&2
			return 2
		fi
		mkdir -p -- "$(dirname -- "$dst_path")"
		cp -- "$src_path" "$dst_path"
	}

	copy_required_scope_support_files() {
		local include_strix_model_utils=0
		local changed_file relative_path
		for changed_file in "$@"; do
			relative_path="$(normalize_changed_file_path "$changed_file")" || return 2
			case "$relative_path" in
			scripts/ci/strix_quick_gate.sh | scripts/ci/test_strix_quick_gate.sh)
				include_strix_model_utils=1
				;;
			esac
		done

		if [ "$include_strix_model_utils" -eq 1 ]; then
			copy_scope_support_file "scripts/ci/strix_model_utils.sh" || return 2
		fi
	}

	local changed_file
	for changed_file in "$@"; do
		copy_changed_file_into_scope "$changed_file" || return 2
	done
	local context_files_text=""
	context_files_text="$(pull_request_scope_context_files "$@")" || return 2
	if [ -n "$context_files_text" ]; then
		local context_file
		while IFS= read -r context_file; do
			[ -n "$context_file" ] || continue
			copy_trusted_context_file_into_scope "$context_file" || return 2
		done <<<"$context_files_text"
	fi
	copy_required_scope_support_files "$@" || return 2
	LAST_PULL_REQUEST_SCOPE_DIR="$scope_dir"
}

prepare_pull_request_scan_scope() {
	if ! is_pull_request_event; then
		return 0
	fi
	TARGET_PATH_IS_INTERNAL_PR_SCOPE=0

	local load_changed_files_rc=0
	load_pull_request_changed_files || load_changed_files_rc=$?
	case "$load_changed_files_rc" in
	0)
		;;
	2)
		return 2
		;;
	*)
		return 0
		;;
	esac

	local scoped_changed_files=()
	local changed_file
	for changed_file in "${CHANGED_FILES[@]}"; do
		local scannable_rc=0
		is_scannable_changed_file "$changed_file" || scannable_rc=$?
		if [ "$scannable_rc" -eq 0 ]; then
			scoped_changed_files+=("$changed_file")
		elif [ "$scannable_rc" -eq 2 ]; then
			return 2
		fi
	done

	if [ "${#scoped_changed_files[@]}" -eq 0 ]; then
		echo "No scannable changed files in pull request; skipping Strix quick scan." >&2
		exit 0
	fi

	CHANGED_FILES=("${scoped_changed_files[@]}")
	local total_files="${#CHANGED_FILES[@]}"
	derive_pull_request_full_target_path() {
		python3 - "$REPO_ROOT" "$@" <<'PY'
from pathlib import Path
import os
import sys

repo_root = Path(sys.argv[1]).resolve(strict=True)
resolved_paths = []
for relative in sys.argv[2:]:
    candidate = (repo_root / relative).resolve(strict=True)
    candidate.relative_to(repo_root)
    resolved_paths.append(candidate)

common = Path(os.path.commonpath([str(path) for path in resolved_paths]))
if common.is_file():
    common = common.parent

if common == repo_root:
    top_levels = {
        path.relative_to(repo_root).parts[0]
        for path in resolved_paths
        if path.relative_to(repo_root).parts
    }
    if len(top_levels) == 1:
        common = repo_root / next(iter(top_levels))

relative_common = common.relative_to(repo_root)
print("./" if str(relative_common) == "." else f"./{relative_common.as_posix()}")
PY
	}
	target_path_is_top_level_scope() {
		local candidate="$1"
		[[ "$candidate" == ./* ]] || return 1
		candidate="${candidate#./}"
		[[ "$candidate" == */* ]] && return 1
		[ -n "$candidate" ]
	}
	if [ "$STRIX_DISABLE_PR_SCOPING" = "1" ]; then
		if pull_request_head_blob_required; then
			local build_scope_rc=0
			build_pull_request_scope_dir "${CHANGED_FILES[@]}" || build_scope_rc=$?
			if [ "$build_scope_rc" -eq 0 ]; then
				TARGET_PATH="$LAST_PULL_REQUEST_SCOPE_DIR"
				TARGET_PATH_IS_INTERNAL_PR_SCOPE=1
				printf "Using bounded PR-head blob scope for pull request_target Strix scan with %s scannable changed file(s).\n" "$total_files" >&2
				PULL_REQUEST_SCOPE_FILE_BATCHES=()
				return 0
			fi
			return 2
		fi
		local narrowed_target=""
		if narrowed_target="$(derive_pull_request_full_target_path "${CHANGED_FILES[@]}")" && [ "$narrowed_target" != "./" ] && ! target_path_is_top_level_scope "$narrowed_target"; then
			TARGET_PATH="$narrowed_target"
			TARGET_PATH_IS_INTERNAL_PR_SCOPE=0
			printf "Using narrowed target path %s for pull request Strix scan with %s scannable changed file(s).\n" "$narrowed_target" "$total_files" >&2
		else
			local build_scope_rc=0
			build_pull_request_scope_dir "${CHANGED_FILES[@]}" || build_scope_rc=$?
			if [ "$build_scope_rc" -eq 0 ]; then
				TARGET_PATH="$LAST_PULL_REQUEST_SCOPE_DIR"
				TARGET_PATH_IS_INTERNAL_PR_SCOPE=1
				printf "Using bounded changed-file scope for pull request Strix scan with %s scannable changed file(s).\n" "$total_files" >&2
			elif pull_request_head_blob_required; then
				return 2
			else
				printf "Using full target path for pull request Strix scan with %s scannable changed file(s).\n" "$total_files" >&2
			fi
		fi
		PULL_REQUEST_SCOPE_FILE_BATCHES=()
		return 0
	fi
	PULL_REQUEST_SCOPE_FILE_BATCHES=()
	local batch_start=0
	while [ "$batch_start" -lt "$total_files" ]; do
		local batch_files=("${CHANGED_FILES[@]:batch_start:STRIX_PR_SCOPE_MAX_FILES_PER_BATCH}")
		PULL_REQUEST_SCOPE_FILE_BATCHES+=("$(printf '%s\n' "${batch_files[@]}")")
		batch_start=$((batch_start + STRIX_PR_SCOPE_MAX_FILES_PER_BATCH))
	done
	printf "Scoped pull request Strix scan to %s changed file(s)" "$total_files" >&2
	printf ".\n" >&2
	if [ "${#PULL_REQUEST_SCOPE_FILE_BATCHES[@]}" -gt 1 ]; then
		printf "Split pull request Strix scan into %s batch(es) of at most %s file(s).\n" \
			"${#PULL_REQUEST_SCOPE_FILE_BATCHES[@]}" \
			"$STRIX_PR_SCOPE_MAX_FILES_PER_BATCH" >&2
	fi
	return 0
}

should_rebalance_pull_request_batch() {
	if ! is_pull_request_event; then
		return 1
	fi
	if [ "$CURRENT_PULL_REQUEST_BATCH_FILE_COUNT" -le 1 ]; then
		return 1
	fi
	if [ "$INFRA_ERROR_DETECTED" -ne 1 ]; then
		return 1
	fi
	if [ "$(remaining_total_budget)" -le 0 ]; then
		return 1
	fi
	if is_timeout_error; then
		return 0
	fi
	return 1
}

extract_vulnerability_locations() {
	local vuln_file="$1"
	local location
	local resolved_scan_target=""
	local narrowed_workspace_prefix=""

	if resolved_scan_target="$(resolve_current_target_path "$TARGET_PATH" 2>/dev/null)"; then
		if [ "$resolved_scan_target" != "$REPO_ROOT" ]; then
			narrowed_workspace_prefix="/workspace/$(basename "$resolved_scan_target")/"
		fi
	fi

	extract_candidate_source_paths_from_report() {
		python3 - "$1" <<'PY'
from pathlib import Path
import re
import sys

text = Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace')
patterns = [
    re.compile(r'(?P<path>/workspace/[^\s`]+|[A-Za-z0-9_./-]+\.[A-Za-z0-9_]+):\d+'),
    re.compile(r'^[^\S\r\n│]*[│]?[ \t]*(?:\*\*)?Target:(?:\*\*)?[ \t]*(?:File:[ \t]*)?(?P<path>/workspace/[^\s`│]+|[A-Za-z0-9_./-]+\.[A-Za-z0-9_]+)', re.MULTILINE),
    re.compile(r'^[^\S\r\n│]*[│]?[ \t]*(?:\*\*)?Endpoint:(?:\*\*)?[ \t]*(?P<path>/workspace/[^\s`│]+|[A-Za-z0-9_./-]+\.[A-Za-z0-9_]+)', re.MULTILINE),
    re.compile(r'(?i)(?:in\s+)?file\s+`(?P<path>(?:\.\.?/)?[A-Za-z0-9_./-]+\.[A-Za-z0-9_]+)`'),
]
seen = set()
for pattern in patterns:
    for match in pattern.finditer(text):
        value = match.group('path').strip()
        if value and value not in seen:
            seen.add(value)
for value in sorted(seen):
    print(value)
PY
	}

	normalize_vulnerability_location() {
		local raw_location="$1"
		raw_location="$({
			python3 - "$REPO_ROOT" "$REPO_NAME" "$resolved_scan_target" "$narrowed_workspace_prefix" "$raw_location" <<'PY'
from pathlib import Path
from urllib.parse import unquote
import sys

repo_root = Path(sys.argv[1]).resolve(strict=True)
repo_name = sys.argv[2]
scan_target_root_raw = sys.argv[3].strip()
scan_target_workspace_prefix = sys.argv[4].strip()
raw_location = unquote(sys.argv[5].strip())
if not raw_location:
    raise SystemExit(1)

scan_target_root = Path(scan_target_root_raw).resolve(strict=True) if scan_target_root_raw else None

def normalize_within(base: Path, location: str) -> Path:
    candidate = (base / location).resolve(strict=False)
    try:
        candidate.relative_to(base)
    except ValueError:
        raise SystemExit(1)
    if not candidate.exists():
        raise SystemExit(1)
    return candidate

def try_normalize_within(base: Path, location: str) -> Path | None:
    try:
        return normalize_within(base, location)
    except SystemExit:
        return None

def emit_repo_relative(candidate: Path, fallback_relative: Path | None = None) -> None:
    try:
        relative = candidate.relative_to(repo_root)
    except ValueError:
        if fallback_relative is None:
            raise SystemExit(1)
        repo_candidate = (repo_root / fallback_relative).resolve(strict=False)
        if not repo_candidate.exists():
            raise SystemExit(1)
        try:
            relative = repo_candidate.relative_to(repo_root)
        except ValueError:
            raise SystemExit(1)
    print(relative.as_posix())
    raise SystemExit(0)

if scan_target_root and scan_target_workspace_prefix and raw_location.startswith(scan_target_workspace_prefix):
    suffix = raw_location[len(scan_target_workspace_prefix):]
    if not suffix:
        raise SystemExit(1)
    candidate = normalize_within(scan_target_root, suffix)
    emit_repo_relative(candidate, candidate.relative_to(scan_target_root))

prefixes = (
    str(repo_root) + "/",
    f"/workspace/{repo_name}/",
)
for prefix in prefixes:
    if raw_location.startswith(prefix):
        relative_location = raw_location[len(prefix):]
        if not relative_location:
            raise SystemExit(1)
        emit_repo_relative(normalize_within(repo_root, relative_location))

if scan_target_root is not None:
    candidate = try_normalize_within(scan_target_root, raw_location)
    if candidate is not None:
        emit_repo_relative(candidate, candidate.relative_to(scan_target_root))

emit_repo_relative(normalize_within(repo_root, raw_location))
PY
		})" || return 1
		if [ -z "$raw_location" ]; then
			return 1
		fi
		if ! is_supported_source_file "$raw_location"; then
			return 1
		fi

		if [ -f "$REPO_ROOT/$raw_location" ] && [ ! -L "$REPO_ROOT/$raw_location" ]; then
			printf '%s\n' "$raw_location"
			return 0
		fi

		return 1
	}

	{
		while IFS= read -r location; do
			normalize_vulnerability_location "$location" || true
		done < <(extract_candidate_source_paths_from_report "$vuln_file")
	} | sort -u
}

extract_first_severity_rank() {
	local source_path="$1"
	local line severity rank=-1

	while IFS= read -r line; do
		if [[ "${line^^}" =~ SEVERITY[[:space:]]*:[[:space:][:punct:]]*(CRITICAL|HIGH|MEDIUM|LOW|INFO|INFORMATIONAL|NONE)([[:space:][:punct:]]|$) ]]; then
			severity="${BASH_REMATCH[1]}"
			rank="$(severity_rank "$severity")"
			if [ "$rank" -gt -1 ]; then
				break
			fi
		fi
	done < <(grep -Ei 'severity[[:space:]]*:' "$source_path" || true)

	printf '%s\n' "$rank"
}

evaluate_pull_request_findings() {
	PR_FINDINGS_DECISION="not_applicable"
	if ! is_pull_request_event; then
		return 1
	fi
	if ! load_pull_request_changed_files; then
		PR_FINDINGS_DECISION="block_unmapped"
		echo "Unable to map Strix findings to changed files; failing closed for pull request." >&2
		return 1
	fi

	local threshold_rank
	threshold_rank="$(severity_rank "$STRIX_FAIL_ON_MIN_SEVERITY")"
	local found_baseline_threshold_finding=0
	local found_changed_manifest_only_threshold_finding=0
	local found_any_vuln_file=0
	local run_dir vulnerabilities_dir vuln_file line severity rank
	for run_dir in "$STRIX_REPORTS_DIR"/*; do
		if [ ! -d "$run_dir" ] || [ -L "$run_dir" ]; then
			continue
		fi
		if is_preexisting_report_dir "$run_dir"; then
			continue
		fi
		vulnerabilities_dir="$run_dir/vulnerabilities"
		if [ ! -d "$vulnerabilities_dir" ] || [ -L "$vulnerabilities_dir" ]; then
			continue
		fi
		for vuln_file in "$vulnerabilities_dir"/*.md; do
			if [ ! -f "$vuln_file" ] || [ -L "$vuln_file" ]; then
				continue
			fi
			found_any_vuln_file=1
			rank="$(extract_first_severity_rank "$vuln_file")"
			if [ "$rank" -lt 0 ]; then
				PR_FINDINGS_DECISION="block_unmapped"
				echo "Unrecognized Strix severity marker; failing closed for pull request." >&2
				return 1
			fi
			if [ "$rank" -lt "$threshold_rank" ]; then
				continue
			fi
			mapfile -t vulnerability_locations < <(extract_vulnerability_locations "$vuln_file")
			if [ "${#vulnerability_locations[@]}" -eq 0 ]; then
				PR_FINDINGS_DECISION="block_unmapped"
				echo "Unable to map Strix findings to changed files; failing closed for pull request." >&2
				return 1
			fi
			if all_vulnerability_locations_are_dependency_manifests "${vulnerability_locations[@]}"; then
				local manifest_location changed_file manifest_location_changed=0
				for manifest_location in "${vulnerability_locations[@]}"; do
					for changed_file in "${CHANGED_FILES[@]}"; do
						if [ "$manifest_location" = "$changed_file" ]; then
							manifest_location_changed=1
							break
						fi
					done
					if [ "$manifest_location_changed" -eq 1 ]; then
						break
					fi
				done
				if [ "$manifest_location_changed" -eq 1 ]; then
					found_changed_manifest_only_threshold_finding=1
				else
					found_baseline_threshold_finding=1
				fi
				continue
			fi
			found_baseline_threshold_finding=1
			local changed_file vulnerability_location
			for vulnerability_location in "${vulnerability_locations[@]}"; do
				for changed_file in "${CHANGED_FILES[@]}"; do
					if [ "$vulnerability_location" = "$changed_file" ]; then
						PR_FINDINGS_DECISION="block_changed"
						echo "Strix finding intersects files changed in this pull request." >&2
						return 1
					fi
				done
			done
		done
	done

	if [ "$found_baseline_threshold_finding" -eq 0 ] && [ "$found_changed_manifest_only_threshold_finding" -eq 0 ]; then
		rank="$(extract_first_severity_rank "$STRIX_LOG")"
		if [ "$rank" -lt 0 ]; then
			return 1
		fi
		if [ "$rank" -ge "$threshold_rank" ]; then
			mapfile -t vulnerability_locations < <(extract_vulnerability_locations "$STRIX_LOG")
			if [ "${#vulnerability_locations[@]}" -eq 0 ]; then
				PR_FINDINGS_DECISION="block_unmapped"
				echo "Unable to map Strix findings to changed files; failing closed for pull request." >&2
				return 1
			fi
			if all_vulnerability_locations_are_dependency_manifests "${vulnerability_locations[@]}"; then
				local manifest_location changed_file manifest_location_changed=0
				for manifest_location in "${vulnerability_locations[@]}"; do
					for changed_file in "${CHANGED_FILES[@]}"; do
						if [ "$manifest_location" = "$changed_file" ]; then
							manifest_location_changed=1
							break
						fi
					done
					if [ "$manifest_location_changed" -eq 1 ]; then
						break
					fi
				done
				if [ "$manifest_location_changed" -eq 1 ]; then
					found_changed_manifest_only_threshold_finding=1
				else
					found_baseline_threshold_finding=1
				fi
			else
				found_baseline_threshold_finding=1
				local changed_file vulnerability_location
				for vulnerability_location in "${vulnerability_locations[@]}"; do
					for changed_file in "${CHANGED_FILES[@]}"; do
						if [ "$vulnerability_location" = "$changed_file" ]; then
							PR_FINDINGS_DECISION="block_changed"
							echo "Strix finding intersects files changed in this pull request." >&2
							return 1
						fi
					done
				done
			fi
		fi
	fi

	if [ "$found_changed_manifest_only_threshold_finding" -eq 1 ]; then
		if authoritative_sca_checks_passed_for_pr_head; then
			PR_FINDINGS_DECISION="allow_manifest_only"
			echo "Strix changed-manifest finding is covered by verified authoritative SCA checks on this PR head; allowing pipeline continuation." >&2
			return 0
		fi
		PR_FINDINGS_DECISION="block_manifest_unverified"
		echo "Strix changed-manifest finding requires verified authoritative SCA checks on this PR head; failing closed." >&2
		return 1
	fi

	if [ "$found_baseline_threshold_finding" -eq 1 ]; then
		PR_FINDINGS_DECISION="allow_baseline"
		echo "Strix findings are limited to unchanged files in this pull request; allowing pipeline continuation." >&2
		return 0
	fi

	return 1
}

is_vertex_model() {
	case "$1" in
	vertex_ai/* | vertex_ai_beta/*)
		return 0
		;;
	*)
		return 1
		;;
	esac
}

is_gemini_model() {
	case "$1" in
	gemini/*)
		return 0
		;;
	*)
		return 1
		;;
	esac
}

fallback_models_raw_for_model() {
	local model="$1"

	if is_vertex_model "$model"; then
		if [ -z "${STRIX_VERTEX_FALLBACK_MODELS+x}" ]; then
			printf '%s\n' "vertex_ai/gemini-2.5-pro vertex_ai/gemini-2.5-flash"
		else
			printf '%s\n' "$STRIX_VERTEX_FALLBACK_MODELS"
		fi
		return 0
	fi

	if is_gemini_model "$model"; then
		if [ -n "${STRIX_GEMINI_FALLBACK_MODELS+x}" ]; then
			printf '%s\n' "$STRIX_GEMINI_FALLBACK_MODELS"
		else
			printf '%s\n' "${STRIX_FALLBACK_MODELS:-}"
		fi
		return 0
	fi

	printf '%s\n' "${STRIX_FALLBACK_MODELS:-}"
}

fallback_models_config_name_for_model() {
	local model="$1"

	if is_vertex_model "$model"; then
		printf '%s\n' "STRIX_VERTEX_FALLBACK_MODELS"
		return 0
	fi

	if is_gemini_model "$model"; then
		if [ -n "${STRIX_GEMINI_FALLBACK_MODELS+x}" ]; then
			printf '%s\n' "STRIX_GEMINI_FALLBACK_MODELS"
		else
			printf '%s\n' "STRIX_GEMINI_FALLBACK_MODELS or STRIX_FALLBACK_MODELS"
		fi
		return 0
	fi

	printf '%s\n' "STRIX_FALLBACK_MODELS"
}

resolved_llm_api_base_for_model() {
	local model="$1"

	if is_vertex_model "$model"; then
		return 0
	fi

	if [ -z "$LLM_API_BASE_FILE" ]; then
		return 0
	fi
	if [ ! -f "$LLM_API_BASE_FILE" ] || [ -L "$LLM_API_BASE_FILE" ]; then
		echo "ERROR: LLM_API_BASE_FILE must reference a regular file." >&2
		return 2
	fi

	local llm_api_base_value
	llm_api_base_value="$(cat -- "$LLM_API_BASE_FILE")"
	llm_api_base_value="${llm_api_base_value%%/generateContent*}"
	llm_api_base_value="${llm_api_base_value%%:generateContent*}"
	llm_api_base_value="$(trim_whitespace "$llm_api_base_value")"
	if [ -z "$llm_api_base_value" ]; then
		return 0
	fi
	if [[ "$llm_api_base_value" =~ [[:space:][:cntrl:]] ]]; then
		echo "ERROR: LLM_API_BASE must not contain whitespace or control characters." >&2
		return 2
	fi
	if [[ ! "$llm_api_base_value" =~ ^https://[^[:space:]]+$ ]]; then
		echo "ERROR: LLM_API_BASE must be an https URL when configured." >&2
		return 2
	fi
	printf '%s\n' "$llm_api_base_value"
}

## Run a single strix invocation against TARGET_PATH with the given model.
## Builds a child-only environment so secrets and model routing do not leak
## through the parent shell process.
## Returns 0 on success (strix exit 0), 1 on any failure.
## The caller is responsible for retry/fallback logic; process-level timeout
## wrapping prevents CI from hanging indefinitely.
run_strix_once() {
	local model="$1"
	local rc
	local llm_api_base_value
	local resolved_target_path
	local timeout_seconds="$STRIX_PROCESS_TIMEOUT_SECONDS"
	if [ "$STRIX_TOTAL_TIMEOUT_SECONDS" -gt 0 ]; then
		local remaining_budget
		remaining_budget="$(remaining_total_budget)"
		if [ "$remaining_budget" -le 0 ]; then
			printf "Strix quick scan exceeded total timeout of %ss.\n" "$STRIX_TOTAL_TIMEOUT_SECONDS" | tee "$STRIX_LOG" >&2
			return 1
		fi
		if [ "$timeout_seconds" -eq 0 ] || [ "$remaining_budget" -lt "$timeout_seconds" ]; then
			timeout_seconds="$remaining_budget"
		fi
	fi
	if ! llm_api_base_value="$(resolved_llm_api_base_for_model "$model")"; then
		return 1
	fi
	if ! resolved_target_path="$(resolve_current_target_path "$TARGET_PATH")"; then
		return 1
	fi
	local start_epoch
	start_epoch="$(date +%s)"
	set -o pipefail
	set +e
	STRIX_CHILD_MODEL="$model" \
		STRIX_CHILD_LLM_API_KEY="$LLM_API_KEY" \
		STRIX_CHILD_LLM_API_BASE="$llm_api_base_value" \
		STRIX_CHILD_REPORTS_DIR="$ACTIVE_REPORTS_DIR" \
		python3 - "$timeout_seconds" "$resolved_target_path" "$SCAN_MODE" "$STRIX_LOG" <<'PY'
import os
import pathlib
import signal
import shutil
import subprocess
import sys

timeout_seconds = int(sys.argv[1])
target_path = sys.argv[2]
scan_mode = sys.argv[3]
log_path = pathlib.Path(sys.argv[4])
process_timeout = None if timeout_seconds == 0 else timeout_seconds
child_env = {}
for key in (
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SYSTEMROOT",
    "COMSPEC",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "NO_PROXY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
):
    value = os.environ.get(key)
    if value:
        child_env[key] = value
child_env["STRIX_LLM"] = os.environ["STRIX_CHILD_MODEL"]
child_env["LLM_MODEL"] = os.environ["STRIX_CHILD_MODEL"]
child_env["LLM_API_KEY"] = os.environ["STRIX_CHILD_LLM_API_KEY"]
child_env["STRIX_REPORTS_DIR"] = os.environ["STRIX_CHILD_REPORTS_DIR"]
for key, value in os.environ.items():
    if key.startswith("FAKE_STRIX_") and value:
        child_env[key] = value
for key in (
    "GOOGLE_GHA_CREDS_PATH",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
    "VERTEX_LOCATION",
    "GEMINI_LOCATION",
    "LLM_TIMEOUT",
    "STRIX_MEMORY_COMPRESSOR_TIMEOUT",
    "STRIX_REASONING_EFFORT",
    "STRIX_LLM_MAX_RETRIES",
    "GOOGLE_CLOUD_PROJECT",
    "GCP_PROJECT",
    "GCLOUD_PROJECT",
    "CLOUDSDK_CORE_PROJECT",
    "CLOUDSDK_PROJECT",
):
    value = os.environ.get(key)
    if value:
        child_env[key] = value
llm_api_base = os.environ.get("STRIX_CHILD_LLM_API_BASE", "")
if llm_api_base:
    child_env["LLM_API_BASE"] = llm_api_base
else:
    child_env.pop("LLM_API_BASE", None)

resolved_strix_bin = shutil.which("strix") or ""
if not resolved_strix_bin:
    sys.stderr.write("ERROR: strix executable not found in PATH.\n")
    raise SystemExit(127)
resolved_strix_bin = str(pathlib.Path(resolved_strix_bin).resolve(strict=True))

command = [resolved_strix_bin, "-n", "-t", target_path, "--scan-mode", scan_mode]

try:
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=child_env,
        start_new_session=True,
    )
    output, _ = process.communicate(timeout=process_timeout)
    if output:
        sys.stdout.write(output)
    log_path.write_text(output or "", encoding="utf-8")
    raise SystemExit(process.returncode)
except subprocess.TimeoutExpired:
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        output, _ = process.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        output, _ = process.communicate()
    if output:
        sys.stdout.write(output)
    log_path.write_text(output or "", encoding="utf-8")
    raise SystemExit(124)
PY
	rc=$?
	set -e
	local end_epoch
	end_epoch="$(date +%s)"
	local elapsed=$((end_epoch - start_epoch))

	if strix_reported_zero_vulnerabilities_in_file "$STRIX_LOG"; then
		ZERO_FINDINGS_REPORTED=1
	fi

	if [ "$rc" -eq 124 ]; then
		echo "Strix run timed out after ${timeout_seconds}s." | tee -a "$STRIX_LOG" >&2
	fi

	if [ "$rc" -eq 0 ]; then
		printf "Strix run succeeded for model '%s' in %ds.\n" "$model" "$elapsed" >&2
		return 0
	fi

	printf "Strix run failed for model '%s' after %ds (exit code %d).\n" "$model" "$elapsed" "$rc" >&2

	# Sticky flag: record that at least one attempt hit an infrastructure
	# error.  STRIX_LOG is overwritten per-attempt, so without this flag the
	# below-threshold guard in has_only_below_threshold_vulnerabilities()
	# would only see the *last* attempt's log — missing infrastructure errors
	# from earlier attempts whose partial reports may still sit in the reports
	# directory.
	if has_detected_infrastructure_error; then
		INFRA_ERROR_DETECTED=1
	fi

	return 1
}

is_llm_api_connection_error() {
	if grep -Eiq 'litellm(\.exceptions)?\.APIConnectionError' "$STRIX_LOG" &&
		grep -Eiq '(GeminiException|Server disconnected without sending a response|LLM CONNECTION FAILED|Could not establish connection to the language model)' "$STRIX_LOG"; then
		return 0
	fi

	return 1
}

is_llm_service_unavailable_error() {
	if grep -Eiq 'litellm(\.exceptions)?\.ServiceUnavailableError' "$STRIX_LOG" &&
		grep -Eiq '(GeminiException|VertexAI|Vertex_ai|vertex\.ai|openai|anthropic|LLM CONNECTION FAILED|Could not establish connection to the language model)' "$STRIX_LOG" &&
		grep -Eiq '("status"[[:space:]]*:[[:space:]]*"UNAVAILABLE"|(^|[^0-9])503([^0-9]|$)|high demand|Service Unavailable)' "$STRIX_LOG"; then
		return 0
	fi

	return 1
}

## Determines whether the last strix failure is a transient error eligible
## for same-model retry (up to STRIX_TRANSIENT_RETRY_PER_MODEL times).
## Four error families qualify:
##   - RateLimit / RESOURCE_EXHAUSTED / HTTP 429
##   - litellm API connection failures with LLM-provider evidence
##   - litellm service-unavailable / high-demand provider failures
##   - MidStreamFallbackError (litellm mid-stream provider switch)
## Vertex timeouts remain infrastructure errors for guard logic, but the caller
## should move directly to fallback model evaluation instead of spending the
## remaining budget retrying the same slow model. Non-Vertex models have no
## provider-specific fallback path in this gate, so LLM timeouts are retried on
## the same model before being treated as non-recoverable.
is_transient_same_model_retry_error() {
	local model="${1-}"
	if is_timeout_error; then
		if [ -n "$model" ] && ! is_vertex_model "$model"; then
			return 0
		fi
		return 1
	fi
	if is_llm_api_connection_error; then
		return 0
	fi
	if is_llm_service_unavailable_error; then
		return 0
	fi
	if is_rate_limit_error; then
		return 0
	fi
	if is_midstream_fallback_error; then
		return 0
	fi
	return 1
}

run_strix_with_transient_retry() {
	local model="$1"
	local max_attempts=$((STRIX_TRANSIENT_RETRY_PER_MODEL + 1))
	local attempt=1

	while [ "$attempt" -le "$max_attempts" ]; do
		if run_strix_once "$model"; then
			return 0
		fi

		if [ "$attempt" -ge "$max_attempts" ]; then
			return 1
		fi

		if [ "$STRIX_TOTAL_TIMEOUT_SECONDS" -gt 0 ] && [ "$(remaining_total_budget)" -le 0 ]; then
			printf "Strix quick scan exceeded total timeout of %ss.\n" "$STRIX_TOTAL_TIMEOUT_SECONDS" | tee "$STRIX_LOG" >&2
			return 1
		fi

		if ! is_transient_same_model_retry_error "$model"; then
			return 1
		fi

		local retry_reason="transient error"
		if is_rate_limit_error; then
			retry_reason="rate limit"
		elif is_llm_api_connection_error; then
			retry_reason="LLM API connection"
		elif is_llm_service_unavailable_error; then
			retry_reason="LLM service unavailable"
		elif is_timeout_error; then
			retry_reason="LLM timeout"
		elif is_midstream_fallback_error; then
			retry_reason="midstream fallback"
		fi
		echo "Retrying model '$model' due to $retry_reason (attempt $((attempt + 1))/$max_attempts)." >&2
		sleep "$STRIX_TRANSIENT_RETRY_BACKOFF_SECONDS"
		attempt=$((attempt + 1))
	done

	return 1
}

is_vertex_not_found_error() {
	# Match Vertex/LiteLLM model-not-found errors.
	# These functions are only called within the Vertex fallback path
	# (gated by is_vertex_model), so the risk of matching target-app
	# 404s is low — strix separates LLM errors from scan findings.
	if grep -Fq 'litellm.NotFoundError: Vertex_aiException' "$STRIX_LOG"; then
		return 0
	fi

	if grep -Fq 'litellm.NotFoundError' "$STRIX_LOG" && grep -Eq '"status"[[:space:]]*:[[:space:]]*"NOT_FOUND"' "$STRIX_LOG"; then
		return 0
	fi

	# Compact Vertex/GCP API error format — require a provider marker
	# (litellm, VertexAI, or Vertex) nearby so we don't misclassify
	# target-application 404 JSON responses as LLM provider errors.
	if grep -Eq '"status"[[:space:]]*:[[:space:]]*"NOT_FOUND"' "$STRIX_LOG" &&
		grep -Eiq '(litellm|VertexAI|Vertex_ai|vertex\.ai|google\.cloud)' "$STRIX_LOG"; then
		return 0
	fi

	if grep -Eq 'Publisher Model .*was not found' "$STRIX_LOG"; then
		return 0
	fi

	return 1
}

is_rate_limit_error() {
	if grep -Fq 'RateLimitError' "$STRIX_LOG"; then
		return 0
	fi

	if grep -Eq '"status"[[:space:]]*:[[:space:]]*"RESOURCE_EXHAUSTED"' "$STRIX_LOG"; then
		return 0
	fi

	# Bare HTTP 429 — require a provider marker so we don't misclassify
	# target-application rate-limit responses as LLM provider errors.
	if grep -Eq '(^|[^0-9])429([^0-9]|$)' "$STRIX_LOG" &&
		grep -Eiq '(litellm|RateLimitError|VertexAI|Vertex_ai|vertex\.ai|openai|anthropic)' "$STRIX_LOG"; then
		return 0
	fi

	return 1
}

## Timeout classification — three-tier hierarchy:
##
##   1. litellm.exceptions.Timeout — SDK-level timeout raised by litellm.
##      Always trusted as a genuine LLM timeout; no provider marker required.
##
##   2. httpx.ReadTimeout / httpcore.ReadTimeout — transport-layer timeouts
##      from litellm/openai SDK internals. These strings can also appear in
##      target-application logs, so an LLM-provider marker (LLM_PROVIDER_ONLY_REGEX)
##      must be present nearby to classify as an LLM timeout.
##
##   3. Bare "Connection timed out" — generic OS/network timeout string.
##      Requires LLM_PROVIDER_ONLY_REGEX to avoid misclassifying target-app
##      or infrastructure network timeouts as LLM errors.
##
## All three tiers feed into infrastructure-error detection and trigger
## fallback model evaluation before the total budget is exhausted.  Same-model
## retries remain reserved for rate-limit and mid-stream fallback errors.
is_timeout_error() {
	# Tier 1: litellm SDK timeout — provider-specific, always trusted.
	if grep -Fq 'litellm.exceptions.Timeout' "$STRIX_LOG"; then
		return 0
	fi

	if grep -Fq 'Strix run timed out after' "$STRIX_LOG"; then
		return 0
	fi

	# Tier 2a: httpx transport timeout — requires LLM provider marker.
	# httpx/httpcore are litellm/openai SDK transport libraries, but their
	# timeout strings could appear in target-application logs too.
	# Require an LLM provider-context marker (LLM_PROVIDER_ONLY_REGEX) to
	# avoid misclassification — the httpx/httpcore/requests transport names
	# in the timeout string itself are not sufficient proof of an LLM call.
	if grep -Fq 'httpx.ReadTimeout' "$STRIX_LOG" &&
		grep -Eiq "$LLM_PROVIDER_ONLY_REGEX" "$STRIX_LOG"; then
		return 0
	fi

	# Tier 2b: httpcore transport timeout — requires LLM provider marker.
	if grep -Fq 'httpcore.ReadTimeout' "$STRIX_LOG" &&
		grep -Eiq "$LLM_PROVIDER_ONLY_REGEX" "$STRIX_LOG"; then
		return 0
	fi

	# Tier 3: Bare "Connection timed out" — require a real LLM provider-context
	# marker.  httpx/httpcore/requests are transport libraries that could
	# appear in any network timeout context, so they are NOT valid markers
	# here.  Use LLM_PROVIDER_ONLY_REGEX (defined alongside
	# PROVIDER_CONTEXT_REGEX) to prevent drift.
	if grep -Fq 'Connection timed out' "$STRIX_LOG" &&
		grep -Eiq "$LLM_PROVIDER_ONLY_REGEX" "$STRIX_LOG"; then
		return 0
	fi

	return 1
}

is_midstream_fallback_error() {
	if grep -Fq 'MidStreamFallbackError' "$STRIX_LOG"; then
		return 0
	fi

	return 1
}

# Narrower variant: LLM providers only, excluding HTTP transport libraries
# (httpx, httpcore, requests). Used for generic transport failures where
# library names alone are insufficient to prove the timeout/connection error
# originated from an LLM provider rather than the target application.
LLM_PROVIDER_ONLY_REGEX='(litellm|openai|anthropic|VertexAI|Vertex_ai|vertex\.ai|google\.cloud)'

# Detect whether the strix log contains evidence of infrastructure-level
# errors (timeout, rate-limit, transport failures) that indicate the scan
# was interrupted or incomplete.  Used as a guard to prevent the
# below-threshold override from silently passing an aborted scan.
has_detected_infrastructure_error() {
	if is_timeout_error; then
		return 0
	fi

	if is_rate_limit_error; then
		return 0
	fi

	if is_midstream_fallback_error; then
		return 0
	fi

	if is_llm_api_connection_error; then
		return 0
	fi

	if is_llm_service_unavailable_error; then
		return 0
	fi

	# Generic strix non-zero exit with known transport/connection errors
	# that don't fall into the specific categories above.
	# Use LLM_PROVIDER_ONLY_REGEX (not PROVIDER_CONTEXT_REGEX) to avoid
	# false positives: PROVIDER_CONTEXT_REGEX includes httpx/httpcore/requests
	# which would self-match on e.g. "requests.exceptions.ConnectionError"
	# from target-application logs.
	if grep -Eiq '(ConnectionError|ConnectionRefusedError|ConnectionResetError|SSLError|ProxyError|NetworkError)' "$STRIX_LOG" &&
		grep -Eiq "$LLM_PROVIDER_ONLY_REGEX" "$STRIX_LOG"; then
		return 0
	fi

	return 1
}

latest_strix_report_dir() {
	local latest=""
	local run_dir

	for run_dir in "$STRIX_REPORTS_DIR"/*; do
		if [ ! -d "$run_dir" ] || [ -L "$run_dir" ]; then
			continue
		fi

		if is_preexisting_report_dir "$run_dir"; then
			continue
		fi

		if [ -z "$latest" ] || [ "$run_dir" -nt "$latest" ]; then
			latest="$run_dir"
		fi
	done

	if [ -z "$latest" ]; then
		return 1
	fi

	echo "$latest"
}

has_only_below_threshold_vulnerabilities() {
	local threshold_rank
	threshold_rank="$(severity_rank "$STRIX_FAIL_ON_MIN_SEVERITY")"

	local found_any_vuln_file=0
	local global_max_rank=-1
	local saw_any_severity=0

	update_max_severity_from_stream() {
		local source_path="$1"
		local line
		local severity
		local rank
		while IFS= read -r line; do
			if [[ "${line^^}" =~ SEVERITY[[:space:]]*:[[:space:][:punct:]]*(CRITICAL|HIGH|MEDIUM|LOW|INFO|INFORMATIONAL|NONE)([[:space:][:punct:]]|$) ]]; then
				severity="${BASH_REMATCH[1]}"
			else
				continue
			fi

			rank="$(severity_rank "$severity")"
			if [ "$rank" -lt 0 ]; then
				continue
			fi

			saw_any_severity=1
			if [ "$rank" -gt "$global_max_rank" ]; then
				global_max_rank="$rank"
			fi
		done < <(grep -Ei 'severity[[:space:]]*:' "$source_path" || true)
	}

	local run_dir
	for run_dir in "$STRIX_REPORTS_DIR"/*; do
		if [ ! -d "$run_dir" ] || [ -L "$run_dir" ]; then
			continue
		fi

		if is_preexisting_report_dir "$run_dir"; then
			continue
		fi

		local vulnerabilities_dir="$run_dir/vulnerabilities"
		if [ ! -d "$vulnerabilities_dir" ] || [ -L "$vulnerabilities_dir" ]; then
			continue
		fi

		local vuln_file

		for vuln_file in "$vulnerabilities_dir"/*.md; do
			if [ ! -f "$vuln_file" ] || [ -L "$vuln_file" ]; then
				continue
			fi

			found_any_vuln_file=1
			update_max_severity_from_stream "$vuln_file"
		done
	done

	if [ "$found_any_vuln_file" -eq 0 ]; then
		update_max_severity_from_stream "$STRIX_LOG"
	fi

	if [ "$saw_any_severity" -eq 0 ]; then
		return 1
	fi

	# Guard against incomplete scans due to infrastructure errors.
	# Use the sticky INFRA_ERROR_DETECTED flag instead of re-reading
	# STRIX_LOG, because STRIX_LOG is overwritten per-attempt.  If an
	# earlier attempt hit an infrastructure error (timeout, rate-limit,
	# transport failure) and produced a partial report that now sits in
	# the reports directory, the *current* STRIX_LOG may show a different
	# failure — or even success — but the partial report's low-severity
	# findings must not be treated as a clean scan result.
	if [ "$INFRA_ERROR_DETECTED" -eq 1 ]; then
		echo "Below-threshold findings detected, but infrastructure errors occurred during this pipeline run; refusing bypass due to potentially incomplete scan." >&2
		return 1
	fi

	if [ "$global_max_rank" -lt "$threshold_rank" ]; then
		echo "Strix findings are below configured fail threshold '$STRIX_FAIL_ON_MIN_SEVERITY'; allowing pipeline continuation." >&2
		return 0
	fi

	return 1
}

has_any_reported_severity_markers() {
	local run_dir
	for run_dir in "$STRIX_REPORTS_DIR"/*; do
		if [ ! -d "$run_dir" ] || [ -L "$run_dir" ]; then
			continue
		fi

		if is_preexisting_report_dir "$run_dir"; then
			continue
		fi

		local vulnerabilities_dir="$run_dir/vulnerabilities"
		if [ ! -d "$vulnerabilities_dir" ] || [ -L "$vulnerabilities_dir" ]; then
			continue
		fi

		local vuln_file
		for vuln_file in "$vulnerabilities_dir"/*.md; do
			if [ ! -f "$vuln_file" ] || [ -L "$vuln_file" ]; then
				continue
			fi
			if grep -Eiq 'severity[[:space:]]*:' "$vuln_file"; then
				return 0
			fi
		done
	done

	if grep -Eiq 'severity[[:space:]]*:' "$STRIX_LOG"; then
		return 0
	fi

	return 1
}

strix_reported_zero_vulnerabilities() {
	if [ "$ZERO_FINDINGS_REPORTED" -eq 1 ]; then
		return 0
	fi

	strix_reported_zero_vulnerabilities_in_file "$STRIX_LOG"
}

strix_reported_zero_vulnerabilities_in_file() {
	local source_path="$1"
	grep -Eq 'Vulnerabilities[[:space:]]+0([^0-9]|$)' "$source_path"
}

should_allow_pull_request_infra_zero_finding_bypass() {
	if ! is_pull_request_event; then
		return 1
	fi

	if [ "$INFRA_ERROR_DETECTED" -ne 1 ]; then
		return 1
	fi

	if has_any_reported_severity_markers; then
		return 1
	fi

	if ! strix_reported_zero_vulnerabilities; then
		return 1
	fi

	echo "Strix reported zero vulnerabilities before provider infrastructure failure; allowing pull request continuation and deferring provider outage follow-up." >&2
	return 0
}

is_hallucinated_endpoint_finding() {
	# Configurable list of source directories to check for endpoints.
	# Defaults to "." (i.e. TARGET_PATH itself) so that both
	# STRIX_TARGET_PATH=./ and STRIX_TARGET_PATH=./src work correctly
	# without producing bogus double-nested paths like ./src/src.
	# Set STRIX_SOURCE_DIRS (space-separated) to override.
	local source_dirs_raw="${STRIX_SOURCE_DIRS:-.}"
	local resolved_dirs=()
	local dir_entry

	# Disable globbing so that entries like "*" or "[" in STRIX_SOURCE_DIRS
	# are not expanded by pathname expansion during word-splitting.
	set -f
	for dir_entry in $source_dirs_raw; do
		local candidate="${TARGET_PATH%/}/$dir_entry"
		if [ -d "$candidate" ] && [ ! -L "$candidate" ]; then
			resolved_dirs+=("$candidate")
		fi
	done
	set +f

	if [ "${#resolved_dirs[@]}" -eq 0 ]; then
		return 1
	fi

	local latest_report_dir
	if ! latest_report_dir="$(latest_strix_report_dir)"; then
		return 1
	fi

	local endpoint_seen=0
	local endpoint_present_in_source=0
	local endpoint
	local vuln_file

	for vuln_file in "$latest_report_dir"/vulnerabilities/*.md; do
		if [ ! -f "$vuln_file" ] || [ -L "$vuln_file" ]; then
			continue
		fi

		while IFS= read -r endpoint; do
			if [ -z "$endpoint" ]; then
				continue
			fi

			endpoint_seen=1
			local search_dir
			for search_dir in "${resolved_dirs[@]}"; do
				# Exclude the strix reports directory and common non-source
				# directories from the source search to prevent accidental
				# matches and reduce runtime (especially when STRIX_TARGET_PATH=./).
				#
				# Each exclude-dir:
				#   STRIX_REPORTS_DIR — strix output itself (would always match).
				#       Both the full path and basename are excluded so that
				#       nested paths like "reports/strix_runs" are also caught.
				#   .git             — VCS internals
				#   node_modules     — JS/TS dependencies (may contain API strings)
				#   vendor           — Go/PHP vendored deps
				#   __pycache__      — Python bytecode cache
				#   .venv            — Python virtualenv
				#   target           — Rust/Java build artifacts
				#   .mypy_cache      — mypy type-check cache
				#   .pytest_cache    — pytest result cache
				#   dist             — common build output directory
				#   build            — common build output directory
				#   .tox             — Python tox test environments
				#   .ruff_cache      — Ruff linter cache
				if grep -r -Fq \
					--exclude-dir="$STRIX_REPORTS_DIR" \
					--exclude-dir="$(basename "$STRIX_REPORTS_DIR")" \
					--exclude-dir=".git" \
					--exclude-dir="node_modules" \
					--exclude-dir="vendor" \
					--exclude-dir="__pycache__" \
					--exclude-dir=".venv" \
					--exclude-dir="target" \
					--exclude-dir=".mypy_cache" \
					--exclude-dir=".pytest_cache" \
					--exclude-dir="dist" \
					--exclude-dir="build" \
					--exclude-dir=".tox" \
					--exclude-dir=".ruff_cache" \
					-- "$endpoint" "$search_dir"; then
					endpoint_present_in_source=1
					break
				fi
			done
			if [ "$endpoint_present_in_source" -eq 1 ]; then
				break
			fi
		done < <(grep -Eo '/api/[[:alnum:]_./-]+' "$vuln_file" | sort -u)

		if [ "$endpoint_present_in_source" -eq 1 ]; then
			break
		fi
	done

	if [ "$endpoint_seen" -eq 0 ]; then
		return 1
	fi

	if [ "$endpoint_present_in_source" -eq 1 ]; then
		return 1
	fi

	echo "Detected Strix report endpoint(s) absent from source; treating as retryable model inconsistency." >&2
	return 0
}

is_model_retryable_error() {
	local model="$1"

	if is_vertex_model "$model" && is_vertex_not_found_error; then
		return 0
	fi

	if is_rate_limit_error; then
		return 0
	fi

	if is_timeout_error; then
		return 0
	fi

	if is_midstream_fallback_error; then
		return 0
	fi

	if is_llm_api_connection_error; then
		return 0
	fi

	if is_llm_service_unavailable_error; then
		return 0
	fi

	if is_hallucinated_endpoint_finding; then
		return 0
	fi

	return 1
}

run_current_target_scan() {
	INFRA_ERROR_DETECTED=0

	if run_strix_with_transient_retry "$PRIMARY_MODEL"; then
		return 0
	fi

	if should_rebalance_pull_request_batch; then
		return 75
	fi

	if has_only_below_threshold_vulnerabilities; then
		return 0
	fi

	if evaluate_pull_request_findings; then
		return 0
	fi

	case "$PR_FINDINGS_DECISION" in
	block_changed | block_unmapped | block_manifest_unverified)
		return 1
		;;
	esac

	if ! is_model_retryable_error "$PRIMARY_MODEL"; then
		echo "Strix quick scan failed with a non-recoverable error." >&2
		return 1
	fi

	FALLBACK_MODELS_RAW="$(fallback_models_raw_for_model "$PRIMARY_MODEL")"
	FALLBACK_MODELS_RAW="${FALLBACK_MODELS_RAW//$'\r'/ }"
	FALLBACK_MODELS_RAW="${FALLBACK_MODELS_RAW//$'\n'/ }"
	read -r -a FALLBACK_MODELS <<<"$FALLBACK_MODELS_RAW"

	fallback_tried=0
	for candidate_raw in "${FALLBACK_MODELS[@]}"; do
		candidate="$(normalize_model "$candidate_raw")"
		if [ -z "$candidate" ] || [ "$candidate" = "$PRIMARY_MODEL" ]; then
			if [ -n "$candidate" ]; then
				echo "Skipping fallback model '$candidate' — same as primary model." >&2
			fi
			continue
		fi

		fallback_tried=1
		if is_vertex_model "$PRIMARY_MODEL"; then
			echo "Primary Vertex model unavailable; retrying with fallback '$candidate'."
		else
			echo "Primary model unavailable; retrying with fallback '$candidate'."
		fi
		if run_strix_with_transient_retry "$candidate"; then
			echo "Strix quick scan succeeded with fallback model '$candidate'."
			return 0
		fi

		if has_only_below_threshold_vulnerabilities; then
			return 0
		fi

		if evaluate_pull_request_findings; then
			return 0
		fi

		case "$PR_FINDINGS_DECISION" in
		block_changed | block_unmapped | block_manifest_unverified)
			return 1
			;;
		esac

		if ! is_model_retryable_error "$candidate"; then
			echo "Strix quick scan failed with a non-recoverable error." >&2
			return 1
		fi
		done

	if is_vertex_model "$PRIMARY_MODEL" && should_allow_pull_request_infra_zero_finding_bypass; then
		return 0
	fi

	if [ "$fallback_tried" -eq 0 ]; then
		local fallback_config_name
		fallback_config_name="$(fallback_models_config_name_for_model "$PRIMARY_MODEL")"
		if [ "${#FALLBACK_MODELS[@]}" -eq 0 ]; then
			echo "ERROR: No fallback models configured ($fallback_config_name is empty). Configure distinct models." >&2
		else
			echo "ERROR: All configured fallback models are the same as the primary model '$PRIMARY_MODEL'. Configure distinct models in $fallback_config_name." >&2
		fi
	fi

	if is_vertex_model "$PRIMARY_MODEL"; then
		echo "Configured Vertex model and fallback models were unavailable." >&2
	else
		echo "Configured model and fallback models were unavailable." >&2
	fi
	return 1
}

prepare_pull_request_scan_scope

run_pull_request_batch_files() {
	local batch_label="$1"
	local total_batches="$2"
	local batch_files_text="$3"
	local -a batch_files=()
	local previous_target_path="$TARGET_PATH"
	local previous_target_is_internal="$TARGET_PATH_IS_INTERNAL_PR_SCOPE"
	mapfile -t batch_files <<<"$batch_files_text"
	if [ "${#batch_files[@]}" -eq 0 ]; then
		echo "ERROR: pull request Strix batch '$batch_label' has no files to scan." >&2
		return 1
	fi

	local previous_batch_file_count="$CURRENT_PULL_REQUEST_BATCH_FILE_COUNT"
	CURRENT_PULL_REQUEST_BATCH_FILE_COUNT="${#batch_files[@]}"
	if ! build_pull_request_scope_dir "${batch_files[@]}"; then
		CURRENT_PULL_REQUEST_BATCH_FILE_COUNT="$previous_batch_file_count"
		TARGET_PATH="$previous_target_path"
		TARGET_PATH_IS_INTERNAL_PR_SCOPE="$previous_target_is_internal"
		return 1
	fi
	TARGET_PATH="$LAST_PULL_REQUEST_SCOPE_DIR"
	TARGET_PATH_IS_INTERNAL_PR_SCOPE=1
	echo "Running pull request Strix batch ${batch_label}/${total_batches}." >&2

	run_current_target_scan
	local batch_rc=$?
	if [ "$batch_rc" -eq 0 ]; then
		capture_preexisting_report_dirs
		CURRENT_PULL_REQUEST_BATCH_FILE_COUNT="$previous_batch_file_count"
		TARGET_PATH="$previous_target_path"
		TARGET_PATH_IS_INTERNAL_PR_SCOPE="$previous_target_is_internal"
		return 0
	fi

	if [ "$batch_rc" -eq 75 ]; then
		local midpoint=$((CURRENT_PULL_REQUEST_BATCH_FILE_COUNT / 2))
		if [ "$midpoint" -le 0 ]; then
			midpoint=1
		fi
		echo "Rebalancing pull request Strix batch ${batch_label}/${total_batches} into smaller batches after timeout." >&2
		local first_half second_half
		first_half="$(printf '%s\n' "${batch_files[@]:0:midpoint}")"
		second_half="$(printf '%s\n' "${batch_files[@]:midpoint}")"
		if ! run_pull_request_batch_files "${batch_label}.1" "$total_batches" "$first_half"; then
			CURRENT_PULL_REQUEST_BATCH_FILE_COUNT="$previous_batch_file_count"
			TARGET_PATH="$previous_target_path"
			TARGET_PATH_IS_INTERNAL_PR_SCOPE="$previous_target_is_internal"
			return 1
		fi
		if ! run_pull_request_batch_files "${batch_label}.2" "$total_batches" "$second_half"; then
			CURRENT_PULL_REQUEST_BATCH_FILE_COUNT="$previous_batch_file_count"
			TARGET_PATH="$previous_target_path"
			TARGET_PATH_IS_INTERNAL_PR_SCOPE="$previous_target_is_internal"
			return 1
		fi
		CURRENT_PULL_REQUEST_BATCH_FILE_COUNT="$previous_batch_file_count"
		TARGET_PATH="$previous_target_path"
		TARGET_PATH_IS_INTERNAL_PR_SCOPE="$previous_target_is_internal"
		return 0
	fi

	CURRENT_PULL_REQUEST_BATCH_FILE_COUNT="$previous_batch_file_count"
	TARGET_PATH="$previous_target_path"
	TARGET_PATH_IS_INTERNAL_PR_SCOPE="$previous_target_is_internal"
	return 1
}

if [ "${#PULL_REQUEST_SCOPE_FILE_BATCHES[@]}" -gt 0 ]; then
	total_batches="${#PULL_REQUEST_SCOPE_FILE_BATCHES[@]}"
	batch_number=0
	for batch_files_text in "${PULL_REQUEST_SCOPE_FILE_BATCHES[@]}"; do
		batch_number=$((batch_number + 1))
		if ! run_pull_request_batch_files "$batch_number" "$total_batches" "$batch_files_text"; then
			exit 1
		fi
	done
	exit 0
fi

if run_current_target_scan; then
	exit 0
fi

exit 1
