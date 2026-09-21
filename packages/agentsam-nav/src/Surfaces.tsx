import { Fragment, useId, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronDown, Files, Folder, MessageSquare, MoreHorizontal, PanelLeft, PanelTop, Pin, Pencil, Plus, Search, Share, Trash2, User } from 'lucide-react';
import { useNav } from './NavProvider.js';
import type { NavAccount, NavAction, NavConversation, NavProject } from './contracts.js';
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
    {action.children?.length
      ? <Menu.Sub><Menu.SubTrigger className="as-nav-menu-row" disabled={action.disabled}>{action.icon}<span>{action.label}</span><ChevronDown /></Menu.SubTrigger><Menu.Portal><Menu.SubContent data-nav-theme={theme} style={style} className="as-nav-scope as-nav-popover" sideOffset={6} collisionPadding={12}><MenuActions actions={action.children} /></Menu.SubContent></Menu.Portal></Menu.Sub>
      : <Menu.Item className="as-nav-menu-row" disabled={action.disabled || !action.onSelect} data-destructive={action.destructive || undefined} onSelect={action.onSelect}>{action.icon ? <span className="as-nav-icon">{action.icon}</span> : null}<span>{action.label}</span></Menu.Item>}
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
  const { data, toggle: toggleNav } = useNav();
  const label = toggle ? 'Toggle sidebar' : (data.brand?.name ?? 'Home');
  return <button type="button" className={cx('as-nav-button as-nav-brand', toggle && 'as-nav-brand--toggle')} aria-label={label} title={label} onClick={onClick ?? (toggle ? toggleNav : () => data.brand?.home && data.onNavigate?.(data.brand.home))}>
    <span className="as-nav-brand-mark">{data.brand?.logo ? <><img className="as-nav-logo-dark" src={data.brand.logo} alt="" /><img className="as-nav-logo-light" data-fallback={!data.brand.lightLogo || undefined} src={data.brand.lightLogo ?? data.brand.logo} alt="" /></> : <PanelLeft />}</span>
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
      <div className="as-nav-topbar-leading">{showNavigationTrigger ? <NavTopbarLogo toggle /> : null}{!startup ? contextSlot ?? <NavProjectContext /> : null}</div>
      {startup ? <div className="as-nav-topbar-center">{modeSlot ?? <NavModeSwitcher />}</div> : modeSlot}
      <NavTopbarSpacer />
      <div className="as-nav-topbar-actions">{!startup ? <><NavShareButton /><NavConversationActions /><NavPinnedSummary /></> : null}{rightSlot}{showAccount ? <NavAccountSwitcher /> : null}</div>
    </>}
  </NavScope>;
}

function RenameDialog({ open, onOpenChange, title, value, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; value: string; onSave: (value: string) => void }) {
  const { theme } = useNav();
  const [draft, setDraft] = useState(value);
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

function SidenavContents() {
  const { data, close, isMobile } = useNav();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const conversations = (data.conversations ?? []).filter((item) => !normalized || item.title.toLowerCase().includes(normalized));
  const projects = (data.projects ?? []).filter((item) => !normalized || item.name.toLowerCase().includes(normalized) || conversations.some((conversation) => conversation.projectId === item.id));
  const pinnedConversations = conversations.filter((item) => item.pinned);
  const pinnedProjects = projects.filter((item) => item.pinned);
  const recent = conversations.filter((item) => !item.pinned && (!item.projectId || !projects.some((project) => project.id === item.projectId)));
  return <>
    <div className="as-nav-sidenav-head"><NavTopbarLogo toggle /></div>
    <div className="as-nav-sidenav-main">
      <div className="as-nav-destinations">
        {data.onCreateConversation ? <button type="button" className="as-nav-destination" title="New chat" aria-label="New chat" onClick={() => { data.onCreateConversation?.(); if (isMobile) close(); }}><Plus /><span>New chat</span></button> : null}
        {(data.destinations ?? []).map((item) => <button type="button" key={item.id} className="as-nav-destination" title={item.label} aria-label={item.label} data-active={item.active || undefined} onClick={() => { if (item.onSelect) item.onSelect(); else if (item.href) data.onNavigate?.(item.href); if (isMobile) close(); }}>{item.icon}<span>{item.label}</span></button>)}
      </div>
      <div className="as-nav-expanded-only as-nav-history">
        <label className="as-nav-search"><Search /><input aria-label="Search conversations" placeholder="Search conversations" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {(pinnedProjects.length || pinnedConversations.length) ? <section><h2>Pinned</h2>{pinnedProjects.map((item) => <ProjectRow key={item.id} item={item} conversations={conversations} />)}{pinnedConversations.map((item) => <ConversationRow key={item.id} item={item} />)}</section> : null}
        {projects.length ? <section><h2>Projects</h2>{projects.map((project) => <ProjectRow key={project.id} item={project} conversations={conversations} />)}</section> : null}
        {recent.length ? <section><h2>Recent conversations</h2>{recent.map((item) => <ConversationRow key={item.id} item={item} />)}</section> : null}
        {!conversations.length && !projects.length ? <p className="as-nav-empty">{query ? 'No matching conversations or projects' : 'Your conversations will appear here.'}</p> : null}
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
    <aside aria-label="Application navigation" className="as-nav-sidenav" data-expanded={open || isPeeking} onMouseEnter={() => { if (peekable && !open) setPeeking(true); }} onMouseLeave={() => { if (!menu) setPeeking(false); }}><SidenavContents /></aside>
  </NavScope>;
}
