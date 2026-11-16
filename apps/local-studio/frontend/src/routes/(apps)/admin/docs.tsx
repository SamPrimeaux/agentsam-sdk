import { createFileRoute, redirect } from '@tanstack/react-router';

/** Canonical docs live under Settings. Keep /docs as a compatibility entry. */
export const Route = createFileRoute('/(apps)/admin/docs')({
  beforeLoad: ({ location }) => {
    const topic = new URLSearchParams(location.searchStr).get('topic');
    throw redirect({
      to: '/admin/settings/docs' as never,
      search: topic ? { topic } : undefined,
    } as never);
  },
  component: () => null,
});
