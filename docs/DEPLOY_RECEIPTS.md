# Deployment receipts and checkpoints

Agent Sam's Merkle tree answers a source identity question: **what exact file tree exists right now?**

The deploy-receipt lifecycle adds a second question: **what changed since the last state we trusted?**

The runtime checkpoint belongs under `.agentsam/deploy-merkle/` by default and is deliberately excluded from the captured source tree. It is cache/checkpoint state, not application source. Committing it would make deployment bookkeeping mutate Git and feed back into the next hash.

## CLI

```sh
agentsam deploy-receipt capture . --project my-app --json
# run any deployment provider here
agentsam deploy-receipt success . --deployment-id dep_123 --worker-version worker_v1 --json
```

If deployment fails:

```sh
agentsam deploy-receipt failure . --deployment-id dep_123 --json
```

A successful finalize promotes `latest.snapshot.json` and `latest.receipt.json`. A failed finalize writes failure history but does **not** advance the trusted baseline.

An external durable snapshot (R2, S3, GCS, artifact store, etc.) can be restored before capture and supplied explicitly:

```sh
agentsam deploy-receipt capture . \
  --baseline /tmp/last-success.snapshot.json \
  --baseline-source r2 \
  --project my-app \
  --json
```

Provider storage stays an adapter. The Merkle tree, diff, receipt contract, local checkpoint state, Git metadata, dirty-tree observation, and success/failure promotion semantics live in the SDK.

## Programmatic API

```js
import {
  captureDeployReceipt,
  finalizeDeployReceipt,
} from '@inneranimalmedia/agentsam-sdk/deploy-receipt';

const capture = await captureDeployReceipt({
  root: process.cwd(),
  project: 'my-app',
  baselineSnapshot: restoredSnapshotPath,
  baselineSource: 'r2',
});

try {
  const deployment = await deploy();
  const completed = await finalizeDeployReceipt({
    root: process.cwd(),
    status: 'success',
    deploymentId: deployment.id,
    workerVersionId: deployment.versionId,
  });
  await persistSnapshotAndReceipt(completed);
} catch (error) {
  await finalizeDeployReceipt({
    root: process.cwd(),
    status: 'failed',
  });
  throw error;
}
```

The same primitive is exported as `captureCheckpoint()` / `promoteCheckpoint()` for long-running agent work. That enables a loop to checkpoint a trusted tree, execute a batch, inspect the exact Merkle delta, run verification, and only promote the new checkpoint when the batch is accepted.

## Receipt shape

A capture includes compact metadata such as:

- Git SHA, branch, repository remote, and dirty-tree state
- current Merkle root and previous trusted root
- added / modified / removed counts
- exact changed paths (capped for receipt size)
- file / directory / byte statistics
- baseline provenance

Full file trees remain Merkle snapshots. Deployment ledgers should store the compact receipt metadata rather than the complete manifest.
