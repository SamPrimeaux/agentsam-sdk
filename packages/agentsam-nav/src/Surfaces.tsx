import { Fragment, useEffect, useId, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronDown, Files, Folder, MessageSquare, MoreHorizontal, PanelLeft, PanelTop, Pin, Pencil, Plus, Search, Share, Trash2, User, X } from 'lucide-react';
import { useNav } from './NavProvider.js';
import { NavTrigger } from './NavTrigger.js';
import type { NavAccount, NavAction, NavConversation, NavDestination, NavProject } from './contracts.js';
import { cx, navDestinationActive } from './utils.js';

export function useNavStyle(): CSSProperties {
  const { accentColor, tokens, width, resizable } = useNav();
  return { ...(resizable ? { '--nav-width': width + 'px' } : {}), ...Object.fromEntries(Object.entries(tokens).map(([key, value]) => [`--nav-${key}`, value])), '--nav-accent': accentColor } as CSSProperties;
}

export function NavScope({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { theme } = useNav();
  return <div {...props} data-nav-theme={theme} className={cx('as-nav-scope', className)} style={{ ...useNavStyle(), ...style }} />;
}

function MenuActions({ actions }: { actions: NavAction[] }) {
  return <>{actions.map((action) => <Fragment key={action.id}>
    {action.separatorBefore ? <Menu.Separator className="as-nav-menu-separator" /> : null}
    {action.children?.length
      ? <Menu.Sub><Menu.SubTrigger className="as-nav-menu-row" disabled={action.disabled}><span className="as-nav-icon">{action.icon}</span><span>{action.label}</span><ChevronDown /></Menu.SubTrigger><Menu.Portal><Menu.SubContent asChild sideOffset={6} collisionPadding={12}><NavScope className="as-nav-popover"><MenuActions actions={action.children} /></NavScope></Menu.SubContent></Menu.Portal></Menu.Sub>
      : <Menu.Item className="as-nav-menu-row" disabled={action.disabled || !action.onSelect} data-destructive={action.destructive || undefined} onSelect={action.onSelect}><span className="as-nav-icon">{action.icon}</span><span>{action.label}</span>{action.shortcut ? <kbd className="as-nav-shortcut">{action.shortcut}</kbd> : null}</Menu.Item>}
  </Fragment>)}</>;
}

/** The portal carries its own theme, so standalone surfaces never depend on body CSS. */
export function NavOverflowMenu({ label = 'More options', actions = [], children, id: suppliedId, align = 'end' }: { label?: string; actions?: NavAction[]; children?: ReactNode; id?: string; align?: 'start' | 'center' | 'end' }) {
  const { menu, setMenu, theme } = useNav();
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const style = useNavStyle();
  return <Menu.Root open={menu === id} onOpenChange={(open) => setMenu(open ? id : null)}>
    <Menu.Trigger asChild><button type="button" className="as-nav-button" aria-label={label} title={label}>{children ?? <MoreHorizontal />}</button></Menu.Trigger>
    <Menu.Portal><Menu.Content data-nav-theme={theme} style={style} className="as-nav-scope as-nav-popover" align={align} sideOffset={8} collisionPadding={12}>
      <Menu.Label className="as-nav-menu-heading">{label}</Menu.Label>
      {actions.length ? <MenuActions actions={actions} /> : <div className="as-nav-empty">No actions available</div>}
    </Menu.Content></Menu.Portal>
  </Menu.Root>;
}

export function NavTopbarLogo({ variant = 'mark', onClick, toggle = false }: { variant?: 'mark' | 'expanded'; onClick?: () => void; toggle?: boolean }) {
  const { data } = useNav();
  const [logoFailed, setLogoFailed] = useState(false);
  const label = toggle ? 'Toggle sidebar' : (data.brand?.name ?? 'Home');
  if (toggle) return <NavTrigger aria-label={label} onClick={onClick} />;
  return <button type="button" className="as-nav-button as-nav-brand" aria-label={label} title={label} onClick={onClick ?? (() => data.brand?.home && data.onNavigate?.(data.brand.home))}>
    <span className="as-nav-brand-mark">{data.brand?.logo && !logoFailed ? <><img className="as-nav-logo-dark" src={data.brand.logo} alt="" onError={() => setLogoFailed(true)} /><img className="as-nav-logo-light" data-fallback={!data.brand.lightLogo || undefined} src={data.brand.lightLogo ?? data.brand.logo} alt="" onError={() => setLogoFailed(true)} /></> : <PanelLeft />}</span>
    {variant === 'expanded' ? <span>{data.brand?.name}</span> : null}
  </button>;
}

export function NavBreadcrumbs() {
  const { data, isMobile, close } = useNav();
  const breadcrumbs = data.breadcrumbs ?? [];
  return <nav className="as-nav-breadcrumbs" aria-label="Breadcrumb"><ol>{breadcrumbs.map((item, index) => <li key={item.id}>
    {index > 0 ? <span aria-hidden="true" className="as-nav-separator">/</span> : null}
    {index === breadcrumbs.length - 1 ? <span aria-current="page" title={item.label}>{item.label}</span> : item.href
      ? <a href={item.href} onClick={(event) => { if (data.onNavigate) { event.preventDefault(); data.onNavigate(item.href!); } if (isMobile) close(); }}>{item.label}</a>
      : <span>{item.label}</span>}
  </li>)}</ol></nav>;
}

export function NavProjectContext() {
  const { data } = useNav();
  if (!data.project && !data.conversation && data.breadcrumbs?.length) return <NavBreadcrumbs />;
  return <div className="as-nav-context">
    {data.project ? <><NavOverflowMenu label={data.project.name} actions={data.projectActions}><Folder /><span className="as-nav-project-name">{data.project.name}</span><ChevronDown /></NavOverflowMenu><span className="as-nav-separator">/</span></> : null}
    <span className="as-nav-title" title={data.conversation?.title}>{data.conversation?.title ?? data.brand?.name}</span>
    {data.mode ? <span className="as-nav-mode-label">· {data.mode === 'work' ? 'Work' : 'Chat'}</span> : null}
  </div>;
}

export function NavTopbarSpacer() { return <span className="as-nav-spacer" />; }

export function NavFilesResources() {
  const { data } = useNav();
  return <NavOverflowMenu label="Files & resources" actions={data.resourceActions}><Files /></NavOverflowMenu>;
}

export function NavPinnedSummary() {
  const { data } = useNav();
  if (!data.resourceActions?.length) return null;
  return <NavOverflowMenu label="Toggle pinned summary" actions={data.resourceActions}><PanelTop /></NavOverflowMenu>;
}

export function NavConversationActions() {
  const { data } = useNav();
  return <NavOverflowMenu label="Conversation options" actions={data.conversationActions} />;
}

export function NavShareButton() {
  const { data } = useNav();
  if (!data.onShare) return null;
  return <button type="button" className="as-nav-button" onClick={data.onShare} aria-label="Share conversation" title="Share"><Share /><span className="as-nav-share-label">Share</span></button>;
}

export function NavAccountSwitcher({ accounts, activeAccountId, onAccountChange, expanded = false }: { accounts?: NavAccount[]; activeAccountId?: string; onAccountChange?: (id: string) => void; expanded?: boolean }) {
  const { data } = useNav();
  const options = accounts ?? data.accounts ?? (data.account ? [data.account] : []);
  const account = options.find((item) => item.id === (activeAccountId ?? data.account?.id)) ?? data.account;
  const change = onAccountChange ?? data.onAccountChange;
  const actions: NavAction[] = [
    ...options.filter((item) => item.id !== account?.id).map((item) => ({ id: item.id, label: item.name, disabled: !change, onSelect: () => change?.(item.id) })),
    ...(data.accountActions ?? []),
  ];
  return <div className={cx('as-nav-account', expanded && 'as-nav-account--expanded')}>
    <NavOverflowMenu label={account?.name ?? 'Account'} actions={actions} align="start">
      <span className="as-nav-avatar">{account?.avatar ? <img src={account.avatar} alt="" /> : <User />}</span>
      {expanded ? <span className="as-nav-account-copy"><strong>{account?.name ?? 'Account'}</strong>{account?.plan ? <small>{account.plan}</small> : null}</span> : null}
      {expanded ? <ChevronDown /> : null}
    </NavOverflowMenu>
  </div>;
}

export function NavModeSwitcher() {
  const { data } = useNav();
  return <div className="as-nav-mode-switch" role="group" aria-label="Conversation mode">{(['chat', 'work'] as const).map((mode) => <button type="button" key={mode} aria-pressed={data.mode === mode} onClick={() => data.onModeChange?.(mode)} disabled={!data.onModeChange}>{mode === 'chat' ? 'Chat' : 'Work'}</button>)}</div>;
}

export function NavTopbar({
  children,
  rightSlot,
  modeSlot,
  contextSlot,
  startup = false,
  className,
  showNavigationTrigger = true,
  showAccount = false,
}: {
  children?: ReactNode;
  rightSlot?: ReactNode;
  modeSlot?: ReactNode;
  contextSlot?: ReactNode;
  startup?: boolean;
  className?: string;
  showNavigationTrigger?: boolean;
  showAccount?: boolean;
}) {
  return <NavScope className={cx('as-nav-topbar', startup && 'as-nav-topbar--startup', className)}>
    {children ?? <>
      <div className="as-nav-topbar-leading">{showNavigationTrigger ? <NavTrigger aria-label="Toggle sidebar" /> : null}{!startup ? contextSlot ?? <NavProjectContext /> : null}</div>
      {startup ? <div className="as-nav-topbar-center">{modeSlot ?? <NavModeSwitcher />}</div> : modeSlot}
      <NavTopbarSpacer />
      <div className="as-nav-topbar-actions">{!startup ? <><NavShareButton /><NavConversationActions /><NavPinnedSummary /></> : null}{rightSlot}{showAccount ? <NavAccountSwitcher /> : null}</div>
    </>}
  </NavScope>;
}

function RenameDialog({ open, onOpenChange, title, value, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; value: string; onSave: (value: string) => void }) {
  const { theme } = useNav();
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  const style = useNavStyle();
  return <Dialog.Root open={open} onOpenChange={(next) => { if (next) setDraft(value); onOpenChange(next); }}><Dialog.Portal>
    <Dialog.Overlay className="as-nav-dialog-overlay" />
    <Dialog.Content data-nav-theme={theme} style={style} className="as-nav-scope as-nav-dialog">
      <Dialog.Title>{title}</Dialog.Title><Dialog.Description>Choose a clear name.</Dialog.Description>
      <form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) { onSave(draft.trim()); onOpenChange(false); } }}>
        <input autoFocus aria-label={title} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={200} />
        <div className="as-nav-dialog-actions"><Dialog.Close asChild><button type="button" className="as-nav-button">Cancel</button></Dialog.Close><button type="submit" className="as-nav-button" disabled={!draft.trim()}>Save</button></div>
      </form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

