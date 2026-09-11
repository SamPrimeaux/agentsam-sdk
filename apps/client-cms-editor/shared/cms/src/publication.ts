export type CmsSectionPayload = {
  id?: string;
  type: string;
  props: Record<string, unknown>;
};

export type CmsPublicationSnapshot = {
  publicationId: string;
  route: string;
  revision: number;
  theme: string;
  sections: CmsSectionPayload[];
  publishedAt?: string;
  metadata?: Record<string, unknown>;
};

export type CmsPublishedAsset = {
  id: string;
  key: string;
  mimeType: string;
  size?: number;
  url?: string;
  metadata?: Record<string, unknown>;
};
