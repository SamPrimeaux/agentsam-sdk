/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Module: Host Contracts
 *
 * This defines the explicit interface between the reusable ecommerce/admin shell
 * and any host platform (such as Fuel & Free Time, AgentSam SDK, or Mock Host).
 * The shell NEVER directly imports backend secrets, provider keys, or host internals.
 */

import { SecretDescriptor, SecretStoreAdapter } from './SecretStore';
import { ProviderDefinition, ProviderConnection, IntegrationActivity } from './ProviderRegistry';
import { AgentSamModelDefinition } from './ModelCatalog';

export interface HostBrandConfig {
  appName: string;
  shortName: string;
  tagline: string;
  logoUrl: string;
  accentColor: string; // e.g. '#f59e0b'
  secondaryAccentColor: string;
  installationName: string; // e.g. 'Fuel & Free Time'
  environment: 'local' | 'preview' | 'production';
}

export interface HostUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: 'owner' | 'admin' | 'editor' | 'operator';
  permissions: string[];
}

export interface HostRouteLocation {
  pathname: string;
  search: string;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface MediaItem {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  folder: 'products' | 'images' | 'videos' | 'artwork' | 'banners';
  width?: number;
  height?: number;
  tags: string[];
  createdAt: number;
  generatedBy?: {
    model: string;
    prompt: string;
    jobId?: string;
  };
}

export interface AiGenerationJob {
  id: string;
  type: 'image' | 'video' | 'copy';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  prompt: string;
  negativePrompt?: string;
  modelKey: string;
  progressPercent: number;
  createdAt: number;
  completedAt?: number;
  resultUrl?: string;
  resultText?: string;
  errorMessage?: string;
  parameters: Record<string, any>;
}

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  status: 'published' | 'draft' | 'scheduled';
  author: string;
  updatedAt: number;
  template: string;
  summary?: string;
}

export interface MailMessage {
  id: string;
  mailbox: string; // e.g. 'info', 'payments', 'support'
  folder: 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash';
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  bodyHtml?: string;
  bodyText: string;
  isRead: boolean;
  isStarred: boolean;
  receivedAt: number;
  threadId: string;
}

export interface AgentSamConversation {
  id: string;
  title: string;
  updatedAt: number;
  modelKey: string;
  messages: {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
    toolCalls?: any[];
    toolResults?: any[];
  }[];
}

/**
 * The Master Host Contract:
 * Features consume this interface rather than contacting third-party APIs directly.
 */
export interface AdminHostConfig {
  brand: HostBrandConfig;

  // Routing
  routing: {
    basePath: string;
    currentLocation: HostRouteLocation;
    navigate: (path: string, query?: Record<string, string | undefined>) => void;
  };

  // Auth & Session
  auth: {
    currentUser: () => HostUser;
    logout: () => Promise<void>;
    hasPermission: (permission: string) => boolean;
  };

  // Generic Request / Proxy
  api: {
    baseUrl: string;
    request: <T = any>(endpoint: string, options?: RequestInit) => Promise<T>;
  };

  // Vault / Secret Store
  vault: SecretStoreAdapter;

  // Provider System
  providers: {
    listDefinitions: () => ProviderDefinition[];
    listConnections: () => Promise<ProviderConnection[]>;
    getConnection: (providerKey: string) => Promise<ProviderConnection | null>;
    saveConnectionConfig: (providerKey: string, config: Record<string, any>) => Promise<void>;
    verifyConnection: (providerKey: string) => Promise<{ status: 'healthy' | 'degraded' | 'error'; message: string }>;
    listActivity: (limit?: number) => Promise<IntegrationActivity[]>;
  };

  // Media & R2 Storage
  media: {
    list: (folder?: string) => Promise<MediaItem[]>;
    upload: (file: File | Blob, filename: string, folder?: string, tags?: string[]) => Promise<MediaItem>;
    remove: (id: string) => Promise<void>;
    resolveUrl: (pathOrKey: string) => string;
  };

  // AI Creative Studio
  ai: {
    generateImage: (params: { prompt: string; style?: string; aspectRatio?: string; modelKey?: string }) => Promise<AiGenerationJob>;
    editImage: (params: { sourceImageUrl: string; prompt: string; maskUrl?: string; modelKey?: string }) => Promise<AiGenerationJob>;
    generateVideo: (params: { prompt: string; sourceImageUrl?: string; durationSeconds?: number; modelKey?: string }) => Promise<AiGenerationJob>;
    generateCopy: (params: { type: 'product' | 'email' | 'seo' | 'banner'; context: string; modelKey?: string }) => Promise<string>;
    getJob: (jobId: string) => Promise<AiGenerationJob | null>;
  };

  // CMS
  cms: {
    listPages: () => Promise<CmsPage[]>;
    getPage: (slug: string) => Promise<CmsPage | null>;
    savePage: (page: Partial<CmsPage> & { slug: string }) => Promise<CmsPage>;
    publishPage: (slug: string) => Promise<void>;
  };

  // Email / Resend
  mail: {
    getMailboxes: () => string[];
    getMessages: (mailbox: string, folder?: string) => Promise<MailMessage[]>;
    getMessage: (id: string) => Promise<MailMessage | null>;
    sendMessage: (msg: { mailbox: string; to: string[]; subject: string; bodyText: string }) => Promise<void>;
  };

  // AgentSam & Model Authority
  agentsam: {
    listModels: () => Promise<AgentSamModelDefinition[]>;
    getConversations: () => Promise<AgentSamConversation[]>;
    createConversation: (title?: string) => Promise<AgentSamConversation>;
    sendMessage: (conversationId: string, content: string, modelKey?: string) => Promise<string>;
    getMcpStatus: () => Promise<{ status: 'connected' | 'offline'; latencyMs: number; toolsCount: number }>;
  };
}