function ConversationRow({ item }: { item: NavConversation }) {
  const { data, close, isMobile } = useNav();
  const [rename, setRename] = useState(false);
  const selected = item.id === data.conversation?.id;
  const actions = data.getConversationActions?.(item) ?? [
    ...(data.onPinConversation ? [{ id: 'pin', label: item.pinned ? 'Unpin chat' : 'Pin chat', icon: <Pin />, onSelect: () => data.onPinConversation?.(item.id) }] : []),
    ...(data.onDeleteConversation ? [{ id: 'delete', label: 'Delete chat', icon: <Trash2 />, destructive: true, separatorBefore: true, onSelect: () => data.onDeleteConversation?.(item.id) }] : []),
  ];
  return <div className="as-nav-conversation" data-active={selected || undefined} data-nav-item-id={item.id}>
    <button type="button" className="as-nav-conversation-link" title={item.title} aria-current={selected ? 'page' : undefined} onClick={() => { data.onSelectConversation?.(item.id); if (isMobile) close(); }}><MessageSquare /><span>{item.title}</span></button>
    <div className="as-nav-row-actions">
      {data.onRenameConversation ? <button type="button" className="as-nav-button" aria-label={`Rename ${item.title}`} title="Rename" onClick={(event) => { event.stopPropagation(); setRename(true); }}><Pencil /></button> : null}
      {actions.length ? <NavOverflowMenu id={`conversation-${item.id}`} label={`${item.title} options`} actions={actions} /> : null}
    </div>
    {data.onRenameConversation ? <RenameDialog open={rename} onOpenChange={setRename} title="Rename conversation" value={item.title} onSave={(title) => data.onRenameConversation?.(item.id, title)} /> : null}
  </div>;
}

