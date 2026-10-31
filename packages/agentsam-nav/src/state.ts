/** Transient navigation state shared across React roots or a plain-JavaScript host.
 * Identity, routing, persistence and network access remain host responsibilities. */
export interface NavState {
  desktopOpen: boolean;
  mobileOpen: boolean;
  isMobile: boolean;
  isPeeking: boolean;
  width: number;
  menu: string | null;
}

export interface NavStateStore {
  getSnapshot: () => Readonly<NavState>;
  subscribe: (listener: () => void) => () => void;
  setState: (update: Partial<NavState> | ((state: Readonly<NavState>) => Partial<NavState>)) => void;
}

/** No browser globals or singleton: each installation chooses its own store. */
export function createNavState(initial: Partial<NavState> = {}): NavStateStore {
  const listeners = new Set<() => void>();
  const normalize = (value: NavState): Readonly<NavState> => Object.freeze({
    desktopOpen: Boolean(value.desktopOpen), mobileOpen: Boolean(value.mobileOpen),
    isMobile: Boolean(value.isMobile), isPeeking: Boolean(value.isPeeking),
    width: Number.isFinite(value.width) ? Math.max(208, Math.min(400, Math.round(value.width))) : 264,
    menu: typeof value.menu === 'string' ? value.menu : null,
  });
  let snapshot = normalize({ desktopOpen: true, mobileOpen: false, isMobile: false, isPeeking: false, width: 264, menu: null, ...initial });
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setState(update) {
      const next = normalize({ ...snapshot, ...(typeof update === 'function' ? update(snapshot) : update) });
      if ((Object.keys(next) as (keyof NavState)[]).every(key => next[key] === snapshot[key])) return;
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  };
}
