#!/usr/bin/env bash
# Helper functions shared by the Strix CI gate and its self-test harness.
# Keep this dependency explicit so PR-scoped Strix scans include the full gate harness.

trim_whitespace() {
	local value="${1-}"
	# Collapse only the leading/trailing shell whitespace that can be introduced by
	# secret files or workflow inputs. Internal spacing remains meaningful for the
	# few callers that parse lists after trimming each token.
	value="${value#"${value%%[!$' \t\r\n']*}"}"
	value="${value%"${value##*[!$' \t\r\n']}"}"
	printf '%s\n' "$value"
}

sanitize_provider_name() {
	local provider
	provider="$(trim_whitespace "${1-}")"
	if [ -z "$provider" ]; then
		return 1
	fi
	if [[ ! "$provider" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]]; then
		echo "ERROR: STRIX_LLM_DEFAULT_PROVIDER contains unsupported characters: '$provider'." >&2
		return 2
	fi
	printf '%s\n' "$provider"
}

is_vertex_resource_path() {
	local path
	path="$(trim_whitespace "${1-}")"
	if [ -z "$path" ] || [[ "$path" =~ [[:space:][:cntrl:]] ]]; then
		return 1
	fi

	IFS='/' read -r -a parts <<<"$path"
	local part
	for part in "${parts[@]}"; do
		if [ -z "$part" ]; then
			return 1
		fi
	done

	case "${#parts[@]}" in
	2)
		[ "${parts[0]}" = "models" ]
		;;
	4)
		[ "${parts[0]}" = "publishers" ] && [ "${parts[2]}" = "models" ]
		;;
	6)
		[ "${parts[0]}" = "projects" ] && [ "${parts[2]}" = "locations" ] && [ "${parts[4]}" = "models" ]
		;;
	8)
		[ "${parts[0]}" = "projects" ] && [ "${parts[2]}" = "locations" ] && [ "${parts[4]}" = "publishers" ] && [ "${parts[6]}" = "models" ]
		;;
	*)
		return 1
		;;
	esac
}

extract_vertex_model_id() {
	local model
	model="$(trim_whitespace "${1-}")"
	if is_vertex_resource_path "$model"; then
		printf '%s\n' "${model##*/}"
	else
		printf '%s\n' "$model"
	fi
}

normalize_model() {
	local model
	model="$(trim_whitespace "${1-}")"
	if [ -z "$model" ]; then
		return 0
	fi

	if is_vertex_resource_path "$model"; then
		local provider
		provider="$(sanitize_provider_name "vertex_ai")" || return $?
		printf '%s/%s\n' "$provider" "$(extract_vertex_model_id "$model")"
		return 0
	fi

	local provider="${DEFAULT_PROVIDER:-}"
	if [ -z "$provider" ]; then
		provider="vertex_ai"
	fi
	provider="$(sanitize_provider_name "$provider")" || return $?

	case "$model" in
	projects/* | models/* | publishers/*)
		printf '%s\n' "$model"
		return 0
		;;
	*/*)
		printf '%s\n' "$model"
		return 0
		;;
	*)
		printf '%s/%s\n' "$provider" "$model"
		return 0
		;;
	esac
}

model_requires_vertex_auth() {
	local model normalized_model
	model="$(trim_whitespace "${1-}")"
	if [ -z "$model" ]; then
		return 1
	fi

	normalized_model="$(normalize_model "$model")" || return $?
	case "$normalized_model" in
	vertex_ai/* | vertex_ai_beta/*)
		return 0
		;;
	*)
		return 1
		;;
	esac
}
