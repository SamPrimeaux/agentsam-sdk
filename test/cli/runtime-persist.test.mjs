import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildWindowsScheduledTaskXml,
  buildLaunchAgentPlist,
  writeWindowsScheduledTask,
  WINDOWS_TASK_NAME,
} from '../../src/lib/setup/runtime-persist.js';

test('buildWindowsScheduledTaskXml includes binary, listen, logon trigger', () => {
  const xml = buildWindowsScheduledTaskXml({
    binary: 'C:\\Users\\sam\\.agentsam\\bin\\agentsamd.exe',
    listen: '127.0.0.1:18765',
    workingDirectory: 'C:\\Users\\sam\\.agentsam\\bin',
  });
  assert.match(xml, /agentsamd\.exe/);
  assert.match(xml, /--listen 127\.0\.0\.1:18765/);
  assert.match(xml, /LogonTrigger/);
  assert.match(xml, /InteractiveToken/);
  assert.match(xml, /RestartOnFailure/);
});

test('buildLaunchAgentPlist includes KeepAlive and listen', () => {
  const plist = buildLaunchAgentPlist({
    binary: '/Users/sam/.agentsam/bin/agentsamd',
    listen: '127.0.0.1:18765',
    stdoutLog: '/tmp/out.log',
    stderrLog: '/tmp/err.log',
  });
  assert.match(plist, /com\.inneranimalmedia\.agentsamd/);
  assert.match(plist, /KeepAlive/);
  assert.match(plist, /127\.0\.0\.1:18765/);
});

test('writeWindowsScheduledTask writes XML without calling schtasks when skipRegister', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-runtime-'));
  try {
    const result = await writeWindowsScheduledTask(
      home,
      path.join(home, '.agentsam', 'bin', 'agentsamd.exe'),
      '127.0.0.1:18765',
      { forcePlatform: 'win32', skipRegister: true },
    );
    assert.equal(result.kind, 'scheduled_task');
    assert.equal(result.taskName, WINDOWS_TASK_NAME);
    assert.equal(result.registered, false);
    assert.ok(fs.existsSync(result.xmlPath));
    const xml = fs.readFileSync(result.xmlPath, 'utf8');
    assert.match(xml, /agentsamd\.exe/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
