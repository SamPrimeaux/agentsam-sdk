function clean(value) {
  return value == null ? '' : String(value).trim();
}

function rangeWindow(range) {
  const now = new Date();
  const ms =
    range === '1h' ? 60 * 60 * 1000 :
    range === '7d' ? 7 * 24 * 60 * 60 * 1000 :
    range === '30d' ? 30 * 24 * 60 * 60 * 1000 :
    24 * 60 * 60 * 1000;
  return {
    start: new Date(now.getTime() - ms),
    end: now,
    bucket: range === '7d' || range === '30d' ? 'date' : 'datetimeHour',
  };
}

async function postGraphql(fetchImpl, token, query, variables) {
  const response = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.errors?.length) {
    const error = new Error(
      body?.errors?.[0]?.message || `Cloudflare GraphQL failed (${response.status})`,
    );
    error.details = body?.errors || null;
    throw error;
  }
  return body;
}

function summarize(groups) {
  let readQueries = 0;
  let writeQueries = 0;
  let rowsRead = 0;
  let rowsWritten = 0;
  for (const group of groups || []) {
    readQueries += Number(group?.sum?.readQueries || 0);
    writeQueries += Number(group?.sum?.writeQueries || 0);
    rowsRead += Number(group?.sum?.rowsRead || 0);
    rowsWritten += Number(group?.sum?.rowsWritten || 0);
  }
  return {
    queries: readQueries + writeQueries,
    readQueries,
    writeQueries,
    rowsRead,
    rowsWritten,
  };
}

function normalizeSeries(groups, bucket) {
  return (groups || [])
    .map((group) => {
      const t =
        group?.dimensions?.[bucket] ||
        group?.dimensions?.date ||
        group?.dimensions?.datetimeHour ||
        '';
      return {
        t,
        readQueries: Number(group?.sum?.readQueries || 0),
        writeQueries: Number(group?.sum?.writeQueries || 0),
        rowsRead: Number(group?.sum?.rowsRead || 0),
        rowsWritten: Number(group?.sum?.rowsWritten || 0),
      };
    })
    .filter((row) => row.t)
    .sort((a, b) => String(a.t).localeCompare(String(b.t)))
    .map((row) => ({ ...row, queries: row.readQueries + row.writeQueries }));
}

export async function readD1Metrics(options = {}) {
  const token = clean(options.token);
  const accountId = clean(options.accountId || options.account_id);
  const databaseId = clean(options.databaseId || options.database_id);
  const range = ['1h', '24h', '7d', '30d'].includes(options.range) ? options.range : '24h';
  const fetchImpl = options.fetchImpl || fetch;
  if (!token || !accountId || !databaseId) throw new Error('d1_metrics_requires_token_account_database');

  const window = rangeWindow(range);
  const useHourly = window.bucket === 'datetimeHour';
  const query = useHourly
    ? `query AgentSamD1Metrics($accountTag: string!, $databaseId: string!, $start: DateTime!, $end: DateTime!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            d1AnalyticsAdaptiveGroups(
              limit: 10000
              filter: { databaseId: $databaseId, datetime_geq: $start, datetime_leq: $end }
              orderBy: [datetimeHour_ASC]
            ) {
              sum { readQueries writeQueries rowsRead rowsWritten }
              dimensions { datetimeHour databaseId }
            }
          }
        }
      }`
    : `query AgentSamD1Metrics($accountTag: string!, $databaseId: string!, $start: Date!, $end: Date!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            d1AnalyticsAdaptiveGroups(
              limit: 10000
              filter: { databaseId: $databaseId, date_geq: $start, date_leq: $end }
              orderBy: [date_ASC]
            ) {
              sum { readQueries writeQueries rowsRead rowsWritten }
              dimensions { date databaseId }
            }
          }
        }
      }`;

  const vars = useHourly
    ? {
        accountTag: accountId,
        databaseId,
        start: window.start.toISOString(),
        end: window.end.toISOString(),
      }
    : {
        accountTag: accountId,
        databaseId,
        start: window.start.toISOString().slice(0, 10),
        end: window.end.toISOString().slice(0, 10),
      };

  let body;
  try {
    body = await postGraphql(fetchImpl, token, query, vars);
  } catch (error) {
    if (!useHourly) throw error;
    const fallbackQuery = `query AgentSamD1MetricsFallback($accountTag: string!, $databaseId: string!, $start: Date!, $end: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          d1AnalyticsAdaptiveGroups(
            limit: 10000
            filter: { databaseId: $databaseId, date_geq: $start, date_leq: $end }
            orderBy: [date_ASC]
          ) {
            sum { readQueries writeQueries rowsRead rowsWritten }
            dimensions { date databaseId }
          }
        }
      }
    }`;
    body = await postGraphql(fetchImpl, token, fallbackQuery, {
      accountTag: accountId,
      databaseId,
      start: window.start.toISOString().slice(0, 10),
      end: window.end.toISOString().slice(0, 10),
    });
  }

  const groups =
    body?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups || [];
  const series = normalizeSeries(groups, useHourly ? 'datetimeHour' : 'date');
  const totals = summarize(groups);

  return {
    provider: 'cloudflare-d1',
    range,
    totals,
    series,
    wired: true,
  };
}
