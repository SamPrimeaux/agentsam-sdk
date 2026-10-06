import { createFileRoute } from '@tanstack/react-router';
import { ContentStudioPage } from '@/components/content/ContentStudioPage';
// Alias of the installed Content Studio runtime; not a second, disconnected media library.
export const Route = createFileRoute('/(apps)/media')({ component: ContentStudioPage });
