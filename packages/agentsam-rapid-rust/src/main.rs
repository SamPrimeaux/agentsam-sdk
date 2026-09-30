use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const WORKER_VERSION: &str = "0.8.7";
const WORKER_BUILD_VERSION: &str = "0.8.7";
const WRANGLER_VERSION: &str = "4.145.0";
const COMPATIBILITY_DATE: &str = "2026-09-27";

#[derive(Parser, Debug)]
#[command(
    name = "agentsam-rapid-rust",
    version,
    about = "Scaffold, teach, verify, build, and explicitly deploy Cloudflare Rust/Wasm Workers"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum Template {
    Api,
    SharedCore,
    CryptoAuth,
    DataProcessor,
}

impl Template {
    fn key(self) -> &'static str {
        match self {
            Self::Api => "api",
            Self::SharedCore => "shared-core",
            Self::CryptoAuth => "crypto-auth",
            Self::DataProcessor => "data-processor",
        }
    }
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Scaffold a Rust/Wasm Worker without deploying it.
    New {
        name: String,
        #[arg(short, long, value_enum, default_value_t = Template::Api)]
        template: Template,
        #[arg(long, default_value = ".")]
        out: PathBuf,
        #[arg(long)]
        explain: bool,
        /// Explicitly install local project prerequisites after scaffolding.
        #[arg(long)]
        bootstrap: bool,
        /// Initialize a new Git repository in the generated project.
        #[arg(long)]
        git: bool,
    },
    /// Inspect (and optionally install) the Rust/Wasm toolchain.
    Doctor {
        #[arg(long)]
        bootstrap: bool,
        #[arg(long)]
        json: bool,
    },
    /// List packaged project templates.
    Templates {
        #[arg(long)]
        json: bool,
    },
    /// Explain one template and the Rust/Wasm runtime boundaries.
    Explain {
        #[arg(value_enum, default_value_t = Template::Api)]
        template: Template,
    },
    /// Compile-check a generated Worker for wasm32-unknown-unknown.
    Check {
        #[arg(long, default_value = ".")]
        cwd: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Build a generated Worker locally with worker-build.
    Build {
        #[arg(long, default_value = ".")]
        cwd: PathBuf,
        #[arg(long)]
        json: bool,
    },
    /// Run local Wrangler development. No remote deploy.
    Dev {
        #[arg(long, default_value = ".")]
        cwd: PathBuf,
    },
    /// Deploy only when explicitly confirmed. --dry-run never publishes.
    Deploy {
        #[arg(long, default_value = ".")]
        cwd: PathBuf,
        #[arg(long)]
        dry_run: bool,
        #[arg(long)]
        yes: bool,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::New {
            name,
            template,
            out,
            explain,
            bootstrap,
            git,
        } => create_project(&name, template, &out, explain, bootstrap, git),
        Commands::Doctor { bootstrap, json } => doctor(bootstrap, json),
        Commands::Templates { json } => list_templates(json),
        Commands::Explain { template } => {
            print_explanation(template);
            Ok(())
        }
        Commands::Check { cwd, json } => check_project(&cwd, json),
        Commands::Build { cwd, json } => build_project(&cwd, json),
        Commands::Dev { cwd } => run_wrangler(&cwd, &["dev"]),
        Commands::Deploy { cwd, dry_run, yes } => deploy_project(&cwd, dry_run, yes),
    }
}

fn validate_name(name: &str) -> Result<()> {
    if name.is_empty() || name.len() > 80 {
        bail!("project name must be 1..80 characters");
    }
    let valid = name
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    if !valid || name.starts_with('-') || name.ends_with('-') || name.contains("--") {
        bail!("project name must use lowercase letters, digits, and single hyphens");
    }
    Ok(())
}

fn render(source: &str, name: &str) -> String {
    source
        .replace("{{PROJECT_NAME}}", name)
        .replace("{{CRATE_NAME}}", &name.replace('-', "_"))
        .replace("{{WORKER_VERSION}}", WORKER_VERSION)
        .replace("{{WRANGLER_VERSION}}", WRANGLER_VERSION)
        .replace("{{COMPATIBILITY_DATE}}", COMPATIBILITY_DATE)
}

