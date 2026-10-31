export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

/** Segment-aware route resolution shared by React and plain HTML hosts. */
export function resolveNavDestinations(items: import('./contracts.js').NavDestination[], pathname?: string): import('./contracts.js').NavDestination[] {
  if (!pathname) return items;
  const current = new URL(pathname, 'https://navigation.invalid');
  const path = current.pathname.replace(/\/+$/, '') || '/';
  let match: import('./contracts.js').NavDestination | undefined;
  let matchPathLength = -1;
  let matchQueryCount = -1;
  const visit = (entries: import('./contracts.js').NavDestination[]) => {
    for (const item of entries) {
      if (item.href?.startsWith('/') && !item.href.startsWith('//')) {
        const destination = new URL(item.href, current.origin);
        const href = destination.pathname.replace(/\/+$/, '') || '/';
        const pathMatches = path === href || (!item.exact && href !== '/' && path.startsWith(href + '/'));
        const parameters = [...destination.searchParams];
        const queryMatches = parameters.every(([key, value]) => current.searchParams.getAll(key).filter((candidate) => candidate === value).length >= parameters.filter(([candidateKey, candidateValue]) => candidateKey === key && candidateValue === value).length);
        // Prefer the deepest route, then the most specific query. Equal candidates
        // retain declaration order, so duplicate links never steal selection.
        if (pathMatches && queryMatches && (href.length > matchPathLength || (href.length === matchPathLength && parameters.length > matchQueryCount))) {
          match = item;
          matchPathLength = href.length;
          matchQueryCount = parameters.length;
        }
      }
      if (item.children) visit(item.children);
    }
  };
  visit(items);
  const apply = (entries: import('./contracts.js').NavDestination[]): import('./contracts.js').NavDestination[] => entries.map((item) => ({ ...item, active: item.id === match?.id, ...(item.children ? { children: apply(item.children) } : {}) }));
  return apply(items);
}

export function navDestinationActive(item: import('./contracts.js').NavDestination): boolean {
  return !!item.active || !!item.children?.some(navDestinationActive);
}

export function navBreadcrumbs(items: import('./contracts.js').NavDestination[]): import('./contracts.js').NavBreadcrumb[] {
  for (const item of items) {
    const child = item.children ? navBreadcrumbs(item.children) : [];
    if (child.length || item.active) return [{ id: item.id, label: item.label, href: item.href }, ...child];
  }
  return [];
}
