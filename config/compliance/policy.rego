package compliance.ui

import rego.v1

default allow := true

deny contains msg if {
	input.features.auth_enabled
	input.platform.opa.approved_auth_providers
	count(input.platform.opa.approved_auth_providers) > 0
	not input.auth_provider in input.platform.opa.approved_auth_providers
	msg := sprintf("auth provider '%s' is not in the approved list %v", [input.auth_provider, input.platform.opa.approved_auth_providers])
}

deny contains msg if {
	input.agent.endpoint != ""
	suffixes := input.platform.opa.internal_endpoint_suffixes
	count(suffixes) > 0
	not endpoint_allowed(input.agent.endpoint, suffixes)
	msg := sprintf("agent endpoint '%s' does not match any approved internal suffix %v", [input.agent.endpoint, suffixes])
}

deny contains msg if {
	max_days := input.platform.opa.max_session_ttl_days
	max_days > 0
	input.security.session.max_age_days > max_days
	msg := sprintf("session TTL %d days exceeds maximum allowed %d days", [input.security.session.max_age_days, max_days])
}

deny contains msg if {
	input.platform.opa.restrict_debug_mode
	input.features.debug_mode_default
	msg := "debug_mode_default cannot be enabled in this environment"
}

deny contains msg if {
	restricted := input.platform.opa.restricted_features
	some feature in restricted
	input.features[feature]
	msg := sprintf("feature '%s' is restricted by policy", [feature])
}

deny contains msg if {
	max_rate := input.platform.opa.max_rate_limit
	max_rate > 0
	input.security.rate_limit.max > max_rate
	msg := sprintf("rate limit %d exceeds policy maximum %d", [input.security.rate_limit.max, max_rate])
}

endpoint_allowed(endpoint, suffixes) if {
	some suffix in suffixes
	endswith(endpoint, suffix)
}

allow := false if {
	count(deny) > 0
}

violations := deny