fn write_file(root: &Path, rel: &str, body: &str) -> Result<()> {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

fn create_project(
    name: &str,
    template: Template,
    out: &Path,
    explain: bool,
    bootstrap: bool,
    init_git: bool,
) -> Result<()> {
    validate_name(name)?;
    let root = out.join(name);
    if root.exists() {
        bail!("refusing to overwrite existing path: {}", root.display());
    }
    fs::create_dir_all(&root)?;

    let common_gitignore =
        "/target\n/build\n/worker/target\n/worker/build\n/node_modules\n/.wrangler\n.DS_Store\n";
    write_file(&root, ".gitignore", common_gitignore)?;

    match template {
        Template::Api => write_single_crate(
            &root,
            name,
            include_str!("../templates/api/Cargo.toml.tmpl"),
            include_str!("../templates/api/src/lib.rs.tmpl"),
        )?,
        Template::CryptoAuth => write_single_crate(
            &root,
            name,
            include_str!("../templates/crypto-auth/Cargo.toml.tmpl"),
            include_str!("../templates/crypto-auth/src/lib.rs.tmpl"),
        )?,
        Template::DataProcessor => write_single_crate(
            &root,
            name,
            include_str!("../templates/data-processor/Cargo.toml.tmpl"),
            include_str!("../templates/data-processor/src/lib.rs.tmpl"),
        )?,
        Template::SharedCore => write_shared_core(&root, name)?,
    }

    write_file(
        &root,
        "package.json",
        &render(include_str!("../templates/common/package.json.tmpl"), name),
    )?;
    write_file(
        &root,
        "README.md",
        &render(include_str!("../templates/common/README.md.tmpl"), name)
            .replace("{{TEMPLATE}}", template.key()),
    )?;

    let worker_dir = if template == Template::SharedCore {
        "worker"
    } else {
        "."
    };
    let metadata = json!({
        "schema": "agentsam.rapid-rust.v1",
        "template": template.key(),
        "project_name": name,
        "worker_dir": worker_dir,
        "worker_version": WORKER_VERSION,
        "worker_build_version": WORKER_BUILD_VERSION,
        "wrangler_version": WRANGLER_VERSION,
        "compatibility_date": COMPATIBILITY_DATE,
        "deploy_is_explicit": true
    });
    write_file(
        &root,
        ".agentsam/rapid-rust.json",
        &(serde_json::to_string_pretty(&metadata)? + "\n"),
    )?;

    if init_git {
        run_status(
            Command::new("git").arg("init").current_dir(&root),
            "git init",
        )?;
    }
    if bootstrap {
        bootstrap_tools()?;
        run_status(
            Command::new("npm").arg("install").current_dir(&root),
            "npm install",
        )?;
    }

    println!("✓ scaffolded {} [{}]", root.display(), template.key());
    println!("  next: cd {}", root.display());
    println!("        agentsam rust check");
    println!("        agentsam rust dev");
    println!("  deploy stays explicit: agentsam rust deploy --dry-run");
    if explain {
        print_explanation(template);
    }
    Ok(())
}

fn write_single_crate(root: &Path, name: &str, cargo: &str, lib: &str) -> Result<()> {
    write_file(root, "Cargo.toml", &render(cargo, name))?;
    write_file(root, "src/lib.rs", &render(lib, name))?;
    write_file(
        root,
        "wrangler.toml",
        &render(include_str!("../templates/common/wrangler.toml.tmpl"), name),
    )?;
    Ok(())
}

fn write_shared_core(root: &Path, name: &str) -> Result<()> {
    write_file(
        root,
        "Cargo.toml",
        &render(
            include_str!("../templates/shared-core/Cargo.toml.tmpl"),
            name,
        ),
    )?;
    write_file(
        root,
        "core/Cargo.toml",
        &render(
            include_str!("../templates/shared-core/core/Cargo.toml.tmpl"),
            name,
        ),
    )?;
    write_file(
        root,
        "core/src/lib.rs",
        &render(
            include_str!("../templates/shared-core/core/src/lib.rs.tmpl"),
            name,
        ),
    )?;
    write_file(
        root,
        "worker/Cargo.toml",
        &render(
            include_str!("../templates/shared-core/worker/Cargo.toml.tmpl"),
            name,
        ),
    )?;
    write_file(
        root,
        "worker/src/lib.rs",
        &render(
            include_str!("../templates/shared-core/worker/src/lib.rs.tmpl"),
            name,
        ),
    )?;
    write_file(
        root,
        "wrangler.toml",
        &render(
            include_str!("../templates/shared-core/wrangler.toml.tmpl"),
            name,
        ),
    )?;
    Ok(())
}

fn command_output(program: &str, args: &[&str]) -> Value {
    match Command::new(program).args(args).output() {
        Ok(out) => json!({
            "ok": out.status.success(),
            "version": String::from_utf8_lossy(&out.stdout).trim(),
            "stderr": String::from_utf8_lossy(&out.stderr).trim()
        }),
        Err(error) => json!({"ok": false, "error": error.to_string()}),
    }
}

fn wasm_target_installed() -> bool {
    Command::new("rustup")
        .args(["target", "list", "--installed"])
        .output()
        .map(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .any(|x| x.trim() == "wasm32-unknown-unknown")
        })
        .unwrap_or(false)
}

