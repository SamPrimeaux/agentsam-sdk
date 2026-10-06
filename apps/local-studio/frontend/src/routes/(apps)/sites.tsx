import { createFileRoute } from '@tanstack/react-router';
import { SitesStudioPage } from '@/components/sites/SitesStudioPage';
export const Route = createFileRoute('/(apps)/sites')({ component: SitesStudioPage });
