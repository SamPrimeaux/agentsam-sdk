package agentserror

import (
	"crypto/sha256"
	"encoding/hex"
)

type Source struct {
	Kind    string `json:"kind"`
	Name    string `json:"name"`
	Service string `json:"service"`
}

type Remediation struct {
	Action    string  `json:"action"`
	Message   *string `json:"message"`
	Automatic bool    `json:"automatic"`
	Command   *string `json:"command"`
	URL       *string `json:"url"`
}

type Envelope struct {
	OK              bool        `json:"ok"`
	SchemaVersion   int         `json:"schema_version"`
	Code            string      `json:"code"`
	Reason          string      `json:"reason"`
	Severity        string      `json:"severity"`
	Source          Source      `json:"source"`
	ResolutionOwner string      `json:"resolution_owner"`
	Domain          string      `json:"domain"`
	Tool            any         `json:"tool"`
	Stage           string      `json:"stage"`
	Message         string      `json:"message"`
	Retryable       bool        `json:"retryable"`
	RetryAfterMS    any         `json:"retry_after_ms"`
	Remediation     Remediation `json:"remediation"`
	Resource        any         `json:"resource"`
	Native          any         `json:"native"`
	Environment     any         `json:"environment"`
	HTTPStatus      int         `json:"http_status"`
	GRPCStatus      int         `json:"grpc_status"`
	Transport       string      `json:"transport"`
	Provider        any         `json:"provider"`
	ProviderCode    any         `json:"provider_code"`
	RequestID       any         `json:"request_id"`
	TraceID         any         `json:"trace_id"`
	Fingerprint     string      `json:"fingerprint"`
	OccurrenceCount int         `json:"occurrence_count"`
	Details         any         `json:"details"`
}

type policy struct {
	code, severity, owner, remediation string
	grpc                               int
}

var policies = map[string]policy{
	"input_invalid":         {code: "INVALID_ARGUMENT", severity: "blocking_user_fixable", owner: "user", remediation: "change_input", grpc: 3},
	"unsupported_operation": {code: "UNIMPLEMENTED", severity: "blocking_user_fixable", owner: "user", remediation: "change_configuration", grpc: 12},
	"unknown":               {code: "UNKNOWN", severity: "blocking_internal", owner: "unknown", remediation: "inspect_platform", grpc: 2},
}

func New(reason, message string, httpStatus int) Envelope {
	p, ok := policies[reason]
	if !ok {
		reason = "unknown"
		p = policies[reason]
	}
	sum := sha256.Sum256([]byte("runtime|agentsam-go-runtime|" + reason + "|request"))
	return Envelope{
		OK:              false,
		SchemaVersion:   1,
		Code:            p.code,
		Reason:          reason,
		Severity:        p.severity,
		Source:          Source{Kind: "runtime", Name: "agentsam-go-runtime", Service: "agentsam-go-worker"},
		ResolutionOwner: p.owner,
		Domain:          "runtime",
		Tool:            nil,
		Stage:           "request",
		Message:         message,
		Retryable:       false,
		RetryAfterMS:    nil,
		Remediation:     Remediation{Action: p.remediation, Automatic: false},
		Resource:        nil,
		Native:          nil,
		Environment:     nil,
		HTTPStatus:      httpStatus,
		GRPCStatus:      p.grpc,
		Transport:       "http",
		Provider:        nil,
		ProviderCode:    nil,
		RequestID:       nil,
		TraceID:         nil,
		Fingerprint:     "err_" + hex.EncodeToString(sum[:8]),
		OccurrenceCount: 1,
		Details:         nil,
	}
}
