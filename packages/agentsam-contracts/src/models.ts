export interface ModelOption {
  id: string;
  label: string;
  short?: string;
  description?: string;
  provider?: string;
  disabled?: boolean;
  metadata?: Record<string, unknown>;
}