function ProjectRow({ item, conversations }: { item: NavProject; conversations: NavConversation[] }) {
  const { data, close, isMobile } = useNav();
  const [expanded, setExpanded] = useState(item.id === data.project?.id);
  const [rename, setRename] = useState(false);
  const actions = data.getProjectActions?.(item) ?? [
    ...(data.onPinProject ? [{ id: 'pin', label: item.pinned ? 'Unpin project' : 'Pin project', icon: <Pin />, onSelect: () => data.onPinProject?.(item.id) }] : []),
    ...(data.onDeleteProject ? [{ id: 'delete', label: 'Delete project', icon: <Trash2 />, destructive: true, separatorBefore: true, onSelect: () => data.onDeleteProject?.(item.id) }] : []),
  ];
  return <div className="as-nav-project" data-active={item.id === data.project?.id || undefined} data-nav-item-id={item.id}>
    <div className="as-nav-project-row">
      <button type="button" className="as-nav-project-toggle" title={item.name} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><Folder /><span>{item.name}</span><ChevronDown /></button>
      <div className="as-nav-row-actions">
        {data.onRenameProject ? <button type="button" className="as-nav-button" aria-label={`Rename ${item.name}`} title="Rename" onClick={() => setRename(true)}><Pencil /></button> : null}
        {actions.length ? <NavOverflowMenu id={`project-${item.id}`} label={`${item.name} options`} actions={actions} /> : null}
      </div>
    </div>
    {expanded ? <div className="as-nav-project-conversations">
      {conversations.filter((conversation) => conversation.projectId === item.id && !conversation.pinned).map((conversation) => <ConversationRow key={conversation.id} item={conversation} />)}
      {data.onSelectProject ? <button className="as-nav-project-home" type="button" onClick={() => { data.onSelectProject?.(item.id); if (isMobile) close(); }}>Open project</button> : null}
    </div> : null}
    {data.onRenameProject ? <RenameDialog open={rename} onOpenChange={setRename} title="Rename project" value={item.name} onSave={(name) => data.onRenameProject?.(item.id, name)} /> : null}
  </div>;
}

