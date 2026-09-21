import { cloneElement, createContext, useContext, useId, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { cx } from './utils.js';
import { useNav } from './NavProvider.js';

type CollapsibleContextValue = { open: boolean; setOpen: (open: boolean) => void; contentId: string };
const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

function useCollapsible() {
  const context = useContext(CollapsibleContext);
  if (!context) throw new Error('Nav.Collapsible components must be nested inside Nav.Collapsible');
  return context;
}

export function NavCollapsible({ children, defaultOpen = false }: { children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return <CollapsibleContext.Provider value={{ open, setOpen, contentId }}>{children}</CollapsibleContext.Provider>;
}

export function NavCollapsibleTrigger({ render, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { render?: ReactElement; children?: ReactNode }) {
  const { open, setOpen, contentId } = useCollapsible();
  const renderedProps = render?.props as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void } | undefined;
  const triggerProps = {
    'aria-expanded': open,
    'aria-controls': contentId,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      renderedProps?.onClick?.(event);
      if (!event.defaultPrevented) setOpen(!open);
    },
  };
  if (render) return <>{/* cloned to support router-specific controls */}{cloneElement(render, triggerProps)}</>;
  return <button type="button" className={cx('agentsam-nav__menu-button', className)} {...props} {...triggerProps}>{children}</button>;
}

export function NavCollapsibleContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen, contentId } = useCollapsible();
  const { isMobile } = useNav();
  if (isMobile && open) {
    return (
      <div id={contentId} className={cx('agentsam-nav__collapsible-content', 'agentsam-nav__mobile-subview', className)} {...props}>
        <button type="button" className="agentsam-nav__mobile-back" onClick={() => setOpen(false)}>
          <span aria-hidden="true">‹</span> Back
        </button>
        {props.children}
      </div>
    );
  }
  return <div id={contentId} hidden={!open} className={cx('agentsam-nav__collapsible-content', className)} {...props} />;
}
