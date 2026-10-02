use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=contracts/source-types.v1.json");

    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR must be set"));
    let vendored = manifest_dir.join("contracts/source-types.v1.json");
    let monorepo_authority = manifest_dir.join("../../../contracts/source-types.v1.json");

    if !monorepo_authority.exists() {
        return;
    }

    println!("cargo:rerun-if-changed={}", monorepo_authority.display());

    let vendored_bytes = fs::read(&vendored)
        .unwrap_or_else(|error| panic!("failed to read {}: {error}", vendored.display()));
    let authority_bytes = fs::read(&monorepo_authority).unwrap_or_else(|error| {
        panic!(
            "failed to read source-type authority {}: {error}",
            monorepo_authority.display()
        )
    });

    if vendored_bytes != authority_bytes {
        panic!(
            "agentsam-machine-core vendored source-types contract is stale. Sync with: cp contracts/source-types.v1.json native/agentsam-machine/core/contracts/source-types.v1.json"
        );
    }
}