fn doctor(bootstrap: bool, as_json: bool) -> Result<()> {
    if bootstrap {
        bootstrap_tools()?;
    }
    let rustc = command_output("rustc", &["--version"]);
    let cargo = command_output("cargo", &["--version"]);
    let rustup = command_output("rustup", &["--version"]);
    let node = command_output("node", &["--version"]);
    let npm = command_output("npm", &["--version"]);
    let wrangler = command_output("npx", &["wrangler", "--version"]);
    let worker_build = command_output("worker-build", &["--version"]);
    let wasm_target = wasm_target_installed();
    let base_ok = [&rustc, &cargo, &rustup, &node, &npm, &wrangler]
        .iter()
        .all(|value| value["ok"].as_bool().unwrap_or(false));
    let build_ready = base_ok && wasm_target && worker_build["ok"].as_bool().unwrap_or(false);
    let payload = json!({
        "ok": base_ok,
        "build_ready": build_ready,
        "rustc": rustc,
        "cargo": cargo,
        "rustup": rustup,
        "node": node,
        "npm": npm,
        "wrangler": wrangler,
        "worker_build": worker_build,
        "wasm32_unknown_unknown": wasm_target,
        "expected": {
            "worker": WORKER_VERSION,
            "worker_build": WORKER_BUILD_VERSION,
            "wrangler": WRANGLER_VERSION
        }
    });
    if as_json {
        println!("{}", serde_json::to_string_pretty(&payload)?);
    } else {
        println!("AgentSam Rapid Rust doctor");
        println!("  rustc        {}", display_check(&payload["rustc"]));
        println!("  cargo        {}", display_check(&payload["cargo"]));
        println!("  rustup       {}", display_check(&payload["rustup"]));
        println!("  node         {}", display_check(&payload["node"]));
        println!("  npm          {}", display_check(&payload["npm"]));
        println!("  wrangler     {}", display_check(&payload["wrangler"]));
        println!("  worker-build {}", display_check(&payload["worker_build"]));
        println!(
            "  wasm target  {}",
            if wasm_target {
                "✓ wasm32-unknown-unknown"
            } else {
                "✗ missing"
            }
        );
        println!(
            "  build ready  {}",
            if build_ready { "✓ yes" } else { "✗ no" }
        );
        if !build_ready {
            println!("\n  bootstrap explicitly with: agentsam rust doctor --bootstrap");
        }
    }
    Ok(())
}

fn display_check(value: &Value) -> String {
    if value["ok"].as_bool().unwrap_or(false) {
        let version = value["version"].as_str().unwrap_or("");
        format!("✓ {}", version.lines().next().unwrap_or(version))
    } else {
        format!(
            "✗ {}",
            value["error"]
                .as_str()
                .or(value["stderr"].as_str())
                .unwrap_or("missing")
        )
    }
}

fn bootstrap_tools() -> Result<()> {
    if !wasm_target_installed() {
        run_status(
            Command::new("rustup").args(["target", "add", "wasm32-unknown-unknown"]),
            "rustup target add wasm32-unknown-unknown",
        )?;
    }
    let worker_ok = Command::new("worker-build")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|x| x.success())
        .unwrap_or(false);
    if !worker_ok {
        run_status(
            Command::new("cargo").args([
                "install",
                "worker-build",
                "--version",
                WORKER_BUILD_VERSION,
                "--locked",
            ]),
            "cargo install worker-build",
        )?;
    }
    Ok(())
}

