//! Portable `agentsam.hook.v1` models and ordered callback runtime.
//! The JSON envelope is shared by callbacks, subprocesses, and HTTP hosts.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fmt::{Display, Formatter};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

mod errors_generated;
pub use errors_generated::{error_policy, normalize_error_reason, ErrorPolicy, ERROR_REASON_ALIASES, ERROR_REASON_POLICIES, ERROR_SCHEMA_VERSION};

pub const PROTOCOL_SCHEMA: &str = "agentsam.hook.v1";
pub const RECEIPT_SCHEMA: &str = "agentsam.hook.receipt.v1";
pub const EVENTS: &[&str] = &[
    "session_start", "session_end", "user_prompt_submitted", "user_prompt_transformed",
    "pre_model_use", "post_model_use", "pre_tool_use", "post_tool_use",
    "post_tool_use_failure", "error_occurred", "agent_stop", "subagent_start", "subagent_stop",
];

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn valid_event(event: &str) -> bool { EVENTS.contains(&event) }

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Invocation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub metadata: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub schema: String,
    pub hook: String,
    pub timestamp: u64,
    pub cwd: String,
    #[serde(default)]
    pub invocation: Invocation,
    #[serde(default)]
    pub input: Map<String, Value>,
}

impl Envelope {
    pub fn new(hook: impl Into<String>, cwd: impl Into<String>, invocation: Invocation, input: Map<String, Value>) -> Result<Self, HookError> {
        let hook = hook.into();
        if !valid_event(&hook) { return Err(HookError::new(format!("unsupported_hook_event:{hook}"))); }
        Ok(Self { schema: PROTOCOL_SCHEMA.into(), hook, timestamp: now_ms(), cwd: cwd.into(), invocation, input })
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Output {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_decision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_decision_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_args: Option<Map<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_request: Option<Map<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_transformed_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_config: Option<Map<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_context: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suppress_output: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_handling: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_count: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_notification: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cleanup_actions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub metadata: Map<String, Value>,
}

impl Output {
    pub fn validate(&self, event: &str) -> Result<(), HookError> {
        if let Some(decision) = &self.permission_decision {
            if !["allow", "deny", "ask"].contains(&decision.as_str()) { return Err(HookError::new(format!("invalid_permission_decision:{decision}"))); }
            if !["pre_tool_use", "pre_model_use"].contains(&event) { return Err(HookError::new(format!("permission_decision_not_supported:{event}"))); }
        }
        if let Some(handling) = &self.error_handling {
            if !["retry", "skip", "abort"].contains(&handling.as_str()) { return Err(HookError::new(format!("invalid_error_handling:{handling}"))); }
            if event != "error_occurred" { return Err(HookError::new(format!("error_handling_not_supported:{event}"))); }
        }
        if self.retry_count.unwrap_or(0) > 10 {
            return Err(HookError::new("retry_count_must_be_between_0_and_10"));
        }
        if let Some(decision) = &self.decision {
            if event != "agent_stop" || !["allow", "block"].contains(&decision.as_str()) { return Err(HookError::new(format!("invalid_stop_decision:{decision}"))); }
        }
        if self.modified_config.is_some() && event != "session_start" {
            return Err(HookError::new(format!("modified_config_not_supported:{event}")));
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct HookError { pub message: String }
impl HookError { pub fn new(message: impl Into<String>) -> Self { Self { message: message.into() } } }
impl Display for HookError { fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result { formatter.write_str(&self.message) } }
impl std::error::Error for HookError {}

pub type Handler = Arc<dyn Fn(&Envelope) -> Result<Option<Output>, HookError> + Send + Sync>;

#[derive(Clone)]
pub struct Definition {
    pub id: String,
    pub priority: i32,
    pub timeout: Duration,
    pub failure_mode: Option<String>,
    pub enabled: bool,
    pub handler: Handler,
}

impl Definition {
    pub fn new(id: impl Into<String>, handler: Handler) -> Self {
        Self { id: id.into(), priority: 100, timeout: Duration::from_secs(10), failure_mode: None, enabled: true, handler }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Receipt {
    pub schema: String,
    pub hook_id: String,
    pub hook: String,
    pub status: String,
    pub started_at: u64,
    pub completed_at: u64,
    pub duration_ms: u64,
    pub input_keys: Vec<String>,
    pub output_keys: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_evidence: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DispatchResult {
    pub schema: String,
    pub hook: String,
    pub input: Map<String, Value>,
    pub output: Output,
    pub receipts: Vec<Receipt>,
    pub errors: Vec<Value>,
}

#[derive(Default)]
pub struct Runtime { hooks: BTreeMap<String, Vec<Definition>> }

impl Runtime {
    pub fn new() -> Self { Self::default() }

    pub fn register(&mut self, event: &str, mut definition: Definition) -> Result<(), HookError> {
        if !valid_event(event) { return Err(HookError::new(format!("unsupported_hook_event:{event}"))); }
        if definition.id.trim().is_empty() { return Err(HookError::new("hook_id_required")); }
        if definition.failure_mode.is_none() {
            definition.failure_mode = Some(if ["pre_tool_use", "pre_model_use"].contains(&event) { "closed" } else { "open" }.into());
        }
        let rows = self.hooks.entry(event.into()).or_default();
        if rows.iter().any(|row| row.id == definition.id) { return Err(HookError::new(format!("duplicate_hook_id:{}", definition.id))); }
        rows.push(definition); rows.sort_by(|a, b| a.priority.cmp(&b.priority).then(a.id.cmp(&b.id)));
        Ok(())
    }

    pub fn dispatch(&self, event: &str, cwd: &str, invocation: Invocation, input: Map<String, Value>) -> Result<DispatchResult, HookError> {
        if !valid_event(event) { return Err(HookError::new(format!("unsupported_hook_event:{event}"))); }
        let mut working = input; let mut combined = Output::default(); let mut contexts = Vec::new(); let mut receipts = Vec::new(); let mut errors = Vec::new();
        for definition in self.hooks.get(event).into_iter().flatten().filter(|row| row.enabled) {
            let envelope = Envelope::new(event, cwd, invocation.clone(), working.clone())?; let started = now_ms();
            match (definition.handler)(&envelope).and_then(|output| { if let Some(value) = &output { value.validate(event)?; } Ok(output) }) {
                Ok(output) => {
                    let output = output.unwrap_or_default(); apply(event, &mut working, &output); merge(&mut combined, &output, &mut contexts);
                    let completed = now_ms(); receipts.push(receipt(definition, event, started, completed, "completed", &envelope.input, &output, None));
                    if (["pre_tool_use", "pre_model_use"].contains(&event) && matches!(output.permission_decision.as_deref(), Some("deny" | "ask"))) || (event == "agent_stop" && output.decision.as_deref() == Some("block")) { break; }
                }
                Err(error) => {
                    let completed = now_ms();
                    let failed_receipt = receipt(definition, event, started, completed, "failed", &envelope.input, &Output::default(), Some(&error));
                    let mut failure = failed_receipt.error.clone().unwrap_or_else(|| Value::Object(Map::new()));
                    if let Some(object) = failure.as_object_mut() {
                        object.insert("hook_id".into(), definition.id.clone().into());
                        object.insert("hook".into(), event.into());
                        object.insert("native_evidence".into(), failed_receipt.native_evidence.clone().unwrap_or(Value::Null));
                    }
                    receipts.push(failed_receipt); errors.push(failure);
                    match definition.failure_mode.as_deref().unwrap_or("open") {
                        "error" => return Err(HookError::new(format!("hook_execution_failed:{}:{error}", definition.id))),
                        "closed" => { combined.permission_decision = Some("deny".into()); combined.permission_decision_reason = Some(format!("Hook '{}' failed closed: {}", definition.id, safe_hook_error(&error))); break; }
                        _ => {}
                    }
                }
            }
        }
        if !contexts.is_empty() { combined.additional_context = Some(contexts.join("\n\n")); }
        Ok(DispatchResult { schema: "agentsam.hook.dispatch.v1".into(), hook: event.into(), input: working, output: combined, receipts, errors })
    }
}

fn apply(event: &str, input: &mut Map<String, Value>, output: &Output) {
    if let Some(value) = &output.modified_args { input.insert("tool_args".into(), Value::Object(value.clone())); }
    if let Some(value) = &output.modified_request { input.insert("request".into(), Value::Object(value.clone())); }
    if let Some(value) = &output.modified_result { input.insert(if event == "post_tool_use" { "tool_result" } else { "model_result" }.into(), value.clone()); }
    if let Some(value) = &output.modified_prompt { input.insert("prompt".into(), value.clone().into()); }
    if let Some(value) = &output.modified_transformed_prompt { input.insert("transformed_prompt".into(), value.clone().into()); }
    if let Some(value) = &output.modified_config {
        let mut config = input.get("config").and_then(Value::as_object).cloned().unwrap_or_default();
        config.extend(value.clone()); input.insert("config".into(), Value::Object(config));
    }
}

fn merge(target: &mut Output, update: &Output, contexts: &mut Vec<String>) {
    if update.permission_decision.is_some() { target.permission_decision = update.permission_decision.clone(); target.permission_decision_reason = update.permission_decision_reason.clone(); }
    if update.modified_args.is_some() { target.modified_args = update.modified_args.clone(); } if update.modified_request.is_some() { target.modified_request = update.modified_request.clone(); }
    if update.modified_result.is_some() { target.modified_result = update.modified_result.clone(); } if update.modified_prompt.is_some() { target.modified_prompt = update.modified_prompt.clone(); }
    if update.modified_transformed_prompt.is_some() { target.modified_transformed_prompt = update.modified_transformed_prompt.clone(); }
    if let Some(value) = &update.modified_config {
        target.modified_config.get_or_insert_with(Map::new).extend(value.clone());
    }
    if let Some(value) = &update.additional_context { contexts.push(value.clone()); }
    target.suppress_output = Some(target.suppress_output.unwrap_or(false) || update.suppress_output.unwrap_or(false));
    if update.error_handling.is_some() { target.error_handling = update.error_handling.clone(); } target.retry_count = Some(target.retry_count.unwrap_or(0).max(update.retry_count.unwrap_or(0)));
    if update.user_notification.is_some() { target.user_notification = update.user_notification.clone(); } if update.decision.is_some() { target.decision = update.decision.clone(); target.reason = update.reason.clone(); }
    target.cleanup_actions.extend(update.cleanup_actions.clone()); if update.session_summary.is_some() { target.session_summary = update.session_summary.clone(); }
}

fn safe_hook_error(error: &HookError) -> String {
    let message = error.to_string();
    let lower = message.to_ascii_lowercase();
    if ["authorization:", "authorization=", "bearer ", "api_key", "api-key", "password", "secret", "token"]
        .iter().any(|marker| lower.contains(marker))
    {
        return "[REDACTED hook error; sensitive native evidence removed]".into();
    }
    message.chars().take(512).collect()
}

fn hook_fingerprint(values: &[&str]) -> String {
    let text = values.join("\u{1f}");
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in text.as_bytes() { hash ^= u64::from(*byte); hash = hash.wrapping_mul(0x100000001b3); }
    format!("err_{hash:016x}")
}

fn canonical_hook_failure(definition: &Definition, event: &str, error: &HookError) -> (Value, Value) {
    let mut reason = normalize_error_reason(&[&error.message]);
    let hook_specific;
    if reason.starts_with("mcp_") || reason.starts_with("lsp_") {
        hook_specific = format!("hook_{reason}");
        if let Some(policy) = error_policy(&hook_specific) { reason = policy.reason; }
    }
    let policy = error_policy(reason).expect("generated hook error policy");
    let message = safe_hook_error(error);
    let is_post = event == "post_tool_use" || event == "post_model_use";
    let behavior = match definition.failure_mode.as_deref() {
        Some("closed") => "fail_closed",
        Some("open") => "fail_open",
        Some("error") if is_post => "no_replay",
        _ => "abort",
    };
    let side_effect = if is_post { "confirmed_applied" } else { "not_started" };
    let adapter = ["http", "mcp", "lsp", "command"].iter().find(|name| reason.starts_with(&format!("hook_{name}_"))).copied();
    let protocol = adapter.map(|value| if value == "command" { PROTOCOL_SCHEMA } else { value });
    let transport = adapter.and_then(|value| if value == "command" { Some("process") } else { None });
    let feature = format!("hooks.{event}");
    let retryable = policy.retryable && !is_post && behavior != "fail_closed";
    let fingerprint = hook_fingerprint(&[
        policy.code, reason, policy.domain, policy.failure_class, policy.default_stage, &feature,
        behavior, side_effect, adapter.unwrap_or(""), protocol.unwrap_or(""), transport.unwrap_or(""), &definition.id,
    ]);
    let canonical = serde_json::json!({
        "error_code": policy.code, "reason": reason, "domain": policy.domain,
        "failure_class": policy.failure_class, "stage": policy.default_stage, "feature": feature,
        "failure_behavior": behavior, "retryable": retryable, "side_effect_state": side_effect,
        "adapter": adapter, "protocol": protocol, "transport": transport,
        "fingerprint": fingerprint, "message": message.clone(),
    });
    let native = serde_json::json!({"code": null, "exception_type": "HookError", "message": message});
    (canonical, native)
}

fn receipt(definition: &Definition, event: &str, started: u64, completed: u64, status: &str, input: &Map<String, Value>, output: &Output, error: Option<&HookError>) -> Receipt {
    let mut input_keys: Vec<_> = input.keys().cloned().collect(); input_keys.sort();
    let object = serde_json::to_value(output).ok().and_then(|value| value.as_object().cloned()).unwrap_or_default(); let mut output_keys: Vec<_> = object.keys().cloned().collect(); output_keys.sort();
    let (error, native_evidence) = error.map(|value| canonical_hook_failure(definition, event, value)).map_or((None, None), |(canonical, native)| (Some(canonical), Some(native)));
    Receipt { schema: RECEIPT_SCHEMA.into(), hook_id: definition.id.clone(), hook: event.into(), status: status.into(), started_at: started, completed_at: completed, duration_ms: completed.saturating_sub(started), input_keys, output_keys, error, native_evidence }
}

#[derive(Debug, Clone)]
pub struct CommandOptions { pub command: String, pub args: Vec<String>, pub cwd: Option<PathBuf>, pub env: BTreeMap<String, String>, pub inherit_environment: bool, pub max_output_bytes: usize }

impl CommandOptions {
    pub fn handler(self) -> Handler {
        Arc::new(move |envelope| {
            let mut command = std::process::Command::new(&self.command); command.args(&self.args).current_dir(self.cwd.as_deref().unwrap_or_else(|| std::path::Path::new(&envelope.cwd))).stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
            if !self.inherit_environment { command.env_clear(); for key in ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"] { if let Some(value) = std::env::var_os(key) { command.env(key, value); } } }
            command.envs(&self.env); let mut child = command.spawn().map_err(|error| HookError::new(format!("hook_command_spawn_failed:{error}")))?;
            { use std::io::Write; let input = child.stdin.as_mut().ok_or_else(|| HookError::new("hook_command_stdin_unavailable"))?; serde_json::to_writer(&mut *input, envelope).map_err(|error| HookError::new(error.to_string()))?; input.write_all(b"\n").map_err(|error| HookError::new(error.to_string()))?; }
            let result = child.wait_with_output().map_err(|error| HookError::new(format!("hook_command_failed:{error}")))?; let limit = if self.max_output_bytes == 0 { 1_048_576 } else { self.max_output_bytes };
            if result.stdout.len() + result.stderr.len() > limit { return Err(HookError::new(format!("hook_command_output_limit_exceeded:{limit}"))); }
            if !result.status.success() { return Err(HookError::new(format!("hook_command_failed:{}", String::from_utf8_lossy(&result.stderr)))); }
            let stdout = String::from_utf8_lossy(&result.stdout); let line = stdout.lines().rev().find(|line| !line.trim().is_empty()); match line { None => Ok(None), Some(value) => serde_json::from_str(value).map(Some).map_err(|error| HookError::new(format!("hook_command_invalid_json:{error}"))) }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn composes_portable_pre_tool_hook() {
        let mut runtime = Runtime::new();
        let handler: Handler = Arc::new(|envelope| {
            let mut args = envelope.input.get("tool_args").and_then(Value::as_object).cloned().unwrap_or_default();
            args.insert("bounded".into(), true.into());
            Ok(Some(Output {
                permission_decision: Some("allow".into()),
                modified_args: Some(args),
                additional_context: Some("Rust policy".into()),
                ..Output::default()
            }))
        });
        runtime.register("pre_tool_use", Definition::new("policy", handler)).unwrap();
        let input = json!({"tool_name":"read","tool_args":{"value":1}}).as_object().unwrap().clone();
        let result = runtime.dispatch("pre_tool_use", ".", Invocation::default(), input).unwrap();
        assert_eq!(result.output.permission_decision.as_deref(), Some("allow"));
        assert_eq!(result.output.additional_context.as_deref(), Some("Rust policy"));
        assert_eq!(result.input["tool_args"]["bounded"], true);
        assert_eq!(result.receipts[0].schema, RECEIPT_SCHEMA);
    }

    #[test]
    fn generated_error_aliases_share_canonical_policy() {
        let reason = normalize_error_reason(&["AGENTSAM_HOOK_HTTP_FAILED"]);
        assert_eq!(reason, "hook_http_request_failed");
        let policy = error_policy(reason).unwrap();
        assert_eq!(policy.code, "UNAVAILABLE");
        assert_eq!(policy.domain, "hook");
        assert!(policy.retryable);
    }

    #[test]
    fn failed_post_hook_records_no_replay_and_applied_side_effect() {
        let mut runtime = Runtime::new();
        let handler: Handler = Arc::new(|_| Err(HookError::new("hook_mcp_timeout:server")));
        let mut definition = Definition::new("observer", handler);
        definition.failure_mode = Some("open".into());
        runtime.register("post_tool_use", definition).unwrap();
        let result = runtime.dispatch("post_tool_use", ".", Invocation::default(), Map::new()).unwrap();
        let error = result.receipts[0].error.as_ref().unwrap();
        assert_eq!(error["error_code"], "DEADLINE_EXCEEDED");
        assert_eq!(error["reason"], "hook_mcp_timeout");
        assert_eq!(error["failure_behavior"], "fail_open");
        assert_eq!(error["side_effect_state"], "confirmed_applied");
        assert_eq!(error["retryable"], false);
    }
}
