import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyBlenderFailure,
  classifyDeviceFailure,
  classifyDockerFailure,
  classifyFreeCadFailure,
  classifyInternalFailure,
  classifyMeshyFailure,
  classifyOpenScadFailure,
  classifyProcessFailure,
} from '../src/index.js';

test('Docker daemon absence is user-fixable runtime configuration', () => {
  const error = classifyDockerFailure({ stderr: 'Cannot connect to the Docker daemon. Is the docker daemon running?' }, { stage: 'run' });
  assert.equal(error.reason, 'docker_daemon_unavailable');
  assert.equal(error.source.kind, 'runtime');
  assert.equal(error.resolution_owner, 'user');
  assert.equal(error.remediation.action, 'restart_runtime');
});

test('process timeout and missing executable remain separate', () => {
  const timeout = classifyProcessFailure({ timeout: true, code: 'PROCESS_TIMEOUT' });
  const missing = classifyProcessFailure({ spawn_failed: true, code: 'ENOENT' }, { tool: 'git' });
  assert.equal(timeout.reason, 'execution_timeout');
  assert.equal(timeout.retryable, true);
  assert.equal(missing.reason, 'process_spawn_failed');
  assert.equal(missing.tool, 'git');
});

test('FreeCAD native exception hierarchy survives normalization', () => {
  assert.equal(classifyFreeCadFailure({ exception_type: 'Part::BooleanException' }, { stage: 'boolean' }).reason, 'cad_boolean_failed');
  assert.equal(classifyFreeCadFailure({ exception_type: 'Part::NullShapeException' }).reason, 'cad_null_shape');
  assert.equal(classifyFreeCadFailure({ exception_type: 'Base::CADKernelError' }).reason, 'cad_kernel_failed');
  assert.equal(classifyFreeCadFailure({ exception_type: 'Base::MemoryException' }).reason, 'cad_memory_exhausted');
});

test('OpenSCAD parser and geometry failures are distinct', () => {
  assert.equal(classifyOpenScadFailure({ stderr: 'ERROR: Parser error: syntax error' }, { stage: 'parse' }).reason, 'cad_source_parse_failed');
  assert.equal(classifyOpenScadFailure({ stderr: 'WARNING: No top level geometry to render' }, { stage: 'build' }).reason, 'cad_geometry_invalid');
});

test('Blender discovery and render environment failures are actionable', () => {
  const missing = classifyBlenderFailure({ installed: false }, { stage: 'discovery' });
  const gpu = classifyBlenderFailure({ message: 'No compatible GPU available' }, { stage: 'render' });
  assert.equal(missing.reason, 'cad_tool_not_installed');
  assert.equal(missing.remediation.action, 'install_dependency');
  assert.equal(gpu.reason, 'cad_gpu_unavailable');
});

test('Meshy is a CAD-domain provider and preserves provider quota semantics', () => {
  const error = classifyMeshyFailure({ status: 429, message: 'quota exceeded' });
  assert.equal(error.domain, 'cad');
  assert.equal(error.tool, 'meshy');
  assert.equal(error.reason, 'provider_quota_exhausted');
});

test('device user failures and InnerAnimalMedia control-plane defects cannot be confused', () => {
  const unenrolled = classifyDeviceFailure({ state: 'not_enrolled' });
  const internal = classifyDeviceFailure({ state: 'identity_resolution_failed', trace_id: 'tr_1' });
  assert.equal(unenrolled.reason, 'device_not_enrolled');
  assert.equal(unenrolled.resolution_owner, 'user');
  assert.equal(unenrolled.remediation.action, 'reenroll_device');
  assert.equal(internal.reason, 'identity_resolution_failed');
  assert.equal(internal.source.kind, 'agentsam');
  assert.equal(internal.source.name, 'inneranimalmedia');
  assert.equal(internal.resolution_owner, 'agentsam');
  assert.equal(internal.severity, 'blocking_internal');
});

test('explicit internal failures are always AgentSam-owned', () => {
  const error = classifyInternalFailure({ code: 'ASSERTION', message: 'bad invariant' }, { reason: 'internal_invariant_violation', system: 'agentsam-sdk' });
  assert.equal(error.resolution_owner, 'agentsam');
  assert.equal(error.source.name, 'agentsam-sdk');
  assert.equal(error.remediation.action, 'inspect_platform');
});
