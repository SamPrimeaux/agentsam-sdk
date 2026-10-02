package agentsamhooks

import (
	"context"
	"testing"
	"time"
)

func TestRuntimeComposesPortablePreToolHooks(t *testing.T) {
	runtime := NewRuntime(nil)
	if err := runtime.Register("pre_tool_use", Definition{
		ID: "policy", Priority: 10, Timeout: time.Second,
		Handler: func(ctx context.Context, envelope Envelope) (*Output, error) {
			args := envelope.Input["tool_args"].(map[string]any)
			args["bounded"] = true
			return &Output{PermissionDecision: "allow", ModifiedArgs: args, AdditionalContext: "Go policy"}, nil
		},
	}); err != nil { t.Fatal(err) }
	result, err := runtime.Dispatch(context.Background(), "pre_tool_use", map[string]any{
		"tool_name": "read", "tool_args": map[string]any{"value": float64(1)},
	}, Invocation{SessionID: "session-test"}, ".")
	if err != nil { t.Fatal(err) }
	if result.Output.PermissionDecision != "allow" { t.Fatalf("decision = %q", result.Output.PermissionDecision) }
	if result.Output.AdditionalContext != "Go policy" { t.Fatalf("context = %q", result.Output.AdditionalContext) }
	if result.Input["tool_args"].(map[string]any)["bounded"] != true { t.Fatal("modified args not applied") }
	if len(result.Receipts) != 1 || result.Receipts[0].Schema != ReceiptSchema { t.Fatal("receipt missing") }
}

func TestPermissionHooksFailClosed(t *testing.T) {
	runtime := NewRuntime(nil)
	_ = runtime.Register("pre_model_use", Definition{
		ID: "broken", Timeout: time.Second,
		Handler: func(context.Context, Envelope) (*Output, error) { return nil, context.DeadlineExceeded },
	})
	result, err := runtime.Dispatch(context.Background(), "pre_model_use", map[string]any{"request": map[string]any{}}, Invocation{}, ".")
	if err != nil { t.Fatal(err) }
	if result.Output.PermissionDecision != "deny" { t.Fatalf("decision = %q", result.Output.PermissionDecision) }
}
