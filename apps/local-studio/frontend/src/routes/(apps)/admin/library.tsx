import { createFileRoute } from '@tanstack/react-router';
import { UnifiedLibraryPage } from '@/components/media/UnifiedLibraryPage';

export const Route = createFileRoute('/(apps)/admin/library')({
  component: () => <UnifiedLibraryPage view="artifacts" />,
});
