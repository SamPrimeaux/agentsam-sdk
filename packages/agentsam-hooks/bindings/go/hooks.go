// Package agentsamhooks implements the provider-neutral agentsam.hook.v1
// envelope and an ordered callback runtime. Command and HTTP transports can
// exchange the same JSON without changing lifecycle semantics.
package agentsamhooks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	ProtocolSchema = "agentsam.hook.v1"
	ReceiptSchema  = "agentsam.hook.receipt.v1"
)

var Events = []string{
	"session_start", "session_end", "user_prompt_submitted", "user_prompt_transformed",
	"pre_model_use", "post_model_use", "pre_tool_use", "post_tool_use",
	"post_tool_use_failure", "error_occurred", "agent_stop", "subagent_start", "subagent_stop",
}

var eventSet = func() map[string]bool {
	values := map[string]bool{}
	for _, event := range Events { values[event] = true }
	return values
}()

// Invocation carries host-owned correlation IDs, never credentials.
type Invocation struct {
	SessionID     string         `json:"session_id,omitempty"`
	RunID         string         `json:"run_id,omitempty"`
	TurnID        string         `json:"turn_id,omitempty"`
	MessageID     string         `json:"message_id,omitempty"`
	AgentID       string         `json:"agent_id,omitempty"`
	ParentAgentID string         `json:"parent_agent_id,omitempty"`
	Source        string         `json:"source,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

type Envelope struct {
	Schema     string         `json:"schema"`
	Hook       string         `json:"hook"`
	Timestamp  int64          `json:"timestamp"`
	CWD        string         `json:"cwd"`
	Invocation Invocation     `json:"invocation"`
	Input      map[string]any `json:"input"`
}

type Output struct {
	PermissionDecision       string         `json:"permission_decision,omitempty"`
	PermissionDecisionReason string         `json:"permission_decision_reason,omitempty"`
	ModifiedArgs             map[string]any `json:"modified_args,omitempty"`
	ModifiedRequest          map[string]any `json:"modified_request,omitempty"`
	ModifiedResult           any            `json:"modified_result,omitempty"`
	ModifiedPrompt           *string        `json:"modified_prompt,omitempty"`
	ModifiedTransformedPrompt *string       `json:"modified_transformed_prompt,omitempty"`
	AdditionalContext        string         `json:"additional_context,omitempty"`
	SuppressOutput           bool           `json:"suppress_output,omitempty"`
	ErrorHandling            string         `json:"error_handling,omitempty"`
	RetryCount               int            `json:"retry_count,omitempty"`
	UserNotification         string         `json:"user_notification,omitempty"`
	Decision                 string         `json:"decision,omitempty"`
	Reason                   string         `json:"reason,omitempty"`
	CleanupActions           []string       `json:"cleanup_actions,omitempty"`
	SessionSummary           string         `json:"session_summary,omitempty"`
	Metadata                 map[string]any `json:"metadata,omitempty"`
}

func (o Output) Validate(event string) error {
	if o.PermissionDecision != "" && o.PermissionDecision != "allow" && o.PermissionDecision != "deny" && o.PermissionDecision != "ask" {
		return fmt.Errorf("invalid_permission_decision:%s", o.PermissionDecision)
	}
	if o.PermissionDecision != "" && event != "pre_tool_use" && event != "pre_model_use" {
		return fmt.Errorf("permission_decision_not_supported:%s", event)
	}
	if o.ErrorHandling != "" && o.ErrorHandling != "retry" && o.ErrorHandling != "skip" && o.ErrorHandling != "abort" {
		return fmt.Errorf("invalid_error_handling:%s", o.ErrorHandling)
	}
	if o.ErrorHandling != "" && event != "error_occurred" { return fmt.Errorf("error_handling_not_supported:%s", event) }
	if o.RetryCount < 0 || o.RetryCount > 10 { return errors.New("retry_count_must_be_between_0_and_10") }
	if o.Decision != "" && (event != "agent_stop" || (o.Decision != "allow" && o.Decision != "block")) {
		return fmt.Errorf("invalid_stop_decision:%s", o.Decision)
	}
	return nil
}

type Handler func(context.Context, Envelope) (*Output, error)

type Definition struct {
	ID          string
	Priority    float64
	Timeout     time.Duration
	FailureMode string
	Disabled    bool
	Handler     Handler
	Metadata    map[string]any
}

type Receipt struct {
	Schema      string         `json:"schema"`
	HookID      string         `json:"hook_id"`
	Hook        string         `json:"hook"`
	Status      string         `json:"status"`
	StartedAt   int64          `json:"started_at"`
	CompletedAt int64          `json:"completed_at"`
	DurationMS  int64          `json:"duration_ms"`
	InputKeys   []string       `json:"input_keys"`
	OutputKeys  []string       `json:"output_keys"`
	Error       map[string]any `json:"error,omitempty"`
}

type DispatchResult struct {
	Schema   string           `json:"schema"`
	Hook     string           `json:"hook"`
	Input    map[string]any   `json:"input"`
	Output   Output           `json:"output"`
	Receipts []Receipt        `json:"receipts"`
	Errors   []map[string]any `json:"errors"`
}

type Runtime struct {
	mu        sync.RWMutex
	hooks     map[string][]Definition
	now       func() time.Time
	onReceipt func(Receipt)
}

func NewRuntime(onReceipt func(Receipt)) *Runtime {
	return &Runtime{hooks: map[string][]Definition{}, now: time.Now, onReceipt: onReceipt}
}

func normalizeEvent(event string) (string, error) {
	event = strings.TrimSpace(event)
	if !eventSet[event] { return "", fmt.Errorf("unsupported_hook_event:%s", event) }
	return event, nil
}

func (r *Runtime) Register(event string, definition Definition) error {
	event, err := normalizeEvent(event); if err != nil { return err }
	if definition.ID == "" || definition.Handler == nil { return errors.New("hook_id_and_handler_required") }
	if definition.Timeout <= 0 { definition.Timeout = 10 * time.Second }
	if definition.FailureMode == "" {
		if event == "pre_tool_use" || event == "pre_model_use" { definition.FailureMode = "closed" } else { definition.FailureMode = "open" }
	}
	if definition.FailureMode != "open" && definition.FailureMode != "closed" && definition.FailureMode != "error" {
		return fmt.Errorf("invalid_hook_failure_mode:%s", definition.FailureMode)
	}
	r.mu.Lock(); defer r.mu.Unlock()
	for _, row := range r.hooks[event] { if row.ID == definition.ID { return fmt.Errorf("duplicate_hook_id:%s", definition.ID) } }
	r.hooks[event] = append(r.hooks[event], definition)
	sort.Slice(r.hooks[event], func(i, j int) bool {
		if r.hooks[event][i].Priority == r.hooks[event][j].Priority { return r.hooks[event][i].ID < r.hooks[event][j].ID }
		return r.hooks[event][i].Priority < r.hooks[event][j].Priority
	})
	return nil
}

func cloneMap(value map[string]any) map[string]any {
	if value == nil { return map[string]any{} }
	encoded, _ := json.Marshal(value); output := map[string]any{}; _ = json.Unmarshal(encoded, &output); return output
}

func keys(value map[string]any) []string { output := make([]string, 0, len(value)); for key := range value { output = append(output, key) }; sort.Strings(output); return output }

func outputKeys(value Output) []string { encoded, _ := json.Marshal(value); object := map[string]any{}; _ = json.Unmarshal(encoded, &object); return keys(object) }

func apply(event string, input map[string]any, output Output) {
	if output.ModifiedArgs != nil { input["tool_args"] = cloneMap(output.ModifiedArgs) }
	if output.ModifiedRequest != nil { input["request"] = cloneMap(output.ModifiedRequest) }
	if output.ModifiedResult != nil { if event == "post_tool_use" { input["tool_result"] = output.ModifiedResult } else { input["model_result"] = output.ModifiedResult } }
	if output.ModifiedPrompt != nil { input["prompt"] = *output.ModifiedPrompt }
	if output.ModifiedTransformedPrompt != nil { input["transformed_prompt"] = *output.ModifiedTransformedPrompt }
}

func merge(target *Output, update Output, contexts *[]string) {
	if update.PermissionDecision != "" { target.PermissionDecision = update.PermissionDecision; target.PermissionDecisionReason = update.PermissionDecisionReason }
	if update.ModifiedArgs != nil { target.ModifiedArgs = update.ModifiedArgs }; if update.ModifiedRequest != nil { target.ModifiedRequest = update.ModifiedRequest }
	if update.ModifiedResult != nil { target.ModifiedResult = update.ModifiedResult }; if update.ModifiedPrompt != nil { target.ModifiedPrompt = update.ModifiedPrompt }
	if update.ModifiedTransformedPrompt != nil { target.ModifiedTransformedPrompt = update.ModifiedTransformedPrompt }
	if update.AdditionalContext != "" { *contexts = append(*contexts, update.AdditionalContext) }
	target.SuppressOutput = target.SuppressOutput || update.SuppressOutput
	if update.ErrorHandling != "" { target.ErrorHandling = update.ErrorHandling }; if update.RetryCount > target.RetryCount { target.RetryCount = update.RetryCount }
	if update.UserNotification != "" { target.UserNotification = update.UserNotification }; if update.Decision != "" { target.Decision = update.Decision; target.Reason = update.Reason }
	target.CleanupActions = append(target.CleanupActions, update.CleanupActions...); if update.SessionSummary != "" { target.SessionSummary = update.SessionSummary }
}

func (r *Runtime) Dispatch(ctx context.Context, event string, input map[string]any, invocation Invocation, cwd string) (DispatchResult, error) {
	event, err := normalizeEvent(event); if err != nil { return DispatchResult{}, err }
	if cwd == "" { cwd, _ = os.Getwd() }
	r.mu.RLock(); definitions := append([]Definition(nil), r.hooks[event]...); r.mu.RUnlock()
	working := cloneMap(input); combined := Output{}; contexts := []string{}; receipts := []Receipt{}; failures := []map[string]any{}
	for _, definition := range definitions {
		if definition.Disabled { continue }
		started := r.now(); envelope := Envelope{Schema: ProtocolSchema, Hook: event, Timestamp: started.UnixMilli(), CWD: cwd, Invocation: invocation, Input: cloneMap(working)}
		hookCtx, cancel := context.WithTimeout(ctx, definition.Timeout); output, hookErr := definition.Handler(hookCtx, envelope); cancel(); completed := r.now()
		receipt := Receipt{Schema: ReceiptSchema, HookID: definition.ID, Hook: event, StartedAt: started.UnixMilli(), CompletedAt: completed.UnixMilli(), DurationMS: completed.Sub(started).Milliseconds(), InputKeys: keys(envelope.Input)}
		if hookErr == nil && output != nil { hookErr = output.Validate(event) }
		if hookErr != nil {
			receipt.Status = "failed"; receipt.Error = map[string]any{"code": "AGENTSAM_HOOK_FAILED", "message": hookErr.Error()}; failures = append(failures, map[string]any{"hook_id": definition.ID, "hook": event, "message": hookErr.Error()})
			receipts = append(receipts, receipt); if r.onReceipt != nil { r.onReceipt(receipt) }
			if definition.FailureMode == "error" { return DispatchResult{}, fmt.Errorf("hook_execution_failed:%s: %w", definition.ID, hookErr) }
			if definition.FailureMode == "closed" { combined.PermissionDecision = "deny"; combined.PermissionDecisionReason = fmt.Sprintf("Hook '%s' failed closed: %s", definition.ID, hookErr); break }
			continue
		}
		if output == nil { output = &Output{} }; receipt.Status = "completed"; receipt.OutputKeys = outputKeys(*output); receipts = append(receipts, receipt); if r.onReceipt != nil { r.onReceipt(receipt) }
		apply(event, working, *output); merge(&combined, *output, &contexts)
		if (event == "pre_tool_use" || event == "pre_model_use") && (output.PermissionDecision == "deny" || output.PermissionDecision == "ask") { break }
		if event == "agent_stop" && output.Decision == "block" { break }
	}
	combined.AdditionalContext = strings.Join(contexts, "\n\n")
	return DispatchResult{Schema: "agentsam.hook.dispatch.v1", Hook: event, Input: working, Output: combined, Receipts: receipts, Errors: failures}, nil
}
