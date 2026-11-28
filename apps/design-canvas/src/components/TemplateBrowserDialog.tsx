import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, FileUp, Image as ImageIcon, Layers3, Plus, Search, Shapes, Sparkles, Upload, X, PanelTop } from 'lucide-react';
import type { CreativeType } from '../creative-model';

export type TemplateBrowserItem = {
  id: string;
  kind: string;
  title: string;
  description: string;
  category?: string;
  payloadUrl: string | null;
  previewUrl?: string | null;
  cover?: string;
  specs?: Record<string, unknown>;
  renderer?: string | null;
};

type TemplateCategory = 'for-you' | 'pages' | 'documents' | 'slides' | 'sheets' | 'images';
type Props = {
  open: boolean;
  templates: TemplateBrowserItem[];
  loading?: boolean;
  error?: string;
  actionError?: string;
  busyId?: string;
  embedded?: boolean;
  onClose: () => void;
  onStartFromScratch: (type: CreativeType) => void;
  onImportFile: () => void;
  onUploadImage: () => void;
  onCreateOther: (type: CreativeType) => void;
  onSelectTemplate: (template: TemplateBrowserItem) => Promise<boolean>;
};

const categories: Array<{ id: TemplateCategory; label: string }> = [
  { id: 'for-you', label: 'For you' },
  { id: 'pages', label: 'Pages' },
  { id: 'documents', label: 'Documents' },
  { id: 'slides', label: 'Slides' },
  { id: 'sheets', label: 'Sheets' },
  { id: 'images', label: 'Images' },
];
const kinds: Record<Exclude<TemplateCategory, 'for-you'>, string[]> = {
  pages: ['page_template', 'page'],
  documents: ['document_template'],
  slides: ['presentation_template', 'slide_template'],
  sheets: ['sheet_template', 'spreadsheet_template'],
  images: ['image_generation_template', 'image_template'],
};

function readColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function readObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
    catch { return {}; }
  }
  return {};
}

function TemplateVisual({ template }: { template: TemplateBrowserItem }) {
  const specs = template.specs || {};
  const visual = readObject(specs.visual_system);
  const accent = readColor(visual.accent, 'var(--dcx-blue)');
  const cover = String(visual.cover || '');
  const paper = readColor(visual.background, cover === 'bold-orange' ? accent : 'var(--dcx-template-paper)');
  const tone = String(visual.tone || '');
  const imageTreatment = String(visual.image_treatment || visual.imageTreatment || '');
  const style = { '--dcx-template-accent': accent, '--dcx-template-paper': paper } as CSSProperties;
  if (template.previewUrl) return <div className="dcx-template-card-art"><img src={template.previewUrl} alt="" loading="lazy"/></div>;
  if (template.cover) return <div className="dcx-template-card-art dcx-template-card-art-cover"><img src={template.cover} alt="" loading="lazy" decoding="async"/></div>;
  if (template.kind === 'image_generation_template' || template.kind === 'image_template') {
    const needsReference = String(specs.reference_input || '') === 'required-upload';
    return <div className="dcx-template-card-art dcx-template-art-image" style={style}>
      <div className="dcx-template-image-sheet"><span className="dcx-template-image-orbit"/><span className="dcx-template-image-core"><ImageIcon size={30}/></span><span className="dcx-template-image-caption">{needsReference ? 'REFERENCE REQUIRED' : 'IMAGE PROMPT'}</span></div>
    </div>;
  }
  if (template.kind === 'page_template' || template.kind === 'page') {
    return <div className="dcx-template-card-art dcx-template-art-page" style={style}>
      <div className="dcx-template-page-preview"><strong>{template.title}</strong><span/><i/><i/><b/><b/><small>EDITABLE PAGE</small></div>
    </div>;
  }
  if (template.kind === 'document_template') {
    return <div className="dcx-template-card-art dcx-template-art-document" style={style}>
      <div className="dcx-template-document-preview"><small>DOCUMENT</small><strong>{template.title}</strong><span/><i/><i/><i/><b/><b/></div>
    </div>;
  }
  if (template.kind === 'sheet_template' || template.kind === 'spreadsheet_template') {
    return <div className="dcx-template-card-art dcx-template-art-sheet" style={style}>
      <div className="dcx-template-sheet-preview"><strong>{template.title}</strong><div>{Array.from({ length: 12 }, (_, index) => <i key={index}/>)}</div><small>EDITABLE CELLS</small></div>
    </div>;
  }
  const slideCount = Number(specs.slide_count || 1);
  const visualClass = [template.kind === 'presentation_template' ? 'is-presentation' : 'is-slide', cover === 'bold-orange' ? 'is-bold-orange' : '', tone === 'warm-editorial' ? 'is-warm-editorial' : '', imageTreatment === 'portrait-led' ? 'is-portrait-led' : ''].filter(Boolean).join(' ');
  return <div className={'dcx-template-card-art ' + visualClass} style={style}>
    <div className="dcx-template-sheet-stack"><span/><span/></div>
    <div className="dcx-template-sheet">
      <div className="dcx-template-sheet-kicker">{template.category || (template.kind === 'presentation_template' ? 'PRESENTATION' : 'SLIDE LAYOUT')}</div>
      <div className="dcx-template-sheet-title">{template.title}</div>
      <div className="dcx-template-sheet-accent"/>
      <div className="dcx-template-sheet-lines"><i/><i/><i/></div>
      <div className="dcx-template-sheet-blocks"><i/><i/><i/></div>
      {template.kind === 'presentation_template' ? <small>{slideCount} editable slides</small> : null}
    </div>
  </div>;
}

