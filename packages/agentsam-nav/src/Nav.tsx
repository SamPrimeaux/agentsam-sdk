import { useCallback, type CSSProperties, type HTMLAttributes, type PointerEvent } from 'react';
import { NavCollapsible, NavCollapsibleContent, NavCollapsibleTrigger } from './NavCollapsible.js';
import { NavContent } from './NavContent.js';
import { NavFooter } from './NavFooter.js';
import { NavGroup, NavGroupLabel } from './NavGroup.js';
import { NavHeader } from './NavHeader.js';
import { NavMenu, NavMenuButton, NavMenuChevron, NavMenuItem, NavMenuSub, NavMenuSubButton } from './NavMenu.js';
import { NavProvider, useNav } from './NavProvider.js';
import { NavTrigger } from './NavTrigger.js';
import { cx } from './utils.js';

function NavRoot({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  const { close, isMobile, isPeeking, open, peekable, resizable, setPeeking, setWidth, width } = useNav();
  const startResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const onPointerMove = (move: globalThis.PointerEvent) => setWidth(startWidth + move.clientX - startX);
    const stop = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stop, { once: true });
  }, [isMobile, setWidth, width]);
  return (
    <>
      {isMobile && open ? <button type="button" className="agentsam-nav__backdrop" aria-label="Close navigation" onClick={close} /> : null}
      <aside
        aria-label="Application navigation"
        data-mobile={isMobile ? 'true' : 'false'}
        data-open={open ? 'true' : 'false'}
        data-peeking={isPeeking ? 'true' : 'false'}
        className={cx('agentsam-nav', className)}
        style={{ '--agentsam-nav-width': `${width}px`, ...props.style } as CSSProperties}
        onMouseEnter={() => { if (peekable && !open && !isMobile) setPeeking(true); }}
        onMouseLeave={() => setPeeking(false)}
        {...props}
      >
        {children}
        {resizable && !isMobile && open ? <div className="agentsam-nav__resize-handle" role="separator" aria-label="Resize navigation" aria-orientation="vertical" onPointerDown={startResize} /> : null}
      </aside>
    </>
  );
}

export const Nav = Object.assign(NavRoot, {
  Provider: NavProvider,
  Header: NavHeader,
  Content: NavContent,
  Footer: NavFooter,
  Group: NavGroup,
  GroupLabel: NavGroupLabel,
  Menu: NavMenu,
  MenuItem: NavMenuItem,
  MenuButton: NavMenuButton,
  MenuSub: NavMenuSub,
  MenuSubButton: NavMenuSubButton,
  MenuChevron: NavMenuChevron,
  Collapsible: NavCollapsible,
  CollapsibleTrigger: NavCollapsibleTrigger,
  CollapsibleContent: NavCollapsibleContent,
  Trigger: NavTrigger,
});
