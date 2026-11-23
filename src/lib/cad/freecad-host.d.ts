export interface FreeCadHost {
  executable: string;
  mode: 'python' | 'command';
  platform: 'darwin' | 'linux' | 'win32';
  source: string;
  libraryDir: string | null;
}
export interface DiscoverFreeCadHostOptions {
  platform?: string;
  env?: Record<string, string | undefined>;
  exists?: (path: string) => boolean;
  which?: (name: string) => string | null;
  homedir?: () => string;
  listDirectory?: (directory: string) => string[];
}
export function whichSync(name: string, options?: { env?: Record<string, string | undefined>; platform?: string; exists?: (path: string) => boolean }): string | null;
export function discoverFreeCadHost(options?: DiscoverFreeCadHostOptions): FreeCadHost | null;
export function freeCadHostEnvironment(host: Pick<FreeCadHost, 'platform' | 'libraryDir'>, base?: Record<string, string | undefined>): NodeJS.ProcessEnv;
export function freeCadAdapterCommand(host: Pick<FreeCadHost, 'executable' | 'mode'>, adapter: string, request: string, operation?: 'build' | 'inspect'): string[];
