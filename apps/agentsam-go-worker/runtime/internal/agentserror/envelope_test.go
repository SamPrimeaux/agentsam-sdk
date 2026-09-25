package agentserror

import "testing"

func TestInputInvalidMatchesCanonicalEnvelopeSemantics(t *testing.T) {
	envelope := New("input_invalid", "files is required", 400)
	if envelope.OK {
		t.Fatal("expected ok=false")
	}
	if envelope.SchemaVersion != 1 {
		t.Fatalf("schema_version=%d", envelope.SchemaVersion)
	}
	if envelope.Code != "INVALID_ARGUMENT" || envelope.Reason != "input_invalid" {
		t.Fatalf("unexpected code/reason: %s %s", envelope.Code, envelope.Reason)
	}
	if envelope.Severity != "blocking_user_fixable" || envelope.ResolutionOwner != "user" {
		t.Fatalf("unexpected severity/owner: %s %s", envelope.Severity, envelope.ResolutionOwner)
	}
	if envelope.Source.Kind != "runtime" || envelope.Source.Name != "agentsam-go-runtime" {
		t.Fatalf("unexpected source: %#v", envelope.Source)
	}
	if envelope.Remediation.Action != "change_input" || envelope.Retryable {
		t.Fatalf("unexpected remediation/retryability: %#v retry=%v", envelope.Remediation, envelope.Retryable)
	}
	if envelope.HTTPStatus != 400 || envelope.GRPCStatus != 3 {
		t.Fatalf("unexpected transport status: http=%d grpc=%d", envelope.HTTPStatus, envelope.GRPCStatus)
	}
	if envelope.Fingerprint == "" {
		t.Fatal("fingerprint missing")
	}
}
