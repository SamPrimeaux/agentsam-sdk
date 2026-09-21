import { Fragment, useId, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronDown, Folder, Menu as MenuIcon, MoreHorizontal, PanelLeft, Pin, Pencil, Plus, Search, Share, User, X, Files } from 'lucide-react';
import { useNav } from './NavProvider.js';
import type { NavAccount, NavAction, NavConversation } from './contracts.js';
import { cx } from './utils.js';

export function useNavStyle(): CSSProperties {
  const { accentColor, tokens } = useNav();
  return { ...Object.fromEntries(Object.entries(tokens).map(([key, value]) => [`--nav-${key}`, value])), '--nav-accent': accentColor } as CSSProperties;
}
export function NavScope({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { theme } = useNav();
  return <div {...props} data-nav-theme={theme} className={cx('as-nav-scope', className)} style={{ ...useNavStyle(), ...style }} />;
}

function MenuActions({ actions }: { actions: NavAction[] }) {
  const { theme } = useNav();
  const style = useNavStyle();
  return <>{actions.map((action) => <Fragment key={action.id}>
    {action.separatorBefore ? <Menu.Separator className="as-nav-menu-separator" /> : null}
    {action.children?.length ? <Menu.Sub><Menu.SubTrigger className="as-nav-menu-row" disabled={action.disabled}>{action.icon}<span>{action.label}</span><ChevronDown /></Menu.SubTrigger><Menu.Portal><Menu.SubContent data-nav-theme={theme} style={style} className="as-nav-scope as-nav-popover" sideOffset={6} collisionPadding={12}><MenuActions actions={action.children} /></Menu.SubContent></Menu.Portal></Menu.Sub> : <Menu.Item className="as-nav-menu-row" disabled={action.disabled || !action.onSelect} data-destructive={action.destructive || undefined} onSelect={action.onSelect}>{action.icon ? <span className="as-nav-icon">{action.icon}</span> : null}<span>{action.label}</span></Menu.Item>}
  </Fragment>)}</>;
}

/** The portal carries its own theme, so standalone surfaces never depend on body CSS. */
export function NavOverflowMenu({ label = 'More options', actions = [], children, id: suppliedId }: { label?: string; actions?: NavAction[]; children?: ReactNode; id?: string }) {
  const { menu, setMenu, theme } = useNav();
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const style = useNavStyle();
  return <Menu.Root open={menu === id} onOpenChange={(open) => setMenu(open ? id : null)}>
    <Menu.Trigger asChild><button type="button" className="as-nav-button" aria-label={label} title={label}>{children ?? <MoreHorizontal />}</button></Menu.Trigger>
    <Menu.Portal><Menu.Content data-nav-theme={theme} style={style} className="as-nav-scope as-nav-popover" align="end" sideOffset={8} collisionPadding={12}>
      <Menu.Label className="as-nav-menu-heading">{label}</Menu.Label>
      {actions.length ? <MenuActions actions={actions} /> : <div className="as-nav-empty">No actions available</div>}
    </Menu.Content></Menu.Portal>
  </Menu.Root>;
}

export function NavTopbarLogo({ variant = 'mark', onClick, toggle = false }: { variant?: 'mark' | 'expanded'; onClick?: () => void; toggle?: boolean }) {
  const { data, toggle: toggleNav } = useNav();
  return <button type="button" className={cx('as-nav-button as-nav-brand', toggle && 'as-nav-brand--toggle')} aria-label={toggle ? 'Toggle navigation' : (data.brand?.name ?? 'Home')} onClick={onClick ?? (toggle ? toggleNav : () => data.brand?.home && data.onNavigate?.(data.brand.home))}>
    <span className="as-nav-brand-mark">{data.brand?.logo ? <><img className="as-nav-logo-dark" src={data.brand.logo} alt="" /><img className="as-nav-logo-light" data-fallback={!data.brand.lightLogo || undefined} src={data.brand.lightLogo ?? data.brand.logo} alt="" /></> : <PanelLeft />}</span>
    {toggle ? <MenuIcon className="as-nav-brand-trigger" /> : null}
    {variant === 'expanded' ? <span>{data.brand?.name}</span> : null}
  </button>;
}

export function NavProjectContext() {
  const { data } = useNav();
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
export function NavConversationActions() {
  const { data } = useNav();
  return <NavOverflowMenu label="Conversation" actions={data.conversationActions} />;
}
export function NavShareButton() {
  const { data } = useNav();
  if (!data.onShare) return null;
  return <button type="button" className="as-nav-button" onClick={data.onShare} aria-label="Share conversation"><Share /><span className="as-nav-share-label">Share</span></button>;
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
    <NavOverflowMenu label={account?.name ?? 'Account'} actions={actions}>
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
export function NavTopbar({ children, rightSlot, modeSlot, contextSlot, startup = false, className }: { children?: ReactNode; rightSlot?: ReactNode; modeSlot?: ReactNode; contextSlot?: ReactNode; startup?: boolean; className?: string }) {
  return <NavScope className={cx('as-nav-topbar', startup && 'as-nav-topbar--startup', className)}>
    {children ?? <><div className="as-nav-topbar-leading"><NavTopbarLogo toggle />{!startup ? contextSlot ?? <NavProjectContext /> : null}</div>
      {startup ? <div className="as-nav-topbar-center">{modeSlot ?? <NavModeSwitcher />}</div> : modeSlot}
      <NavTopbarSpacer /><div className="as-nav-topbar-actions">{!startup ? <><NavFilesResources /><NavConversationActions /><NavShareButton /></> : null}{rightSlot}<NavAccountSwitcher /></div></>}
  </NavScope>;
}

function ConversationRow({ item }: { item: NavConversation }) {
  const { data, close, isMobile, theme, setOpen } = useNav();
  const [rename, setRename] = useState(false);
  const [title, setTitle] = useState(item.title);
  const style = useNavStyle();
  const selected = item.id === data.conversation?.id;
  return <div className="as-nav-conversation" data-active={selected || undefined}>
    <button type="button" className="as-nav-conversation-link" title={item.title} aria-current={selected ? 'page' : undefined} onClick={() => { data.onSelectConversation?.(item.id); if (isMobile) close(); }}>{item.title}</button>
    <div className="as-nav-row-actions">
      {data.onPinConversation ? <button type="button" className="as-nav-button" aria-label={`${item.pinned ? 'Unpin' : 'Pin'} ${item.title}`} onClick={() => data.onPinConversation?.(item.id)}><Pin /></button> : null}
      {data.onRenameConversation ? <button type="button" className="as-nav-button" aria-label={`Rename ${item.title}`} onClick={() => { setOpen(true); setTitle(item.title); setRename(true); }}><Pencil /></button> : null}
    </div>
    <Dialog.Root open={rename} onOpenChange={setRename}><Dialog.Portal><Dialog.Overlay className="as-nav-dialog-overlay" /><Dialog.Content data-nav-theme={theme} style={style} className="as-nav-scope as-nav-dialog">
      <Dialog.Title>Rename conversation</Dialog.Title><Dialog.Description>Choose a title for your conversation.</Dialog.Description>
      <form onSubmit={(event) => { event.preventDefault(); if (title.trim()) { data.onRenameConversation?.(item.id, title.trim()); setRename(false); } }}><input aria-label="Conversation title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} /><div className="as-nav-dialog-actions"><Dialog.Close asChild><button type="button" className="as-nav-button">Cancel</button></Dialog.Close><button type="submit" className="as-nav-button" disabled={!title.trim()}>Save</button></div></form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}

function SidenavContents() {
  const { data, close, isMobile, toggle } = useNav();
  const [query, setQuery] = useState('');
  const conversations = (data.conversations ?? []).filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
  const pinned = conversations.filter((item) => item.pinned);
  const projects = data.projects ?? [];
  const recent = conversations.filter((item) => !item.pinned && (!item.projectId || !projects.some((project) => project.id === item.projectId)));
  return <>
    <div className="as-nav-sidenav-head"><NavTopbarLogo toggle /><button type="button" className="as-nav-button as-nav-expanded-only" onClick={isMobile ? close : toggle} aria-label="Collapse navigation"><PanelLeft /></button></div>
    <div className="as-nav-expanded-only as-nav-sidenav-main">
      <div className="as-nav-destinations">
        {data.onCreateConversation ? <button type="button" className="as-nav-destination" onClick={() => { data.onCreateConversation?.(); if (isMobile) close(); }}><Plus /><span>New chat</span></button> : null}
        {(data.destinations ?? []).map((item) => <button type="button" key={item.id} className="as-nav-destination" data-active={item.active || undefined} onClick={() => { if (item.onSelect) item.onSelect(); else if (item.href) data.onNavigate?.(item.href); if (isMobile) close(); }}>{item.icon}<span>{item.label}</span></button>)}
      </div>
      <div className="as-nav-history"><label className="as-nav-search"><Search /><input aria-label="Search conversations" placeholder="Search conversations" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {pinned.length ? <section><h2>Pinned</h2>{pinned.map((item) => <ConversationRow key={item.id} item={item} />)}</section> : null}
        {projects.length ? <section><h2>Projects</h2>{projects.map((project) => <details key={project.id} open={query ? true : undefined}><summary><Folder /><span>{project.name}</span><ChevronDown /></summary><div className="as-nav-project-conversations">{conversations.filter((item) => item.projectId === project.id && !item.pinned).map((item) => <ConversationRow key={item.id} item={item} />)}{data.onSelectProject ? <button className="as-nav-project-home" type="button" onClick={() => { data.onSelectProject?.(project.id); if (isMobile) close(); }}>Open project</button> : null}</div></details>)}</section> : null}
        {recent.length ? <section><h2>Recent conversations</h2>{recent.map((item) => <ConversationRow key={item.id} item={item} />)}</section> : null}
        {!conversations.length ? <p className="as-nav-empty">{query ? 'No matching conversations' : 'Your conversations will appear here.'}</p> : null}
      </div>
    </div>
    <div className="as-nav-sidenav-foot"><NavAccountSwitcher expanded /></div>
  </>;
}

export function NavSidenav() {
  const { open, isMobile, isPeeking, peekable, setPeeking, setOpen, menu, theme } = useNav();
  const style = useNavStyle();
  if (isMobile) return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay className="as-nav-dialog-overlay" /><Dialog.Content data-nav-theme={theme} style={style} className="as-nav-scope as-nav-mobile-drawer"><Dialog.Title className="as-nav-sr-only">Navigation</Dialog.Title><Dialog.Description className="as-nav-sr-only">Projects and conversations</Dialog.Description><SidenavContents /></Dialog.Content></Dialog.Portal></Dialog.Root>;
  return <NavScope className="as-nav-sidenav-reserve" data-open={open}>
    <aside aria-label="Application navigation" className="as-nav-sidenav" data-expanded={open || isPeeking} onMouseEnter={() => { if (peekable && !open) setPeeking(true); }} onMouseLeave={() => { if (!menu) setPeeking(false); }} onFocusCapture={() => { if (peekable && !open) setPeeking(true); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !menu) setPeeking(false); }}><SidenavContents /></aside>
  </NavScope>;
}
