import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const protoDir = path.join(root, 'protocol/rpc/v1');
const grpcInclude = path.join(root, 'node_modules/grpc-tools/bin');
const protoc = path.join(root, 'node_modules/.bin/grpc_tools_node_protoc');
const plugin = path.join(root, 'node_modules/.bin/grpc_tools_node_protoc_plugin');
const protoFiles = ['common.proto', 'errors.proto', 'knowledge.proto'];

export function generateProto(outDir = path.join(root, 'src/rpc/generated')) {
  if (!fs.existsSync(protoc) || !fs.existsSync(plugin)) {
    throw new Error('grpc-tools is required; run npm install before generating RPC bindings.');
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const result = spawnSync(protoc, [
    `--proto_path=${protoDir}`,
    `--proto_path=${grpcInclude}`,
    `--js_out=import_style=commonjs,binary:${outDir}`,
    `--grpc_out=grpc_js:${outDir}`,
    `--plugin=protoc-gen-grpc=${plugin}`,
    ...protoFiles,
  ], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`protobuf generation failed with exit code ${result.status}`);
  }
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
  return outDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateProto();
  console.log('Generated RPC bindings in src/rpc/generated');
}
