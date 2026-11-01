import { createFileRoute, redirect } from '@tanstack/react-router';

/** Canonical docs live under Settings. Keep /docs as a compatibility entry. */
export const Route = createFileRoute('/(apps)/docs')({
  beforeLoad: ({ location }) => {
    const topic = new URLSearchParams(location.searchStr).get('topic');
    throw redirect({
      to: '/settings/docs' as never,
      search: topic ? { topic } : undefined,
    } as never);
  },
  component: () => null,
});
