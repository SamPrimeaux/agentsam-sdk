import type {
  AgentSamWidgetProvider,
  AgentSamWidgetProviderData,
} from '@inneranimalmedia/agentsam-contracts/widgets';

type JsonRecord = Record<string, unknown>;
type Fetcher = typeof fetch;

const record = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const list = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as JsonRecord[] : [];
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

async function getJson(fetcher: Fetcher, path: string) {
  const response = await fetcher(path, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  const body = record(await response.json().catch(() => null));
  return { response, body };
}

function notConnected(provider: AgentSamWidgetProvider, message: string): AgentSamWidgetProviderData {
  return { provider, status: 'not_connected', source: 'live', message, updatedAt: new Date().toISOString() };
}
function failed(provider: AgentSamWidgetProvider, message: string): AgentSamWidgetProviderData {
  return { provider, status: 'error', source: 'live', message, updatedAt: new Date().toISOString() };
}
function selectedConnection(connections: JsonRecord[], configuration: Record<string, unknown> = {}) {
  const requested = text(configuration.connectionId || configuration.connection_id);
  return (requested && connections.find(row => text(row.id || row.connection_id) === requested)) || connections[0] || null;
}
function connectionId(connection: JsonRecord, provider: AgentSamWidgetProvider) {
  return text(connection.id || connection.connection_id) || `${provider}:${text(connection.accountIdentifier || connection.account_identifier)}`;
}
function connectionLabel(connection: JsonRecord, provider: AgentSamWidgetProvider) {
  return text(connection.accountLabel || connection.account_label || connection.accountIdentifier || connection.account_identifier,
    provider === 'google_drive' ? 'Google Drive account' : provider === 'github' ? 'GitHub account' : 'Cloudflare account');
}

/**
 * Read-only, account-scoped provider projections for packaged Workbench widgets.
 * OAuth tokens remain in the Worker/provider connector and are never returned here.
 */
export async function loadProviderWidgetData(
  widgetId: string,
  configuration: Record<string, unknown> = {},
  fetcher: Fetcher = fetch,
): Promise<AgentSamWidgetProviderData> {
  try {
    if (widgetId === 'queues') {
      const historyQueueId = text(configuration.queueId || configuration.queue_id);
      if (configuration.history === '24h') {
        if (!historyQueueId) return { provider: 'cloudflare', status: 'ready', source: 'live', data: { history: { state: 'unavailable', points: [] } } };
        const query = new URLSearchParams({ history: '24h', queue_id: historyQueueId });
        const { response, body } = await getJson(fetcher, `/api/queues/observability?${query.toString()}`);
        if (!response.ok || body.ok === false) {
          return { provider: 'cloudflare', status: 'ready', source: 'live', data: { history: { state: 'unavailable', points: [] } } };
        }
        const history = record(body.history);
        return {
          provider: 'cloudflare', status: 'ready', source: 'live',
          data: { history: { state: text(history.state, 'unavailable'), points: list(history.points).map(point => ({
            at: text(point.at) || null,
            backlog_count: point.backlog_count == null ? null : number(point.backlog_count),
          })) } },
        };
      }
      const { response, body } = await getJson(fetcher, '/api/queues/observability');
      if (!response.ok || body.ok !== true || !Array.isArray(body.queues)) {
        if (response.status === 401 || response.status === 403) return notConnected('cloudflare', 'Cloudflare Queue observability needs account access in Settings → Storage.');
        return failed('cloudflare', 'Queue inventory could not be read. Check Cloudflare Queue access in Settings → Storage.');
      }
      const queues = list(body.queues).map(queue => {
        const metrics = record(queue.metrics);
        return {
          queue_id: text(queue.queue_id),
          queue_name: text(queue.queue_name, 'Unnamed queue'),
          environment: text(queue.environment) || null,
          owner_app: text(queue.owner_app) || null,
          delivery_status: text(queue.delivery_status, 'unknown'),
          producers_total_count: queue.producers_total_count == null ? null : number(queue.producers_total_count),
          consumers_total_count: queue.consumers_total_count == null ? null : number(queue.consumers_total_count),
          metrics: {
            state: text(metrics.state, 'unavailable'),
            backlog_count: metrics.backlog_count == null ? null : number(metrics.backlog_count),
            backlog_bytes: metrics.backlog_bytes == null ? null : number(metrics.backlog_bytes),
            oldest_message_timestamp_ms: metrics.oldest_message_timestamp_ms == null ? null : number(metrics.oldest_message_timestamp_ms),
          },
        };
      }).filter(queue => queue.queue_id);
      return {
        provider: 'cloudflare', status: 'ready', source: 'live',
        accountLabel: 'Cloudflare Queues',
        updatedAt: text(body.collected_at, new Date().toISOString()),
        data: { collected_at: text(body.collected_at), queues },
      };
    }

    if (widgetId === 'cloudflare-resources') {
      const query = new URLSearchParams({ per_page: '200', return_to: '/admin/settings/customize?view=widgets' });
      const requested = text(configuration.connectionId || configuration.connection_id);
      if (requested) query.set('connection_id', requested);
      const { response, body } = await getJson(fetcher, `/api/connections/cloudflare/resources?${query.toString()}`);
      if (!response.ok || body.ok === false) return failed('cloudflare', text(body.message || body.error, 'Cloudflare resource discovery failed.'));
      if (['not_connected', 'not_configured', 'account_required'].includes(text(body.status))) {
        return notConnected('cloudflare', 'Connect or re-authorize Cloudflare in Settings → Storage to view account resources.');
      }
      const r2 = record(body.r2);
      const images = record(body.images);
      const stream = record(body.stream);
      const buckets = list(r2.buckets).map(bucket => ({
        name: text(bucket.name),
        location: text(bucket.location || bucket.jurisdiction),
      })).filter(bucket => bucket.name);
      const partial = ['partial', 'needs_scope'].includes(text(body.status));
      return {
        provider: 'cloudflare', status: 'ready', source: 'live',
        accountLabel: 'Authorized Cloudflare account',
        updatedAt: text(body.checked_at, new Date().toISOString()),
        message: partial ? 'Some resource families require additional Cloudflare permissions.' : undefined,
        data: {
          r2: { count: number(r2.count, buckets.length), buckets },
          images: { count: number(images.count) },
          stream: { count: number(stream.count) },
        },
      };
    }

    if (widgetId === 'github-activity') {
      const statusResult = await getJson(fetcher, '/api/work/connect/github/status');
      if (!statusResult.response.ok) return failed('github', 'GitHub connection status could not be verified.');
      const connection = selectedConnection(list(statusResult.body.connections), configuration);
      if (!connection) return notConnected('github', 'Connect GitHub in Settings → Git & PRs to view your repositories.');
      const id = connectionId(connection, 'github');
      if (!id.startsWith('github:')) return failed('github', 'The GitHub connection did not return a valid account reference.');
      const query = new URLSearchParams({ connection_id: id });
      const repoResult = await getJson(fetcher, `/api/work/github/repos?${query.toString()}`);
      if (!repoResult.response.ok || repoResult.body.ok === false) {
        const code = text(repoResult.body.error);
        if (repoResult.response.status === 401 || repoResult.response.status === 403 || code.includes('oauth_required')) {
          return notConnected('github', 'GitHub authorization needs to be reconnected or reviewed in Settings → Git & PRs.');
        }
        return failed('github', 'GitHub repository access failed. Check the connection in Settings → Git & PRs.');
      }
      const repositories = list(repoResult.body.repositories).map(repo => ({
        id: text(repo.id || repo.fullName),
        fullName: text(repo.fullName),
        description: text(repo.description),
        private: repo.private === true,
        defaultBranch: text(repo.defaultBranch),
        updatedAt: text(repo.updatedAt),
        htmlUrl: text(repo.htmlUrl),
      })).filter(repo => repo.fullName);
      return {
        provider: 'github', status: 'ready', source: 'live',
        accountLabel: connectionLabel(connection, 'github'),
        updatedAt: new Date().toISOString(),
        data: { repositories, totalCount: repositories.length, hasMore: repoResult.body.hasMore === true },
      };
    }

    if (widgetId === 'google-drive-recent') {
      const statusResult = await getJson(fetcher, '/api/work/connect/google_drive/status');
      if (!statusResult.response.ok) return failed('google_drive', 'Google Drive connection status could not be verified.');
      const connection = selectedConnection(list(statusResult.body.connections), configuration);
      if (!connection) return notConnected('google_drive', 'Connect Google Drive in Settings → Storage to view recent files.');
      const id = connectionId(connection, 'google_drive');
      const query = new URLSearchParams({ source: 'drive', connection_id: id, page: '1', page_size: '6', kind: 'all' });
      const filesResult = await getJson(fetcher, `/api/admin/media?${query.toString()}`);
      if (!filesResult.response.ok || filesResult.body.ok === false) {
        const code = text(filesResult.body.error);
        if (filesResult.response.status === 401 || filesResult.response.status === 403 || code.includes('reconnect') || code.includes('scope_missing')) {
          return notConnected('google_drive', 'Google Drive authorization needs to be reconnected or its read-only scope reviewed in Settings → Storage.');
        }
        return failed('google_drive', 'Google Drive could not list recent files. Check the connection in Settings → Storage.');
      }
      const files = list(filesResult.body.items || filesResult.body.assets).map(file => {
        const meta = record(file.meta);
        return {
          id: text(file.id),
          name: text(file.filename || file.original_filename || file.name, 'Untitled file'),
          mimeType: text(file.content_type || file.mime_type || file.mimeType, 'Drive file'),
          updatedAt: text(file.updated_at || file.modified_at || file.modifiedTime),
          webViewUrl: text(meta.web_view_url || file.webViewLink),
          size: number(file.size),
        };
      });
      const account = record(filesResult.body.account);
      return {
        provider: 'google_drive', status: 'ready', source: 'live',
        accountLabel: text(account.label, connectionLabel(connection, 'google_drive')),
        updatedAt: new Date().toISOString(),
        data: { files },
      };
    }

    return { provider: 'cloudflare', status: 'unsupported', source: 'live', message: `No provider data adapter is registered for ${widgetId}.` };
  } catch {
    const provider: AgentSamWidgetProvider = widgetId === 'github-activity' ? 'github' : widgetId === 'google-drive-recent' ? 'google_drive' : 'cloudflare';
    return failed(provider, 'The provider data request could not be completed. No credentials were exposed.');
  }
}
