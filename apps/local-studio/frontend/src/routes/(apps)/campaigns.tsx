import { createFileRoute } from '@tanstack/react-router';
import { CampaignStudioPage } from '@/components/campaigns/CampaignStudioPage';
export const Route = createFileRoute('/(apps)/campaigns')({ component: CampaignStudioPage });