/** Visible help on both hover and keyboard focus, with the button retaining its own name. */
function NavIconAction({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  const id = useId();
  return <span className="as-nav-icon-action">
    <button aria-label={label} {...props} type="button" aria-describedby={id}>{children}</button>
    <span id={id} role="tooltip" className="as-nav-icon-help">{label}</span>
  </span>;
}

function DestinationRow({ item, depth = 0 }: { item: NavDestination; depth?: number }) {
  const { data, close, isMobile, open, setOpen, storageKey } = useNav();
  const active = navDestinationActive(item);
  const [expanded, setExpanded] = useState(active);
  useEffect(() => {
    if (active) { setExpanded(true); return; }
    if (!storageKey) return;
    try { setExpanded(JSON.parse(localStorage.getItem(storageKey + ':groups') ?? '{}')[item.id] === true); } catch { /* Ignore unavailable preferences. */ }
  }, [active, storageKey, item.id]);
  const toggle = () => {
    if (!open && !isMobile) setOpen(true);
    setExpanded((current) => {
      const next = !current;
      if (storageKey) try {
        const saved = JSON.parse(localStorage.getItem(storageKey + ':groups') ?? '{}');
        localStorage.setItem(storageKey + ':groups', JSON.stringify({ ...saved, [item.id]: next }));
      } catch { /* Shell remains usable without storage. */ }
      return next;
    });
  };
  const navigate = (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (item.href && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    if (item.onSelect) { event.preventDefault(); item.onSelect(); }
    else if (item.href && data.onNavigate) { event.preventDefault(); data.onNavigate(item.href); }
    if (isMobile) close();
  };
  const rowClass = depth ? 'as-nav-submenu-link' : 'as-nav-destination';
  if (item.children?.length) return <div className="as-nav-destination-group">
    {item.href ? <div className="as-nav-parent-row" data-active={active || undefined}>
      <a className={rowClass} href={item.href} title={item.label} aria-label={item.label} aria-current={item.active ? 'page' : undefined} data-active={item.active || undefined} onClick={navigate}>
        {item.icon}<span>{item.label}</span>
      </a>
      <NavIconAction className="as-nav-button as-nav-branch-toggle" label={(expanded ? 'Collapse ' : 'Expand ') + item.label} aria-expanded={expanded} aria-controls={'as-nav-submenu-' + item.id} onClick={toggle}>
        <ChevronDown aria-hidden="true" className="as-nav-destination-chevron" />
      </NavIconAction>
    </div> : <button type="button" className={rowClass} title={item.label} data-active={active || undefined} aria-expanded={expanded} aria-controls={'as-nav-submenu-' + item.id} onClick={toggle}>
      {item.icon}<span>{item.label}</span><ChevronDown aria-hidden="true" className="as-nav-destination-chevron" />
    </button>}
    {expanded ? <div className="as-nav-submenu" role="group" aria-label={item.label + ' pages'} id={'as-nav-submenu-' + item.id}>
      {item.children.map((child) => <DestinationRow key={child.id} item={child} depth={depth + 1} />)}
    </div> : null}
  </div>;
  const props = { className: rowClass, title: item.label, 'aria-label': item.label, 'data-active': item.active || undefined, 'aria-current': item.active ? 'page' as const : undefined };
  return item.href
    ? <a {...props} href={item.href} onClick={navigate}>{item.icon}<span>{item.label}</span></a>
    : <button {...props} type="button" disabled={!item.onSelect} onClick={navigate}>{item.icon}<span>{item.label}</span></button>;
}

function HistoryCollection({id,title,items,empty,searching=false}:{id:string;title:string;items:ReactNode[];empty:string;searching?:boolean}) {
  const {storageKey} = useNav();
  const [expanded,setExpanded] = useState(true);
  const [more,setMore] = useState(false);
  useEffect(() => {
    if (!storageKey) return;
    try { setExpanded(JSON.parse(localStorage.getItem(storageKey+':collections') || '{}')[id] !== false); } catch { /* Optional UI preferences. */ }
  },[storageKey,id]);
  const toggle = () => setExpanded(value => {
    const next = !value;
    if (storageKey) try { const saved=JSON.parse(localStorage.getItem(storageKey+':collections') || '{}');localStorage.setItem(storageKey+':collections',JSON.stringify({...saved,[id]:next})); } catch { /* Keep usable. */ }
    return next;
  });
  const shown = searching || expanded;
  return <section aria-label={title}><h2><button type="button" className="as-nav-collection-toggle" aria-expanded={shown} onClick={toggle}>{title}<ChevronDown data-expanded={shown}/></button></h2>
    {shown ? <>{items.length ? (more || searching ? items : items.slice(0,6)) : <p className="as-nav-empty">{empty}</p>}
    {items.length>6 && !searching ? <button type="button" className="as-nav-collection-more" onClick={() => setMore(value => !value)}>{more?'Show less':'Show more'}</button> : null}</> : null}
  </section>;
}

function SidenavContents() {
  const { data, close, isMobile } = useNav();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const conversations = (data.conversations ?? []).filter((item) => !normalized || item.title.toLowerCase().includes(normalized));
  const projects = (data.projects ?? []).filter((item) => !normalized || item.name.toLowerCase().includes(normalized) || conversations.some((conversation) => conversation.projectId === item.id));
  const pinnedConversations = conversations.filter((item) => item.pinned);
  const pinnedProjects = projects.filter((item) => item.pinned);
  const recent = conversations.filter((item) => !item.pinned).sort((a,b) => (b.updatedAt ?? 0)-(a.updatedAt ?? 0));
  const newConversation = data.onCreateConversation ? <button type="button" className="as-nav-destination" title="New chat" aria-label="New chat" onClick={() => { data.onCreateConversation?.(); if (isMobile) close(); }}><Plus /><span>New chat</span></button> : null;
  const insertAfter = data.destinations?.some(item => item.id === data.newConversationAfter) ? data.newConversationAfter : undefined;
  return <>
    {data.showSidebarHeader !== false ? <div className="as-nav-sidenav-head"><NavTopbarLogo toggle /></div> : isMobile ? <div className="as-nav-sidenav-head as-nav-sidenav-head--close"><button type="button" className="as-nav-button" onClick={close}><X aria-hidden="true" /><span>Close navigation</span></button></div> : null}
    <div className="as-nav-sidenav-main">
      <div className="as-nav-destinations">
        {!insertAfter ? newConversation : null}
        {(data.destinations ?? []).map((item) => <Fragment key={item.id}><DestinationRow item={item} />{item.id === insertAfter ? newConversation : null}</Fragment>)}
      </div>
      {data.showHistory !== false ? <div className="as-nav-expanded-only as-nav-history">
        <label className="as-nav-search"><Search /><input aria-label="Search projects and conversations" placeholder="Search workspace" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <HistoryCollection id="projects" title="Projects" searching={Boolean(query)} empty={data.historyStatus === 'loading' ? 'Loading projects…' : data.historyStatus === 'error' ? 'Projects are unavailable.' : 'No projects yet.'}
          items={projects.filter(item => !item.pinned).map(item => <ProjectRow key={item.id} item={item} conversations={conversations} />)} />
        {data.historyStatus === 'error' && data.onRetryHistory ? <button type="button" className="as-nav-collection-more" onClick={data.onRetryHistory}>Retry projects</button> : null}
        <HistoryCollection id="pinned" title="Pinned" searching={Boolean(query)} empty={query ? 'No matching pinned items.' : 'Pin projects or conversations from their menus.'}
          items={[...pinnedProjects.map(item => <ProjectRow key={item.id} item={item} conversations={conversations} />),...pinnedConversations.map(item => <ConversationRow key={item.id} item={item} />)]} />
        <HistoryCollection id="recent" title="Recent" searching={Boolean(query)} empty={query ? 'No matching activity.' : 'Your conversations will appear here.'}
          items={[
            ...recent.map(item => ({id:item.id,at:item.updatedAt || 0,row:<ConversationRow key={item.id} item={item} />})),
            ...projects.filter(item => !item.pinned && item.updatedAt).map(item => ({id:item.id,at:item.updatedAt || 0,row:<ProjectRow key={item.id} item={item} conversations={[]} />}))
          ].sort((a,b) => b.at-a.at).map(item => item.row)} />
      </div> : null}
    </div>
    <div className="as-nav-sidenav-foot"><NavAccountSwitcher expanded /></div>
  </>;
}

export function NavSidenav() {
  const { open, isMobile, isPeeking, peekable, setPeeking, setOpen, menu, theme, resizable, width, setWidth } = useNav();
  const style = useNavStyle();
  const [hint, setHint] = useState<{label:string; top:number; left:number} | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideHint = () => { clearTimeout(hintTimer.current); setHint(null); };
  const showHint = (target: EventTarget | null) => {
    clearTimeout(hintTimer.current);
    if (open || isMobile || !(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('.as-nav-destination, .as-nav-account button');
    if (!row) return;
    const label = row.getAttribute('aria-label') || row.getAttribute('title');
    if (!label) return;
    hintTimer.current = setTimeout(() => {
      const rect = row.getBoundingClientRect();
      setHint({label, top: Math.max(8, Math.min(window.innerHeight - 44, rect.top + (rect.height - 32) / 2)), left: rect.right + 10});
    }, 350);
  };
  useEffect(() => { hideHint(); return () => clearTimeout(hintTimer.current); }, [open, isMobile, menu]);
  if (isMobile) return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="as-nav-dialog-overlay" /><Dialog.Content data-nav-theme={theme} style={style} className="as-nav-scope as-nav-mobile-drawer"><Dialog.Title className="as-nav-sr-only">Navigation</Dialog.Title><Dialog.Description className="as-nav-sr-only">Projects and conversations</Dialog.Description><SidenavContents /></Dialog.Content></Dialog.Portal></Dialog.Root>;
  return <NavScope className="as-nav-sidenav-reserve" data-open={open}
    onMouseOver={(event) => showHint(event.target)} onMouseOut={hideHint}
    onFocus={(event) => { showHint(event.target); if (peekable && !open) setPeeking(true); }}
    onBlur={(event) => { hideHint(); if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !menu) setPeeking(false); }}
    onPointerDown={hideHint} onScrollCapture={hideHint}>
    {hint && !open ? createPortal(<NavScope role="tooltip" className="as-nav-rail-tooltip" style={{'--nav-tooltip-top':hint.top+'px', '--nav-tooltip-left':hint.left+'px'} as CSSProperties}>{hint.label}</NavScope>, document.body) : null}
    <aside aria-label="Application navigation" className="as-nav-sidenav" data-expanded={open || isPeeking} onMouseEnter={() => { if (peekable && !open) setPeeking(true); }} onMouseLeave={() => { if (!menu) setPeeking(false); }}><SidenavContents /></aside>
    {open && resizable ? <div className="as-nav-resize" role="separator" aria-label="Resize navigation" aria-orientation="vertical" aria-valuemin={208} aria-valuemax={400} aria-valuenow={width} tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidth(width + (event.key === 'ArrowLeft' ? -8 : 8)); } else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setWidth(event.key === 'Home' ? 208 : 400); } }}
      onDoubleClick={() => setWidth(264)}
      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setWidth(event.clientX - event.currentTarget.parentElement!.getBoundingClientRect().left); }}
      onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} /> : null}
  </NavScope>;
}
