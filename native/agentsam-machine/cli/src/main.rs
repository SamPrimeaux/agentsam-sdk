use std::path::PathBuf;

use agentsam_machine_core::inspect_path;
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
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Inspect {
            target,
            run_id,
            json,
        } => {
            let receipt = inspect_path(&target, run_id.as_deref())?;
            if json {
                println!("{}", serde_json::to_string_pretty(&receipt)?);
            } else {
                println!(
                    "machine.inspect {} files={} bytes={}",
                    receipt.root, receipt.stats.files, receipt.stats.bytes
                );
            }
        }
    }
    Ok(())
}
