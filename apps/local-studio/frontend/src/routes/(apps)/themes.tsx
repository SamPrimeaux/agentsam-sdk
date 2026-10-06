import { createFileRoute } from '@tanstack/react-router';
import { ThemeStorePage } from '@/components/themes/ThemeStorePage';
export const Route = createFileRoute('/(apps)/themes')({ component: ThemeStorePage });
