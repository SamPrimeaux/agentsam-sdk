import type { PerceptionProvider, PerceptionRequest, PerceptionResponse } from './provider';

export class HttpRoboticsPerceptionProvider implements PerceptionProvider {
  name = 'AgentSam Robotics Perception Gateway';
  constructor(private endpoint = '/api/robotics/perception/detect') {}
  async detect(request: PerceptionRequest): Promise<PerceptionResponse> {
    const response = await fetch(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw new Error(String(body?.error?.message || body?.error || `Robotics perception request failed (${response.status})`));
    if (body.logEntry?.timestamp && typeof body.logEntry.timestamp === 'string') body.logEntry.timestamp = new Date(body.logEntry.timestamp);
    return body as PerceptionResponse;
  }
}
