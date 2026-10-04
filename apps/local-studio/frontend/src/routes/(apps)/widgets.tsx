import { createFileRoute } from '@tanstack/react-router';
import { WidgetUtilitiesPage } from '@/components/widgets/WidgetUtilitiesPage';

export const Route = createFileRoute('/(apps)/widgets')({
  component: WidgetUtilitiesPage,
});
