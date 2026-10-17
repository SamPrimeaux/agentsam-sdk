/**
 * Portable media-resource presentation for the existing AgentSam workbench.
 * The host supplies authorized operations and media URLs. No provider keys,
 * database access, or customer-specific routing belongs in this module.
 */
export const EDITABLE_RASTER_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
const MAX_PIXELS = 20_000_000;
const MAX_EDGE = 8192;

export function canEditRaster(asset) {
  return Boolean(asset && EDITABLE_RASTER_TYPES.includes(String(asset.content_type || '').toLowerCase()));
}

export function validateImageDimensions(width, height) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= MAX_EDGE && height <= MAX_EDGE && width * height <= MAX_PIXELS;
}

export function createMediaAssetWorkbench({ mount, addComment, saveDerivative, removeBackground, imageUrl, canRemoveBackground = false }) {
  if (!mount) throw new Error('Media workbench needs a mount element');
  let asset = null;
  let revision = 0;
  let busy = false;
  let changed = false;
  let currentTool = 'markup';
  let pointerActive = false;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let undo = [];
  let operations = [];
  let commentPosition = { x: 0.5, y: 0.5 };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  mount.innerHTML = `<section class="media-agent" aria-label="Image editing tools" hidden>
    <div class="media-agent-bar">
      <span class="media-agent-identity">Image tools</span>
      <div class="media-agent-tools" role="toolbar" aria-label="Image tools">
        <button type="button" data-media-tool="markup" title="Draw directly on a reviewable working copy">Markup</button>
        <button type="button" data-media-tool="comment" title="Pin a review comment to this image">Comment</button>
        <button type="button" data-media-tool="remove-bg" title="Background removal requires a supported image provider">Remove BG</button>
        <button type="button" data-media-tool="erase" title="Erase pixels on a working copy">Erase</button>
        <button type="button" data-media-tool="resize" title="Resize a working copy in exact pixels">Resize</button>
      </div>
    </div>
    <p class="media-image-tools-help">Editing creates a separate working copy. Use the top-right Inspect control to ask AgentSam about this image.</p>
    <p class="media-agent-response" role="status" aria-live="polite" hidden></p>
  </section>`;
  const root = mount.querySelector('.media-agent');
  const response = root.querySelector('.media-agent-response');
  const toolbar = root.querySelector('.media-agent-tools');
  const dialog = document.createElement('dialog');
  dialog.className = 'media-agent-editor';
  dialog.setAttribute('aria-label', 'Edit selected image');
  dialog.innerHTML = `<div class="media-agent-editor-shell">
    <header class="media-agent-editor-head"><div><span class="media-agent-eyebrow">Media Library / working copy</span><h2 class="media-agent-editor-title">Edit image</h2></div><button type="button" data-editor-action="close" aria-label="Close without saving">Close</button></header>
    <div class="media-agent-editor-content">
      <div class="media-agent-editor-main"><div class="media-agent-canvas-wrap"><canvas aria-label="Image markup and editing surface"></canvas><div class="media-agent-pins" aria-label="Review comment pins"></div></div><p class="media-agent-canvas-note" role="status" aria-live="polite">The original file will not be changed.</p></div>
      <aside class="media-agent-editor-rail"><div class="media-agent-editor-modes" role="toolbar" aria-label="Edit mode"><button type="button" data-editor-mode="markup">Markup</button><button type="button" data-editor-mode="comment">Comment</button><button type="button" data-editor-mode="erase">Erase</button><button type="button" data-editor-mode="resize">Resize</button></div>
        <div class="media-agent-draw-controls"><label>Brush color <input type="color" data-editor-color value="#e0473e"></label><label>Brush size <input type="range" data-editor-brush min="2" max="60" value="12"></label></div>
        <form class="media-agent-comment-form" hidden><label>Review comment<textarea rows="3" maxlength="1200" required placeholder="What should change or be checked?"></textarea></label><p>Click a location on the image to place the comment pin.</p><button type="submit">Add comment</button></form>
        <div class="media-agent-comments" aria-live="polite"></div>
        <form class="media-agent-resize-form" hidden><p>Output size in pixels</p><label>Width <input type="number" name="width" min="1" max="8192" required></label><label>Height <input type="number" name="height" min="1" max="8192" required></label><label class="media-agent-aspect"><input type="checkbox" name="lock" checked> Lock proportions</label><button type="submit">Apply resize</button></form>
        <div class="media-agent-editor-info"><strong data-editor-dimensions>—</strong><small>Edits are non-destructive until you explicitly save a new asset.</small></div>
      </aside>
    </div>
    <footer class="media-agent-editor-foot"><button type="button" data-editor-action="undo" disabled>Undo</button><button type="button" data-editor-action="reset" disabled>Reset</button><span class="media-agent-editor-spacer"></span><button type="button" data-editor-action="cancel">Discard</button><button type="button" data-editor-action="save" class="media-agent-accept" disabled>Save as new asset</button></footer>
  </div>`;
  document.body.append(dialog);
  const canvas = dialog.querySelector('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const hint = dialog.querySelector('.media-agent-canvas-note');
  const commentForm = dialog.querySelector('.media-agent-comment-form');
  const resizeForm = dialog.querySelector('.media-agent-resize-form');
  const comments = dialog.querySelector('.media-agent-comments');
  const pins = dialog.querySelector('.media-agent-pins');
  let draftPin = null;
  const resizePins = () => renderPins();
  window.addEventListener('resize', resizePins);
  const dimensions = dialog.querySelector('[data-editor-dimensions]');
  const saveButton = dialog.querySelector('[data-editor-action="save"]');
  const undoButton = dialog.querySelector('[data-editor-action="undo"]');
  const resetButton = dialog.querySelector('[data-editor-action="reset"]');
  const drawControls = dialog.querySelector('.media-agent-draw-controls');

  function say(message, error = false) {
    response.hidden = !message;
    response.textContent = message || '';
    response.classList.toggle('is-error', error);
  }
  function setBusy(value) {
    busy = value;
    form.querySelector('button').disabled = value;
    dialog.querySelectorAll('button, input, textarea').forEach((element) => { element.disabled = value; });
    if (!value) refreshState();
  }
  function refreshState() {
    const disabled = busy || !asset;
    saveButton.disabled = disabled || !changed;
    undoButton.disabled = disabled || undo.length === 0;
    resetButton.disabled = disabled || !changed;
    dimensions.textContent = canvas.width && canvas.height ? `${canvas.width} × ${canvas.height} px` : '—';
  }
  function renderPins() {
    pins.replaceChildren();
    if (!canvas.width) return;
    const bounds = canvas.getBoundingClientRect();
    const parent = canvas.parentElement.getBoundingClientRect();
    const notes = Array.isArray(asset?.meta?.review_notes) ? asset.meta.review_notes : [];
    const placed = notes.slice(-25).map((note, index) => ({
      x: Number(note.x), y: Number(note.y), title: note.text, label: String(notes.length - Math.min(notes.length,25) + index + 1)
    }));
    if (draftPin) placed.push({ ...draftPin, label: '+', title: 'New comment location' });
    for (const note of placed) {
      if (!Number.isFinite(note.x) || !Number.isFinite(note.y)) continue;
      const pin = document.createElement('span');
      pin.className = 'media-agent-pin';
      pin.textContent = note.label;
      pin.title = note.title || 'Image comment';
      pin.style.left = (bounds.left - parent.left + bounds.width * note.x) + 'px';
      pin.style.top = (bounds.top - parent.top + bounds.height * note.y) + 'px';
      pins.append(pin);
    }
  }
  function showComments() {
    comments.replaceChildren();
    const notes = Array.isArray(asset?.meta?.review_notes) ? asset.meta.review_notes : [];
    for (const note of notes.slice(-25).reverse()) {
      const row = document.createElement('p');
      row.textContent = `${new Date(note.created_at).toLocaleDateString()} · ${note.text}`;
      comments.append(row);
    }
    renderPins();
  }
  function switchTool(tool) {
    currentTool = tool;
    dialog.querySelectorAll('[data-editor-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.editorMode === tool)));
    commentForm.hidden = tool !== 'comment';
    resizeForm.hidden = tool !== 'resize';
    drawControls.hidden = !['markup', 'erase'].includes(tool);
    canvas.style.cursor = tool === 'comment' ? 'crosshair' : ['markup', 'erase'].includes(tool) ? 'crosshair' : 'default';
    hint.textContent = tool === 'comment' ? 'Click the image to position a review comment. Comments do not alter image pixels.' :
      tool === 'resize' ? 'Set exact output dimensions, then apply. The original retains its dimensions.' :
      tool === 'erase' ? 'Drag to erase pixels on this working copy. Save creates a separate transparent PNG.' :
      'Draw on this working copy with mouse, pen, or touch. Save creates a separate PNG.';
  }
  function trackUndo() {
    undo.push(canvas.toDataURL('image/png'));
    if (undo.length > 8) undo.shift();
    refreshState();
  }
  async function restoreSnapshot(data) {
    const img = new Image();
    img.src = data;
    await img.decode();
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  }
  async function loadWorkingCopy() {
    if (!asset) return;
    hint.textContent = 'Loading original pixels…';
    const selectedId = String(asset.id);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl(asset);
    await img.decode();
    if (!asset || String(asset.id) !== selectedId) return;
    if (!validateImageDimensions(img.naturalWidth, img.naturalHeight)) {
      throw new Error('This image is too large for safe browser editing. Use a supported server transformer.');
    }
    canvas.width = sourceWidth = img.naturalWidth;
    canvas.height = sourceHeight = img.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    undo = [];
    operations = [];
    changed = false;
    resizeForm.elements.width.value = canvas.width;
    resizeForm.elements.height.value = canvas.height;
    refreshState();
    switchTool(currentTool);
    renderPins();
  }
  async function openEditor(tool) {
    if (!asset || busy || (tool !== 'comment' && !canEditRaster(asset))) return;
    currentTool = tool;
    dialog.querySelector('.media-agent-editor-title').textContent = asset.filename || 'Edit image';
    showComments();
    dialog.showModal();
    try { await loadWorkingCopy(); }
    catch (error) {
      hint.textContent = error.message || 'Unable to load editable image pixels.';
      saveButton.disabled = true;
      dialog.querySelectorAll('[data-editor-mode]').forEach((btn) => { btn.disabled = true; });
    }
  }
  function closeEditor() {
    if (busy) return;
    pointerActive = false;
    dialog.close();
    canvas.width = 0;
    canvas.height = 0;
    undo = [];
    operations = [];
    changed = false;
    draftPin = null;
  }

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-media-tool]');
    if (!button || button.disabled) return;
    if (button.dataset.mediaTool === 'remove-bg') {
      if (!asset || typeof removeBackground !== "function" || busy) return;
      const selected = asset;
      setBusy(true);
      say("Removing background. Original image will be preserved.");
      Promise.resolve(removeBackground({ asset: selected })).then((result) => {
        if (result?.ok === false) throw new Error(result.error || "Background removal failed.");
        say("Transparent derivative created. Original remains unchanged.");
      }).catch((error) => say(error?.message || "Background removal failed.")).finally(() => setBusy(false));
      return;
    }
    void openEditor(button.dataset.mediaTool);
  });
  dialog.addEventListener('click', (event) => {
    const mode = event.target.closest('[data-editor-mode]');
    if (mode && !busy) { switchTool(mode.dataset.editorMode); return; }
    const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
    if (!action || busy) return;
    if (action === 'close' || action === 'cancel') closeEditor();
    if (action === 'undo' && undo.length) {
      const snapshot = undo.pop();
      void restoreSnapshot(snapshot).then(() => { changed = undo.length > 0; operations.push({ type: 'undo' }); refreshState(); });
    }
    if (action === 'reset') void loadWorkingCopy().catch((error) => { hint.textContent = error.message; });
    if (action === 'save') void saveCopy();
  });
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); else closeEditor(); });

  function locate(event) {
    const r = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(canvas.width, (event.clientX - r.left) * canvas.width / r.width)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - r.top) * canvas.height / r.height)) };
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (busy || !canvas.width || !canvas.height) return;
    const pos = locate(event);
    if (currentTool === 'comment') {
      commentPosition = { x: pos.x / canvas.width, y: pos.y / canvas.height };
      draftPin = commentPosition;
      renderPins();
      hint.textContent = `Comment pin positioned at ${Math.round(commentPosition.x * 100)}%, ${Math.round(commentPosition.y * 100)}%.`;
      return;
    }
    if (!['markup', 'erase'].includes(currentTool)) return;
    trackUndo();
    pointerActive = true;
    canvas.setPointerCapture(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Number(dialog.querySelector('[data-editor-brush]').value) * canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    ctx.globalCompositeOperation = currentTool === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = dialog.querySelector('[data-editor-color]').value;
    ctx.lineTo(pos.x + 0.01, pos.y + 0.01);
    ctx.stroke();
    operations.push({ type: currentTool, brush_px: ctx.lineWidth });
    changed = true;
    refreshState();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointerActive) return;
    const pos = locate(event);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });
  const stopPointer = () => { pointerActive = false; ctx.globalCompositeOperation = 'source-over'; };
  canvas.addEventListener('pointerup', stopPointer);
  canvas.addEventListener('pointercancel', stopPointer);
  dialog.querySelectorAll('[data-editor-mode]').forEach((button) => { button.disabled = false; });
  const originalRatio = () => canvas.width / canvas.height;
  resizeForm.elements.width.addEventListener('input', () => {
    if (resizeForm.elements.lock.checked) resizeForm.elements.height.value = Math.round(Number(resizeForm.elements.width.value) / originalRatio());
  });
  resizeForm.elements.height.addEventListener('input', () => {
    if (resizeForm.elements.lock.checked) resizeForm.elements.width.value = Math.round(Number(resizeForm.elements.height.value) * originalRatio());
  });
  resizeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const w = Number(resizeForm.elements.width.value);
    const h = Number(resizeForm.elements.height.value);
    if (!validateImageDimensions(w, h)) { hint.textContent = 'Choose dimensions up to 8192 px per edge and 20 megapixels overall.'; return; }
    if (w === canvas.width && h === canvas.height) return;
    trackUndo();
    const temp = document.createElement('canvas');
    temp.width = w; temp.height = h;
    temp.getContext('2d').drawImage(canvas, 0, 0, w, h);
    canvas.width = w; canvas.height = h;
    ctx.drawImage(temp, 0, 0);
    operations.push({ type: 'resize', width: w, height: h });
    changed = true;
    refreshState();
    renderPins();
    hint.textContent = 'Resized working copy. Save as a new asset when ready.';
  });
  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!asset || busy) return;
    const note = commentForm.querySelector('textarea').value.trim();
    if (!note) return;
    const id = String(asset.id);
    setBusy(true);
    try {
      const result = await addComment({ asset, text: note, ...commentPosition });
      if (asset && String(asset.id) === id && result?.asset) {
        asset = result.asset;
        commentForm.reset();
        draftPin = null;
        showComments();
        hint.textContent = 'Comment saved on this asset.';
      }
    } catch (error) { hint.textContent = error.message || 'Comment could not be saved.'; }
    finally { setBusy(false); }
  });
  async function saveCopy() {
    if (!asset || !changed || busy) return;
    const editingAsset = asset;
    setBusy(true);
    hint.textContent = 'Preparing image derivative…';
    try {
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not export edited pixels.')), 'image/png'));
      const base = String(editingAsset.filename || 'image').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 70);
      const file = new File([blob], `${base}-edit-${Date.now()}.png`, { type: 'image/png' });
      const result = await saveDerivative({ asset: editingAsset, file, operations: [...operations], width: canvas.width, height: canvas.height });
      if (result?.ok === false) throw new Error(result.error || 'Could not save derivative.');
      closeEditorAfterSave();
      say('Saved a new asset. The original remains unchanged.');
    } catch (error) { hint.textContent = error.message || 'Could not save derivative.'; }
    finally { setBusy(false); }
  }
  function closeEditorAfterSave() {
    dialog.close();
    canvas.width = 0; canvas.height = 0;
    changed = false;
    undo = [];
    operations = [];
  }
  function setAsset(nextAsset, { backgroundRemoval = canRemoveBackground } = {}) {
    revision++;
    asset = nextAsset && String(nextAsset.content_type || '').toLowerCase().startsWith('image/') ? nextAsset : null;
    root.hidden = !asset;
    const raster = canEditRaster(asset);
    for (const button of toolbar.querySelectorAll('[data-media-tool]')) {
      const isRasterTool = ['markup','erase','resize'].includes(button.dataset.mediaTool);
      button.disabled = !asset || (isRasterTool && !raster);
      if (isRasterTool && !raster) button.title = 'This file type cannot be safely raster-edited in the browser';
    }
    say('');
    const remove = toolbar.querySelector('[data-media-tool="remove-bg"]');
    // This UI never guesses backend capability: only enable with an implemented host action.
    remove.disabled = !asset || !raster || !backgroundRemoval || typeof removeBackground !== "function";
    remove.textContent = remove.disabled ? 'Remove BG (unavailable)' : 'Remove BG';
    remove.title = remove.disabled
      ? 'No verified background-removal processor is connected for this asset'
      : 'Create a transparent derivative using the connected foreground-segmentation provider. Original stays intact.';
    if (dialog.open) closeEditorAfterSave();
  }
  function destroy() { revision++; window.removeEventListener('resize', resizePins); if (dialog.open) dialog.close(); dialog.remove(); mount.replaceChildren(); }
  return Object.freeze({ setAsset, destroy });
}