fn project_root(input: &Path) -> Result<PathBuf> {
    let root = fs::canonicalize(input).with_context(|| format!("resolve {}", input.display()))?;
    if !root.join(".agentsam/rapid-rust.json").is_file() {
        bail!(
            "{} is not an AgentSam Rapid Rust project (.agentsam/rapid-rust.json missing)",
            root.display()
        );
    }
    Ok(root)
}

fn metadata(root: &Path) -> Result<Value> {
    let raw = fs::read_to_string(root.join(".agentsam/rapid-rust.json"))?;
    Ok(serde_json::from_str(&raw)?)
}

fn worker_dir(root: &Path) -> Result<PathBuf> {
    let meta = metadata(root)?;
    let rel = meta["worker_dir"].as_str().unwrap_or(".");
    Ok(root.join(rel))
}

fn check_project(cwd: &Path, as_json: bool) -> Result<()> {
    let root = project_root(cwd)?;
    if !wasm_target_installed() {
        bail!("wasm32-unknown-unknown is missing; run agentsam rust doctor --bootstrap");
    }
    let started = unix_ms();
    let status = Command::new("cargo")
        .args(["check", "--target", "wasm32-unknown-unknown"])
        .current_dir(&root)
        .status()?;
    let receipt = write_receipt(
        &root,
        "check",
        started,
        status.code().unwrap_or(1),
        json!({}),
    )?;
    if as_json {
        println!("{}", serde_json::to_string_pretty(&receipt)?);
    }
    if !status.success() {
        bail!("cargo check failed");
    }
    Ok(())
}

fn build_project(cwd: &Path, as_json: bool) -> Result<()> {
    let root = project_root(cwd)?;
    if !wasm_target_installed() {
        bail!("wasm32-unknown-unknown is missing; run agentsam rust doctor --bootstrap");
    }
    if Command::new("worker-build")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|x| x.success())
        .unwrap_or(false)
        == false
    {
        bail!("worker-build is missing; run agentsam rust doctor --bootstrap");
    }
    let work = worker_dir(&root)?;
    let started = unix_ms();
    let status = Command::new("worker-build")
        .arg("--release")
        .current_dir(&work)
        .status()?;
    let artifacts = artifact_summary(&work);
    let receipt = write_receipt(
        &root,
        "build",
        started,
        status.code().unwrap_or(1),
        artifacts,
    )?;
    if as_json {
        println!("{}", serde_json::to_string_pretty(&receipt)?);
    } else {
        println!(
            "build receipt: {}",
            receipt["receipt_path"].as_str().unwrap_or("")
        );
    }
    if !status.success() {
        bail!("worker-build failed");
    }
    Ok(())
}

fn artifact_summary(work: &Path) -> Value {
    let build = work.join("build");
    let mut rows = Vec::new();
    if let Ok(entries) = fs::read_dir(&build) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let bytes = path.metadata().map(|m| m.len()).unwrap_or(0);
                rows.push(json!({"path": path.display().to_string(), "bytes": bytes}));
            }
        }
    }
    json!({"artifacts": rows})
}

fn write_receipt(
    root: &Path,
    action: &str,
    started_ms: u128,
    exit_code: i32,
    extra: Value,
) -> Result<Value> {
    let dir = root.join(".agentsam/rapid-rust/receipts");
    fs::create_dir_all(&dir)?;
    let finished_ms = unix_ms();
    let path = dir.join(format!("{}-{}.json", action, finished_ms));
    let mut receipt = json!({
        "schema": "agentsam.rapid-rust.receipt.v1",
        "action": action,
        "started_ms": started_ms,
        "finished_ms": finished_ms,
        "exit_code": exit_code,
        "ok": exit_code == 0,
        "project": root.display().to_string(),
        "remote_mutation": false
    });
    if let (Some(dst), Some(src)) = (receipt.as_object_mut(), extra.as_object()) {
        for (key, value) in src {
            dst.insert(key.clone(), value.clone());
        }
    }
    receipt["receipt_path"] = json!(path.display().to_string());
    fs::write(&path, serde_json::to_string_pretty(&receipt)? + "\n")?;
    Ok(receipt)
}

