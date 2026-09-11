import { DesignExecutionProvider } from './types';
import { LocalExecutionProvider } from './local-provider';
import { ServerExecutionProvider } from './server-provider';

export * from './types';
export * from './provider';
export * from './local-provider';
export * from './server-provider';

let currentProvider: DesignExecutionProvider = new ServerExecutionProvider();

export function getExecutionProvider(): DesignExecutionProvider {
  return currentProvider;
}

export function setExecutionProvider(provider: DesignExecutionProvider): void {
  currentProvider = provider;
}
