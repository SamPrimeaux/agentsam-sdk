/**
 * Platform persistence for agentsamd (LaunchAgent / Windows Scheduled Task).
 * Pure builders are exported for tests; side-effect helpers call OS tools.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runtimeStateDir, ensureRuntimeStateDir } from './runtime.js';

const execFileAsync = promisify(execFile);

export const DARWIN_LAUNCH_LABEL = 'com.inneranimalmedia.agentsamd';
export const WINDOWS_TASK_NAME = 'InnerAnimalMedia\\agentsamd';
export const WINDOWS_TASK_FOLDER = 'InnerAnimalMedia';

/**
 * @param {{ binary: string, listen: string, stdoutLog: string, stderrLog: string, label?: string }} opts
 */
export function buildLaunchAgentPlist(opts) {
  const label = opts.label || DARWIN_LAUNCH_LABEL;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${opts.binary}</string>
    <string>--listen</string>
    <string>${opts.listen}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${opts.stdoutLog}</string>
  <key>StandardErrorPath</key><string>${opts.stderrLog}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AGENTSAMD_ROLE</key><string>machine</string>
  </dict>
</dict>
</plist>
`;
}

/**
 * User-level Scheduled Task XML (InteractiveToken, at logon, restart on failure).
 * @param {{ binary: string, listen: string, workingDirectory: string, author?: string }} opts
 */
export function buildWindowsScheduledTaskXml(opts) {
  const author = opts.author || 'Inner Animal Media';
  const bin = String(opts.binary).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const cwd = String(opts.workingDirectory).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const listen = String(opts.listen).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  // Arguments must not include the executable path — Command contains the .exe.
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>${author}</Author>
    <Description>AgentSam machine runtime daemon (agentsamd). Protocol agentsam.runtime.v1.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${bin}</Command>
      <Arguments>--listen ${listen}</Arguments>
      <WorkingDirectory>${cwd}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

/**
 * @returns {{ kind: 'launch_agent', label: string, plist: string } | null}
 */
export function writeLaunchAgent(home, binary, listen) {
  if (process.platform !== 'darwin') return null;
  const label = DARWIN_LAUNCH_LABEL;
  const plistDir = path.join(home, 'Library', 'LaunchAgents');
  fs.mkdirSync(plistDir, { recursive: true });
  const plist = path.join(plistDir, `${label}.plist`);
  const logDir = path.join(runtimeStateDir(home), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const contents = buildLaunchAgentPlist({
    binary,
    listen,
    label,
    stdoutLog: path.join(logDir, 'agentsamd.stdout.log'),
    stderrLog: path.join(logDir, 'agentsamd.stderr.log'),
  });
  fs.writeFileSync(plist, contents);
  return { kind: 'launch_agent', label, plist };
}

/**
 * Write task XML under ~/.agentsam/runtime/ and register via schtasks.
 * @returns {Promise<{ kind: 'scheduled_task', taskName: string, xmlPath: string, registered: boolean, error?: string } | null>}
 */
export async function writeWindowsScheduledTask(home, binary, listen, options = {}) {
  if (process.platform !== 'win32' && options.forcePlatform !== 'win32') return null;
  ensureRuntimeStateDir(home);
  const xmlPath = path.join(runtimeStateDir(home), 'agentsamd.scheduled-task.xml');
  const workingDirectory = path.dirname(binary);
  const xml = buildWindowsScheduledTaskXml({ binary, listen, workingDirectory });
  // Node writes UTF-8; schtasks accepts UTF-8 when /XML is used on modern Windows.
  fs.writeFileSync(xmlPath, xml, 'utf8');

  const taskName = WINDOWS_TASK_NAME;
  const execImpl = options.execFileAsync || execFileAsync;
  if (options.skipRegister === true) {
    return { kind: 'scheduled_task', taskName, xmlPath, registered: false };
  }
  try {
    await execImpl('schtasks', ['/Create', '/TN', taskName, '/XML', xmlPath, '/F'], {
      timeout: 30000,
      windowsHide: true,
    });
    return { kind: 'scheduled_task', taskName, xmlPath, registered: true };
  } catch (err) {
    return {
      kind: 'scheduled_task',
      taskName,
      xmlPath,
      registered: false,
      error: String(err?.message || err),
    };
  }
}

export async function startWindowsScheduledTask(options = {}) {
  const execImpl = options.execFileAsync || execFileAsync;
  const taskName = options.taskName || WINDOWS_TASK_NAME;
  await execImpl('schtasks', ['/Run', '/TN', taskName], { timeout: 15000, windowsHide: true });
  return { ok: true, taskName };
}

export async function stopWindowsScheduledTask(options = {}) {
  const execImpl = options.execFileAsync || execFileAsync;
  const taskName = options.taskName || WINDOWS_TASK_NAME;
  try {
    await execImpl('schtasks', ['/End', '/TN', taskName], { timeout: 15000, windowsHide: true });
  } catch {
    /* task may not be running */
  }
  return { ok: true, taskName };
}

export async function bootstrapDarwinLaunchAgent(plist, label = DARWIN_LAUNCH_LABEL) {
  if (process.platform !== 'darwin' || !plist) return { ok: false };
  try {
    await execFileAsync('launchctl', ['unload', plist], { timeout: 10000 }).catch(() => {});
    await execFileAsync('launchctl', ['load', plist], { timeout: 10000 });
    return { ok: true, label, plist };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), label, plist };
  }
}

export async function unloadDarwinLaunchAgent(plist) {
  if (process.platform !== 'darwin' || !plist) return { ok: false };
  try {
    await execFileAsync('launchctl', ['unload', plist], { timeout: 10000 });
    return { ok: true, plist };
  } catch (err) {
    return { ok: false, error: String(err?.message || err), plist };
  }
}
