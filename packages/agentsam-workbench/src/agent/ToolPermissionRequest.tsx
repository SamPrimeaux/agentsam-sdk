import type {
  AgentToolPermissionDecision,
  AgentToolPermissionRequest as AgentToolPermissionRequestContract,
} from '@inneranimalmedia/agentsam-contracts';

export interface ToolPermissionRequestProps {
  request: AgentToolPermissionRequestContract;
  busy?: boolean;
  className?: string;
  onDecision: (decision: AgentToolPermissionDecision) => void | Promise<void>;
}

function permissionSummary(request: AgentToolPermissionRequestContract) {
  if (request.summary) return request.summary;
  const provider = request.provider ? ' through ' + request.provider : '';
  return 'AgentSam wants to use ' + request.displayName + provider + '.';
}

export function ToolPermissionRequest({
  request,
  busy = false,
  className,
  onDecision,
}: ToolPermissionRequestProps) {
  const titleId = request.id + '-title';
  const descriptionId = request.id + '-description';
  const rootClass = 'agentsam-tool-permission-overlay' + (className ? ' ' + className : '');
  return (
    <div className={rootClass} role="presentation">
      <section
        className="agentsam-tool-permission-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="agentsam-tool-permission-header">
          <div className="agentsam-tool-permission-mark" aria-hidden="true">AS</div>
          <div>
            <h2 id={titleId}>Allow AgentSam to use {request.displayName}?</h2>
            <p id={descriptionId}>{permissionSummary(request)}</p>
          </div>
        </header>

        <div className="agentsam-tool-permission-body">
          <dl className="agentsam-tool-permission-facts">
            <div><dt>Tool</dt><dd>{request.toolKey}</dd></div>
            {request.provider ? <div><dt>Provider</dt><dd>{request.provider}</dd></div> : null}
            {request.scope ? <div><dt>Scope</dt><dd>{request.scope}</dd></div> : null}
            {request.riskLevel ? <div><dt>Risk</dt><dd>{request.riskLevel}</dd></div> : null}
          </dl>

          {request.sharedData?.length ? (
            <div className="agentsam-tool-permission-shared">
              <h3>Sharing data includes:</h3>
              <dl>
                {request.sharedData.map((item) => (
                  <div key={item.label + ':' + item.value}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {request.destructive ? (
            <p className="agentsam-tool-permission-warning">
              This action may modify or delete data. Review the scope before allowing it.
            </p>
          ) : null}
        </div>

        <footer className="agentsam-tool-permission-actions">
          <button type="button" disabled={busy} onClick={() => void onDecision('deny')}>
            Deny
          </button>
          <span className="agentsam-tool-permission-spacer" />
          <button type="button" disabled={busy} onClick={() => void onDecision('allow_once')}>
            Allow once
          </button>
          <button
            type="button"
            className="agentsam-tool-permission-primary"
            disabled={busy}
            onClick={() => void onDecision('allow_session')}
          >
            Allow for this session
          </button>
        </footer>
      </section>
    </div>
  );
}