export function TemplateBrowserDialog({ open, templates, loading = false, error = '', actionError = '', busyId = '', embedded = false, onClose, onStartFromScratch, onImportFile, onUploadImage, onCreateOther, onSelectTemplate }: Props) {
  const [category, setCategory] = useState<TemplateCategory>('for-you');
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const visible = useMemo(() => {
    const categoryItems = category === 'for-you' ? templates : templates.filter((item) => kinds[category].includes(item.kind));
    const search = query.trim().toLowerCase();
    return categoryItems.filter((item) => !search || [item.title, item.description, item.category || '', item.kind].join(' ').toLowerCase().includes(search));
  }, [category, query, templates]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const themeRoot = document.querySelector<HTMLElement>('.dcx-root');
    const theme = getComputedStyle(themeRoot || document.documentElement);
    for (const token of ['bg', 'panel', 'raised', 'hover', 'line', 'text', 'muted', 'blue']) {
      const value = theme.getPropertyValue('--dcx-' + token).trim();
      if (value) backdropRef.current?.style.setProperty('--dcx-' + token, value);
    }
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]'));
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  if (!open) return null;
  const emptyCopy = category === 'pages'
    ? 'No Page templates match this search.'
    : category === 'documents'
      ? 'No Document templates match this search.'
      : category === 'sheets'
      ? 'No Spreadsheet templates match this search.'
      : category === 'slides'
        ? 'No Slides templates match this search.'
        : category === 'images'
          ? 'No Image templates match this search.'
          : 'No templates match this search.';

  return createPortal(
    <div ref={backdropRef} className="dcx-template-browser-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dcx-template-browser" role="dialog" aria-modal="true" aria-labelledby="dcx-template-browser-title" ref={dialogRef}>
        <header className="dcx-template-browser-header">
          <div><span className="dcx-template-browser-eyebrow">DESIGN CANVAS</span><h2 id="dcx-template-browser-title">Create</h2><p>Start with a document or choose an editable template from your shared catalog.</p></div>
          <button ref={closeRef} className="dcx-template-browser-close" type="button" onClick={onClose} aria-label="Close template browser"><X size={18}/></button>
        </header>
        <nav className="dcx-template-browser-tabs" role="tablist" aria-label="Template categories">
          {categories.map((item) => <button key={item.id} type="button" role="tab" aria-selected={category === item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}>{item.label}</button>)}
        </nav>
        <div className="dcx-template-browser-toolbar">
          <div className="dcx-template-browser-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates" aria-label="Search templates"/><kbd>/</kbd></div>
          <span className="dcx-template-count">{loading ? 'Loading catalog…' : `${visible.length} ${visible.length === 1 ? 'template' : 'templates'}`}</span>
        </div>
        {(error || actionError) ? <div className="dcx-template-browser-alert" role="alert">{actionError || error}</div> : null}
        <div className="dcx-template-browser-scroll">
          {(['for-you', 'pages', 'documents', 'slides', 'sheets'] as TemplateCategory[]).includes(category) ? <section className="dcx-template-start-section" aria-label="Start a new creative document">
            <div className="dcx-template-section-heading"><strong>{category === 'for-you' ? 'Start something new' : 'Start a ' + (category === 'pages' ? 'Page' : category === 'documents' ? 'Document' : category === 'sheets' ? 'Spreadsheet' : 'presentation')}</strong><span>{category === 'for-you' ? 'Choose an editable format' : 'Start with a blank editable file'}</span></div>
            <div className="dcx-template-start-grid">
              {category === 'for-you' ? <>
                <button type="button" className="dcx-template-start-card" onClick={() => onStartFromScratch('page')}><span className="dcx-template-start-icon"><PanelTop size={19}/></span><span><strong>Blank Page</strong><small>Flexible blocks and checklists</small></span><ArrowUpRight size={15}/></button>
                <button type="button" className="dcx-template-start-card" onClick={() => onStartFromScratch('document')}><span className="dcx-template-start-icon"><FileUp size={19}/></span><span><strong>Blank Document</strong><small>Structured writing and sections</small></span><ArrowUpRight size={15}/></button>
                <button type="button" className="dcx-template-start-card" onClick={() => onStartFromScratch('spreadsheet')}><span className="dcx-template-start-icon"><Layers3 size={19}/></span><span><strong>Blank Spreadsheet</strong><small>Editable cells and formulas</small></span><ArrowUpRight size={15}/></button>
                <button type="button" className="dcx-template-start-card" onClick={() => onStartFromScratch('slides')}><span className="dcx-template-start-icon"><Plus size={19}/></span><span><strong>Blank Presentation</strong><small>Start a new editable deck</small></span><ArrowUpRight size={15}/></button>
              </> : category === 'slides' ? <>
                <button type="button" className="dcx-template-start-card" onClick={() => onStartFromScratch('slides')}><span className="dcx-template-start-icon"><Plus size={19}/></span><span><strong>Start from scratch</strong><small>Open a new editable presentation</small></span><ArrowUpRight size={15}/></button>
                <button type="button" className="dcx-template-start-card" onClick={onImportFile}><span className="dcx-template-start-icon"><FileUp size={19}/></span><span><strong>Create from a file</strong><small>Import an AgentSam deck (.json)</small></span><ArrowUpRight size={15}/></button>
                <button type="button" className="dcx-template-start-card" onClick={onUploadImage}><span className="dcx-template-start-icon"><Upload size={19}/></span><span><strong>Upload an image</strong><small>Start a slide with your own image</small></span><ArrowUpRight size={15}/></button>
              </> : <button type="button" className="dcx-template-start-card" onClick={() => onStartFromScratch(category === 'pages' ? 'page' : category === 'documents' ? 'document' : 'spreadsheet')}><span className="dcx-template-start-icon"><Plus size={19}/></span><span><strong>Start from scratch</strong><small>Open a blank editable {category === 'pages' ? 'Page' : category === 'documents' ? 'Document' : 'Spreadsheet'}</small></span><ArrowUpRight size={15}/></button>}
            </div>
          </section> : null}
          <section className="dcx-template-results" aria-label={`${category} templates`}>
            <div className="dcx-template-section-heading"><strong>{category === 'for-you' ? 'Templates for you' : `${categories.find((item) => item.id === category)?.label} templates`}</strong><span>From the shared template catalog</span></div>
            {!embedded ? <div className="dcx-template-empty"><Layers3 size={24}/><strong>Open Design Canvas in AgentSam Work</strong><p>The shared template catalog is available inside the Work surface.</p></div>
              : loading && !templates.length ? <div className="dcx-template-loading" role="status"><span/><span/><span/><small>Loading shared templates…</small></div>
                : visible.length ? <div className="dcx-template-card-grid">{visible.map((template) => <article className="dcx-template-card" key={template.id}>
                  <button type="button" className="dcx-template-card-select" onClick={() => void onSelectTemplate(template)} disabled={busyId === template.id || !template.payloadUrl} aria-label={`Use ${template.title}`}>
                    <TemplateVisual template={template}/>
                    <span className="dcx-template-card-copy"><strong>{template.title}</strong><small>{template.category || (template.kind === 'presentation_template' ? 'Full presentation' : template.kind === 'slide_template' ? 'Single slide' : template.kind === 'page_template' ? 'Page' : template.kind === 'document_template' ? 'Document' : template.kind === 'spreadsheet_template' || template.kind === 'sheet_template' ? 'Spreadsheet' : 'Image prompt')}</small><span>{template.description}</span></span>
                    <span className="dcx-template-card-action">{busyId === template.id ? 'Opening…' : template.kind === 'image_generation_template' ? String(template.specs?.reference_input || '') === 'required-upload' ? 'Upload reference' : 'Use prompt' : template.kind === 'slide_template' ? 'Add slide' : template.kind === 'presentation_template' ? 'Create presentation' : template.kind === 'page_template' ? 'Create Page' : template.kind === 'document_template' ? 'Create Document' : template.kind === 'spreadsheet_template' || template.kind === 'sheet_template' ? 'Create Spreadsheet' : 'Use template'} <ArrowUpRight size={14}/></span>
                  </button>
                  {!template.payloadUrl ? <span className="dcx-template-card-unavailable">Template payload not registered</span> : null}
                </article>)}</div>
                  : <div className="dcx-template-empty"><Sparkles size={24}/><strong>{emptyCopy}</strong><p>{category === 'pages' || category === 'documents' || category === 'sheets' ? 'Start with a blank file or clear your search to see the available templates.' : 'Try another search or choose a different category.'}</p></div>}
          </section>
          {category === 'for-you' ? <section className="dcx-template-other-tools" aria-label="Other creative tools"><span>More creative tools</span><button type="button" onClick={() => onCreateOther('design')}><Shapes size={15}/> Design</button><button type="button" onClick={() => onCreateOther('system')}><Layers3 size={15}/> Design system</button><button type="button" onClick={() => onCreateOther('whiteboard')}><Sparkles size={15}/> Whiteboard</button><button type="button" onClick={() => onCreateOther('code')}><Code2Icon/> Code workspace</button></section> : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function Code2Icon() {
  return <span className="dcx-template-code-icon">{'</>'}</span>;
}
