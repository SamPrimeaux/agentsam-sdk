import { PublisherDestinationId } from '../../types';
import { DesignPublisher } from './types';
import { LocalPublisher } from './local-publisher';
import { GitHubPublisher } from './github-publisher';
import { CloudflarePublisher, DockerPublisher } from './cloudflare-publisher';

export * from './types';
export * from './local-publisher';
export * from './github-publisher';
export * from './cloudflare-publisher';

const publishers: Record<PublisherDestinationId, DesignPublisher> = {
  local: new LocalPublisher(),
  github: new GitHubPublisher(),
  cloudflare: new CloudflarePublisher(),
  docker: new DockerPublisher(),
  custom: new DockerPublisher(),
};

export function getPublisher(id: PublisherDestinationId): DesignPublisher {
  return publishers[id] || publishers.local;
}

export function listPublishers(): DesignPublisher[] {
  return Object.values(publishers);
}
