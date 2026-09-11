import fs from 'fs';
import path from 'path';
import { runSafeProcess } from '../../../security/process';

export interface BlenderDiscoveryResult {
  available: boolean;
  binaryPath: string | null;
  version: string | null;
  searchedLocations: string[];
}

/**
 * Multi-platform Blender discovery engine
 * Checks:
 * 1. Environment variable BLENDER_PATH
 * 2. System PATH
 * 3. macOS standard locations (/Applications/Blender.app/...)
 * 4. Linux standard locations (/usr/bin/blender, /snap/bin/blender, /usr/local/bin/blender)
 * 5. Windows standard locations (C:\Program Files\Blender Foundation\...)
 */
export class BlenderDiscoveryService {
  private static cachedResult: BlenderDiscoveryResult | null = null;
  private static lastCheckTime: number = 0;
  private static CACHE_TTL_MS = 10000; // 10s cache

  public static async discover(forceRefresh = false): Promise<BlenderDiscoveryResult> {
    const now = Date.now();
    if (!forceRefresh && this.cachedResult && now - this.lastCheckTime < this.CACHE_TTL_MS) {
      return this.cachedResult;
    }

    const searchedLocations: string[] = [];

    // 1. Check explicit environment override
    if (process.env.BLENDER_PATH) {
      searchedLocations.push(process.env.BLENDER_PATH);
      if (fs.existsSync(process.env.BLENDER_PATH)) {
        const version = await this.queryBlenderVersion(process.env.BLENDER_PATH);
        if (version) {
          const result: BlenderDiscoveryResult = {
            available: true,
            binaryPath: process.env.BLENDER_PATH,
            version,
            searchedLocations,
          };
          this.cachedResult = result;
          this.lastCheckTime = now;
          return result;
        }
      }
    }

    // 2. Candidate paths based on platform
    const candidates: string[] = [];

    if (process.platform === 'darwin') {
      candidates.push(
        '/Applications/Blender.app/Contents/MacOS/Blender',
        '/Applications/Blender 4.2.app/Contents/MacOS/Blender',
        '/Applications/Blender 4.1.app/Contents/MacOS/Blender',
        '/Applications/Blender 4.0.app/Contents/MacOS/Blender',
        path.join(process.env.HOME || '', 'Applications/Blender.app/Contents/MacOS/Blender')
      );
    } else if (process.platform === 'win32') {
      candidates.push(
        'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
        'C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe',
        'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
        'C:\\Program Files\\Blender Foundation\\Blender\\blender.exe'
      );
    } else {
      // Linux / Container
      candidates.push(
        '/usr/bin/blender',
        '/usr/local/bin/blender',
        '/snap/bin/blender',
        '/opt/blender/blender'
      );
    }

    // 3. Add plain 'blender' command to test PATH
    candidates.push('blender');

    for (const candidate of candidates) {
      searchedLocations.push(candidate);
      if (candidate === 'blender' || fs.existsSync(candidate)) {
        const version = await this.queryBlenderVersion(candidate);
        if (version) {
          const result: BlenderDiscoveryResult = {
            available: true,
            binaryPath: candidate,
            version,
            searchedLocations,
          };
          this.cachedResult = result;
          this.lastCheckTime = now;
          return result;
        }
      }
    }

    const fallbackResult: BlenderDiscoveryResult = {
      available: false,
      binaryPath: null,
      version: null,
      searchedLocations,
    };
    this.cachedResult = fallbackResult;
    this.lastCheckTime = now;
    return fallbackResult;
  }

  private static async queryBlenderVersion(executable: string): Promise<string | null> {
    try {
      const res = await runSafeProcess(executable, ['--version'], { timeoutMs: 5000 });
      if (res.exitCode === 0 && res.stdout) {
        // Sample stdout: "Blender 4.2.0\nbuild date: 2024-..."
        const match = res.stdout.match(/Blender\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
        return match ? match[1] : '4.x';
      }
    } catch {
      // Not executable or not found
    }
    return null;
  }
}
