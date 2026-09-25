import fs from 'node:fs';
import path from 'node:path';

export function goStateDir(productRoot) {
  const dir = path.join(productRoot, '.agentsam', 'go');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeGoBuildReceipt(productRoot, receipt) {
  const dir = goStateDir(productRoot);
  const file = path.join(dir, 'latest.build-receipt.json');
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n');
  return file;
}

export function writeDeploymentReceipt(productRoot, receipt) {
  const dir = goStateDir(productRoot);
  const file = path.join(dir, 'latest.deployment-receipt.json');
  const payload = { schema: 'agentsam.deployment-receipt.v1', ...receipt };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return file;
}

export function writeDeploymentValidationReceipt(productRoot, receipt) {
  const dir = goStateDir(productRoot);
  const file = path.join(dir, 'latest.deployment-validation-receipt.json');
  const payload = {
    schema: 'agentsam.deployment-validation-receipt.v1',
    ...receipt,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return file;
}

export function writeProductValidationLocal(productRoot, row) {
  const dir = goStateDir(productRoot);
  const file = path.join(dir, 'product.validation-registry.json');
  const payload = {
    schema: 'agentsam.product-validation-registry.v1',
    registry: 'agentsam_products',
    authority: 'local_validation',
    row,
    written_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return file;
}

export function writeProductRegistryLocal(productRoot, row) {
  const dir = goStateDir(productRoot);
  const file = path.join(dir, 'product.registry.json');
  const payload = {
    schema: 'agentsam.product-local-registry.v1',
    registry: 'agentsam_products',
    note: 'Local AgentSam projection. InnerAnimalMedia D1 registration is a separate explicit official-release operation.',
    row,
    written_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return file;
}

export function readLatestStatus(productRoot) {
  const dir = path.join(productRoot, '.agentsam', 'go');
  const buildPath = path.join(dir, 'latest.build-receipt.json');
  const deployPath = path.join(dir, 'latest.deployment-receipt.json');
  const productPath = path.join(dir, 'product.registry.json');
  const validationPath = path.join(dir, 'latest.deployment-validation-receipt.json');
  const validationProductPath = path.join(dir, 'product.validation-registry.json');
  return {
    build: fs.existsSync(buildPath) ? JSON.parse(fs.readFileSync(buildPath, 'utf8')) : null,
    deployment: fs.existsSync(deployPath) ? JSON.parse(fs.readFileSync(deployPath, 'utf8')) : null,
    product: fs.existsSync(productPath) ? JSON.parse(fs.readFileSync(productPath, 'utf8')) : null,
    validation: fs.existsSync(validationPath) ? JSON.parse(fs.readFileSync(validationPath, 'utf8')) : null,
    validation_product: fs.existsSync(validationProductPath)
      ? JSON.parse(fs.readFileSync(validationProductPath, 'utf8'))
      : null,
  };
}

export function buildProductRow({
  product,
  repositoryId,
  commit,
  sourceIdentity = null,
  packageName = '@inneranimalmedia/agentsam-go-worker',
  packageVersion = '0.1.0',
  cloudflareAccount = null,
  url,
  health,
  workerDeploymentId = null,
  workerVersionId = null,
  artifactDigest = null,
  containerDigest = null,
}) {
  return {
    slug: product,
    kind: 'service',
    name: product,
    status: health === 'healthy' ? 'deployed' : (health === 'pending' ? 'built' : 'degraded'),
    repository_id: repositoryId || null,
    canonical_path: 'apps/agentsam-go-worker',
    package_name: packageName,
    version: packageVersion,
    metadata: {
      runtime: 'go',
      deployment: {
        provider: 'cloudflare',
        mode: 'worker-container',
        url: url || null,
        health: health || null,
        worker_deployment_id: workerDeploymentId,
        worker_version_id: workerVersionId,
        artifact_digest: artifactDigest,
        container_image_digest: containerDigest,
        cloudflare_account: cloudflareAccount,
      },
      source: {
        identity: sourceIdentity,
        commit: commit || null,
        package_name: packageName,
        package_version: packageVersion,
      },
      relationships: [
        repositoryId
          ? { type: 'source_repository', target: repositoryId }
          : { type: 'source_package', target: packageName },
        {
          type: 'runtime',
          target: 'go',
          target_type: 'runtime',
          relationship_type: 'runs_on',
        },
        {
          type: 'edge',
          target: product,
          target_type: 'cloudflare_worker',
          relationship_type: 'deployed_as',
        },
      ],
    },
  };
}
