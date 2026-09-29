use std::path::PathBuf;

use agentsam_machine_core::{inspect_path_with_options, InspectOptions};
use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "agentsam-machine",
    version,
    about = "AgentSam deterministic machine perception"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Recursively inventory and hash an explicit filesystem target.
    Inspect {
        target: PathBuf,
        #[arg(long)]
        run_id: Option<String>,
        #[arg(long)]
        json: bool,
        /// Walk generated/cache trees instead of summarizing them.
        #[arg(long)]
        include_generated: bool,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Inspect {
            target,
            run_id,
            json,
            include_generated,
        } => {
            let mut options = InspectOptions::new();
            options.run_id = run_id;
            options.include_generated = include_generated;
            options.externalize = true;
            let receipt = inspect_path_with_options(&target, options)?;
            if json {
                // Compact JSON for CLI consumers (bounded receipt).
                println!("{}", serde_json::to_string(&receipt)?);
            } else {
                let facts = receipt.summary.as_ref().and_then(|s| s.get("facts_total")).and_then(|v| v.as_u64()).unwrap_or(receipt.stats.files);
                println!(
                    "machine.inspect {} files={} facts_total={} bytes={} externalized={}",
                    receipt.root,
                    receipt.stats.files,
                    facts,
                    receipt.stats.bytes,
                    receipt
                        .detail
                        .as_ref()
                        .and_then(|d| d.get("externalized"))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                );
                if let Some(dir) = receipt
                    .detail
                    .as_ref()
                    .and_then(|d| d.get("artifact_dir"))
                    .and_then(|v| v.as_str())
                {
                    println!("artifacts: {dir}");
                }
            }
        }
    }
    Ok(())
}
