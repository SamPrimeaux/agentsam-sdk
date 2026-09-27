import type { ReactElement } from 'react';

export interface IntegrationConnection {
  id: string;
  provider: string;
  label: string;
  status?: string;
  granted_scopes?: string[];
  account_name?: string;
}

export interface IntegrationsPageProps {
  connections?: IntegrationConnection[];
  onConnect?: (provider: string) => void;
  onDisconnect?: (id: string) => void;
}

export declare function IntegrationsPage(props: IntegrationsPageProps): ReactElement;
