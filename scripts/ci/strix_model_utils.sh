#!/usr/bin/env bash

trim_whitespace() {
	local value="$1"
	value="${value#"${value%%[![:space:]]*}"}"
	value="${value%"${value##*[![:space:]]}"}"
	printf '%s\n' "$value"
}

is_safe_model_token() {
	[[ "$1" =~ ^[[:alnum:]_.:-]+$ ]]
}

sanitize_provider_name() {
	local provider
	provider="$(trim_whitespace "$1")"
	if [ -z "$provider" ]; then
		return 1
	fi
	if ! is_safe_model_token "$provider"; then
		echo "ERROR: provider name '$provider' contains unsupported characters." >&2
		return 2
	fi
	printf '%s\n' "$provider"
}

validate_model_identifier() {
	local identifier
	identifier="$(trim_whitespace "$1")"
	if [ -z "$identifier" ]; then
		echo "ERROR: model identifier must not be empty." >&2
		return 2
	fi

	local segment
	local -a _model_segments
	IFS='/' read -r -a _model_segments <<<"$identifier"
	for segment in "${_model_segments[@]}"; do
		if [ -z "$segment" ] || ! is_safe_model_token "$segment"; then
			echo "ERROR: model identifier '$identifier' contains unsupported characters." >&2
			return 2
		fi
	done

	printf '%s\n' "$identifier"
}

is_provider_qualified_model() {
	case "$1" in
	vertex_ai/* | vertex_ai_beta/* | openai/* | anthropic/* | azure/* | gemini/* | bedrock/* | groq/* | mistral/* | cohere/* | ollama/* | huggingface/* | xai/*)
		return 0
		;;
	*)
		return 1
		;;
	esac
}

# Extract the provider prefix from a provider-qualified model identifier
# (e.g. "openai/gpt-5" → "openai", "vertex_ai/gemini-2.5-pro" → "vertex_ai").
# Returns 1 (and prints nothing) for bare/unqualified inputs.
extract_model_provider() {
	local model="$1"
	case "$model" in
	*/*)
		printf '%s\n' "${model%%/*}"
		return 0
		;;
	esac
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

model_requires_gcp_credentials() {
	is_vertex_model "$1"
}

model_requires_llm_api_key() {
	if is_vertex_model "$1"; then
		return 1
	fi
	return 0
}

is_vertex_resource_path() {
	# Validate Vertex AI resource path formats with strict segment-boundary
	# enforcement. We split on '/' using `read -ra` (shellcheck-safe) to reject
	# malformed paths like "projects/a/b/locations/…".
	local path="$1"
	[[ -z "$path" || "$path" =~ [[:space:]] ]] && return 1

	local -a parts
	IFS='/' read -ra parts <<<"$path"

	local n=${#parts[@]}
	case "$n" in
	2) # models/<id>
		[[ "${parts[0]}" == "models" && -n "${parts[1]}" ]]
		return $?
		;;
	4) # publishers/<p>/models/<id>
		[[ "${parts[0]}" == "publishers" && -n "${parts[1]}" && "${parts[2]}" == "models" && -n "${parts[3]}" ]]
		return $?
		;;
	6) # projects/<p>/locations/<l>/models/<id>
		[[ "${parts[0]}" == "projects" && -n "${parts[1]}" && "${parts[2]}" == "locations" && -n "${parts[3]}" && "${parts[4]}" == "models" && -n "${parts[5]}" ]]
		return $?
		;;
	8) # projects/<p>/locations/<l>/publishers/<pub>/models/<id>
		[[ "${parts[0]}" == "projects" && -n "${parts[1]}" && "${parts[2]}" == "locations" && -n "${parts[3]}" && "${parts[4]}" == "publishers" && -n "${parts[5]}" && "${parts[6]}" == "models" && -n "${parts[7]}" ]]
		return $?
		;;
	*)
		return 1
		;;
	esac
}

extract_vertex_model_id() {
	local raw_model="$1"
	[[ "$raw_model" =~ [[:space:]] ]] && return 1

	local -a parts
	IFS='/' read -ra parts <<<"$raw_model"

	local n=${#parts[@]}
	case "$n" in
	8) # projects/<p>/locations/<l>/publishers/<pub>/models/<id>
		if [[ "${parts[0]}" == "projects" && "${parts[2]}" == "locations" && "${parts[4]}" == "publishers" && "${parts[6]}" == "models" ]]; then
			printf '%s\n' "${parts[7]}"
			return 0
		fi
		;;
	6) # projects/<p>/locations/<l>/models/<id>
		if [[ "${parts[0]}" == "projects" && "${parts[2]}" == "locations" && "${parts[4]}" == "models" ]]; then
			printf '%s\n' "${parts[5]}"
			return 0
		fi
		;;
	4) # publishers/<pub>/models/<id>
		if [[ "${parts[0]}" == "publishers" && "${parts[2]}" == "models" ]]; then
			printf '%s\n' "${parts[3]}"
			return 0
		fi
		;;
	2) # models/<id>
		if [[ "${parts[0]}" == "models" ]]; then
			printf '%s\n' "${parts[1]}"
			return 0
		fi
		;;
	esac

	printf '%s\n' "$raw_model"
}

normalize_model() {
	local raw_model="$1"
	raw_model="$(trim_whitespace "$raw_model")"
	if [ -z "$raw_model" ]; then
		echo "ERROR: STRIX_LLM model identifier must not be empty." >&2
		return 2
	fi

	if is_provider_qualified_model "$raw_model"; then
		validate_model_identifier "$raw_model"
		return $?
	fi

	if [[ "$raw_model" == */* ]] && ! is_vertex_resource_path "$raw_model"; then
		validate_model_identifier "$raw_model"
		return $?
	fi

	local provider="$DEFAULT_PROVIDER"
	provider="${provider%/}"
	local sanitized_provider
	if sanitized_provider="$(sanitize_provider_name "$provider")"; then
		provider="$sanitized_provider"
	else
		case $? in
		1)
			provider=""
			;;
		*)
			return 2
			;;
		esac
	fi

	if is_vertex_resource_path "$raw_model"; then
		local vertex_provider="$provider"
		local vertex_model_id
		if [ "$vertex_provider" != "vertex_ai" ] && [ "$vertex_provider" != "vertex_ai_beta" ]; then
			vertex_provider="vertex_ai"
		fi

		vertex_model_id="$(extract_vertex_model_id "$raw_model")" || return 2
		validate_model_identifier "$vertex_provider/$vertex_model_id"
		return $?
	fi

	if [ -z "$provider" ]; then
		echo "ERROR: STRIX_LLM must be provider-qualified (e.g. 'vertex_ai/<model>', 'gemini/<model>', 'openai/<model>', 'anthropic/<model>'); got bare model '$raw_model'." >&2
		return 2
	fi

	local normalized_model="$raw_model"
	if [ "$provider" = "vertex_ai" ] || [ "$provider" = "vertex_ai_beta" ]; then
		normalized_model="$(extract_vertex_model_id "$raw_model")" || return 2
	fi

	validate_model_identifier "$provider/$normalized_model"
}
