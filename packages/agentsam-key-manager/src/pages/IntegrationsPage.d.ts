import type { ReactElement } from 'react';

export interface IntegrationAccountChoice {
  connection_id?: string;
  connectionId?: string;
  cloudflare_account_id?: string;
  cloudflareAccountId?: string;
  account_label?: string;
  accountLabel?: string;
  preferred?: boolean;
}

export interface IntegrationConnection {
  id: string;
  provider: string;
  label: string;
  status?: string;
  granted_scopes?: string[];
  account_name?: string;
  account_selection_required?: boolean;
  preferred_connection_id?: string | null;
  accounts?: IntegrationAccountChoice[];
}

export interface IntegrationsPageProps {
  connections?: IntegrationConnection[];
  onConnect?: (provider: string) => void;
  onDisconnect?: (id: string, opts?: { accountId?: string }) => void;
  onSelectAccount?: (provider: string, accountId: string) => void | Promise<void>;
}

export declare function IntegrationsPage(props: IntegrationsPageProps): ReactElement;