fn run_wrangler(cwd: &Path, args: &[&str]) -> Result<()> {
    let root = project_root(cwd)?;
    let status = Command::new("npx")
        .args(["wrangler"])
        .args(args)
        .current_dir(root)
        .status()?;
    if !status.success() {
        bail!("wrangler {} failed", args.join(" "));
    }
    Ok(())
}

fn deploy_project(cwd: &Path, dry_run: bool, yes: bool) -> Result<()> {
    if !dry_run && !yes {
        bail!("live deploy requires --yes; inspect first with: agentsam rust deploy --dry-run");
    }
    if dry_run {
        run_wrangler(cwd, &["deploy", "--dry-run"])
    } else {
        println!("explicit live deploy approved (--yes)");
        run_wrangler(cwd, &["deploy"])
    }
}

fn run_status(command: &mut Command, label: &str) -> Result<()> {
    println!("→ {}", label);
    let status = command.status().with_context(|| label.to_string())?;
    if !status.success() {
        bail!("{} failed with {}", label, status);
    }
    Ok(())
}

fn list_templates(as_json: bool) -> Result<()> {
    let rows = json!([
        {"id":"api","purpose":"small HTTP/JSON Worker"},
        {"id":"shared-core","purpose":"pure Rust core shared with Tauri; Swift needs an FFI layer"},
        {"id":"crypto-auth","purpose":"HMAC-SHA256 webhook/request verification"},
        {"id":"data-processor","purpose":"typed JSON batch transformations"}
    ]);
    if as_json {
        println!("{}", serde_json::to_string_pretty(&rows)?);
    } else {
        println!("api            small HTTP/JSON Worker");
        println!("shared-core    reusable pure Rust crate + Worker adapter");
        println!("crypto-auth    constant-time HMAC-SHA256 verification");
        println!("data-processor typed JSON batch transformations");
    }
    Ok(())
}

fn print_explanation(template: Template) {
    println!("\nAgentSam Rapid Rust · {}", template.key());
    println!("  target: wasm32-unknown-unknown via workers-rs/worker-build");
    println!("  local:  cargo check + worker-build + wrangler dev");
    println!("  cloud:  deploy is never implicit; use deploy --dry-run, then deploy --yes");
    println!("  runtime boundary: Workers Rust is Wasm; normal Tokio/async-std runtimes are not available");
    println!("  size: release uses LTO + debuginfo stripping + one codegen unit; full symbol stripping is avoided for wasm-bindgen externref compatibility");
    match template {
        Template::Api => println!("  api: use Rust when shared logic, binary parsing, or predictable memory justifies it; basic routing may be simpler in TypeScript"),
        Template::SharedCore => println!("  shared-core: core/ has no Cloudflare dependency and can be reused directly by Tauri; Swift integration still requires an explicit C/UniFFI-style bridge"),
        Template::CryptoAuth => println!("  crypto-auth: verifies HMAC bytes with constant-time MAC verification; secrets come from Worker bindings, never source"),
        Template::DataProcessor => println!("  data-processor: demonstrates typed bounded JSON transforms; large/long-running jobs may belong in a Container instead of an isolate"),
    }
    println!();
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn project_name_validation_is_strict() {
        assert!(validate_name("my-edge-worker").is_ok());
        assert!(validate_name("Bad Name").is_err());
        assert!(validate_name("../oops").is_err());
        assert!(validate_name("two--dashes").is_err());
    }

    #[test]
    fn scaffolds_api_without_side_effects() {
        let dir = tempdir().unwrap();
        create_project(
            "fixture-worker",
            Template::Api,
            dir.path(),
            false,
            false,
            false,
        )
        .unwrap();
        let root = dir.path().join("fixture-worker");
        assert!(root.join("Cargo.toml").is_file());
        assert!(root.join("src/lib.rs").is_file());
        assert!(root.join("wrangler.toml").is_file());
        assert!(root.join(".agentsam/rapid-rust.json").is_file());
    }

    #[test]
    fn shared_core_is_a_real_workspace() {
        let dir = tempdir().unwrap();
        create_project(
            "shared-fixture",
            Template::SharedCore,
            dir.path(),
            false,
            false,
            false,
        )
        .unwrap();
        let root = dir.path().join("shared-fixture");
        assert!(root.join("core/src/lib.rs").is_file());
        assert!(root.join("worker/src/lib.rs").is_file());
    }
}
