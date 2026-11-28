/**
 * Verified Canvas document -> compact, inert SVG preview.
 * The preview is a visual index, never a substitute for the editable document.
 * No HTML, remote images, scripts, CSS urls or raw style declarations are emitted.
 */
const WIDTH = 512;
const HEIGHT = 320;
const escapeText = value => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const safeColor = (value, fallback) => typeof value === 'string' && /^#[\da-f]{3,8}$/i.test(value) ? value : fallback;
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = value => String(Math.round(value * 100) / 100);
const safeRasterDataUri = value => typeof value === 'string'
  && value.length <= 160_000
  && /^data:image\/(?:png|jpeg|webp|avif);base64,[a-z\d+/=]+$/i.test(value)
  ? value : null;

function svgText(value, x, y, maxWidth, fontSize, fill = '#344054', weight = 400, anchor = 'start') {
  const content = String(value ?? '').replace(/\s+/g, ' ').slice(0, 180);
  if (!content || maxWidth <= 0) return '';
  const capacity = Math.max(1, Math.floor(maxWidth / Math.max(3, fontSize * 0.56)));
  const clipped = content.length > capacity ? content.slice(0, Math.max(0, capacity - 1)) + '…' : content;
  return `<text x="${number(x)}" y="${number(y)}" fill="${fill}" font-family="Arial,sans-serif" font-size="${number(fontSize)}" font-weight="${weight}" text-anchor="${anchor}">${escapeText(clipped)}</text>`;
}

function legacyNodeSvg(node, x, y, scale, depth = 0, counter = { count: 0 }, bounds = { width: WIDTH, height: HEIGHT }) {
  if (!node || depth > 6 || counter.count++ > 180) return '';
  const left = x + finite(node.x) * scale;
  const top = y + finite(node.y) * scale;
  const width = Math.max(0, finite(node.width)) * scale;
  const height = Math.max(0, finite(node.height)) * scale;
  if (left > bounds.width + 100 || top > bounds.height + 100 || left + width < 0 || top + height < 0) return '';
  const background = safeColor(node.style?.backgroundColor || node.style?.background, node.type === 'frame' ? '#e9edf2' : node.type === 'button' ? '#b8c8e0' : node.type === 'image' ? '#d7dce2' : '#f3f5f7');
  const foreground = safeColor(node.style?.color, '#344054');
  let result = '';
  if (['frame', 'button', 'input', 'link', 'image', 'html'].includes(node.type)) {
    result += `<rect x="${number(left)}" y="${number(top)}" width="${number(width)}" height="${number(height)}" rx="${number(Math.min(7 * scale, 5))}" fill="${background}"/>`;
  }
  if (node.type === 'image' && width > 8 && height > 8) {
    result += `<path d="M${number(left + width * .2)} ${number(top + height * .72)} L${number(left + width * .42)} ${number(top + height * .4)} L${number(left + width * .57)} ${number(top + height * .55)} L${number(left + width * .76)} ${number(top + height * .3)} L${number(left + width * .9)} ${number(top + height * .72)}Z" fill="#b4becb"/>`;
  }
  if (['text', 'button', 'link', 'input'].includes(node.type)) {
    const fontSize = Math.max(3, Math.min(18, finite(node.style?.fontSize, 19) * scale));
    result += svgText(node.text || node.name, left + 3 * scale, top + Math.min(height - fontSize * .2, fontSize + 3 * scale), width - 6 * scale, fontSize, foreground);
  }
  if (Array.isArray(node.children)) for (const child of node.children) result += legacyNodeSvg(child, left, top, scale, depth + 1, counter, bounds);
  return result;
}

function creativeObjectSvg(object, bounds, counter = { count: 0 }) {
  if (!object || typeof object !== 'object' || counter.count++ > 180) return '';
  const x = finite(object.x);
  const y = finite(object.y);
  const width = clamp(finite(object.w), 0, bounds.width);
  const height = clamp(finite(object.h), 0, bounds.height);
  if (x > bounds.width || y > bounds.height || x + width < 0 || y + height < 0 || width <= 0 || height <= 0) return '';
  const left = clamp(x, -bounds.width, bounds.width * 2);
  const top = clamp(y, -bounds.height, bounds.height * 2);
  const fill = safeColor(object.fill, safeColor(object.color, '#e7eaf0'));
  const foreground = safeColor(object.color, '#263241');
  const stroke = safeColor(object.strokeColor, '#98a2b3');
  const opacity = number(clamp(finite(object.opacity, 1), 0, 1));
  const right = left + width;
  const bottom = top + height;
  let result = `<g opacity="${opacity}">`;

  if (object.type === 'text') {
    const fontSize = clamp(finite(object.fontSize, 28), 5, 96);
    const lines = String(object.text ?? '').split(/\r?\n/).slice(0, 3);
    lines.forEach((line, index) => {
      result += svgText(line, left + 2, top + Math.min(height - 1, fontSize * (index + 1)), width - 4, fontSize, foreground, clamp(finite(object.weight, 500), 100, 900));
    });
  } else if (object.type === 'shape') {
    const shape = object.shape || 'rect';
    if (shape === 'circle') {
      result += `<ellipse cx="${number(left + width / 2)}" cy="${number(top + height / 2)}" rx="${number(width / 2)}" ry="${number(height / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${number(clamp(finite(object.strokeWidth, 0), 0, 24))}"/>`;
    } else if (shape === 'triangle') {
      result += `<path d="M${number(left + width / 2)} ${number(top)} L${number(right)} ${number(bottom)} L${number(left)} ${number(bottom)}Z" fill="${fill}" stroke="${stroke}"/>`;
    } else if (shape === 'diamond') {
      result += `<path d="M${number(left + width / 2)} ${number(top)} L${number(right)} ${number(top + height / 2)} L${number(left + width / 2)} ${number(bottom)} L${number(left)} ${number(top + height / 2)}Z" fill="${fill}" stroke="${stroke}"/>`;
    } else {
      result += `<rect x="${number(left)}" y="${number(top)}" width="${number(width)}" height="${number(height)}" rx="${number(clamp(finite(object.radius, 8), 0, 32))}" fill="${fill}" stroke="${stroke}" stroke-width="${number(clamp(finite(object.strokeWidth, 0), 0, 24))}"/>`;
    }
    if (object.text) result += svgText(object.text, left + 6, top + Math.min(height - 3, Math.max(12, height / 2)), width - 12, clamp(finite(object.fontSize, 16), 5, 28), safeColor(object.color, '#ffffff'), finite(object.weight, 600), object.align === 'center' ? 'middle' : object.align === 'right' ? 'end' : 'start');
  } else if (object.type === 'image' || object.type === 'media') {
    const dataUri = safeRasterDataUri(object.src || object.fillImage);
    result += `<rect x="${number(left)}" y="${number(top)}" width="${number(width)}" height="${number(height)}" rx="4" fill="#e6eaf0" stroke="#c4ccd7"/>`;
    if (dataUri) {
      result += `<image href="${dataUri}" x="${number(left)}" y="${number(top)}" width="${number(width)}" height="${number(height)}" preserveAspectRatio="xMidYMid slice"/>`;
    } else {
      result += `<path d="M${number(left + width * .12)} ${number(top + height * .82)} L${number(left + width * .38)} ${number(top + height * .45)} L${number(left + width * .55)} ${number(top + height * .62)} L${number(left + width * .76)} ${number(top + height * .3)} L${number(left + width * .9)} ${number(top + height * .82)}Z" fill="#b7c2d0"/>`;
    }
  } else if (object.type === 'path' && Array.isArray(object.points)) {
    const points = object.points.slice(0, 120).map(point => `${number(left + finite(point?.x))},${number(top + finite(point?.y))}`).join(' ');
    if (points) result += `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="${number(clamp(finite(object.strokeWidth, 3), 1, 32))}" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (object.type === 'chart') {
    const data = Array.isArray(object.chartData) ? object.chartData.slice(0, 8) : [];
    const max = Math.max(1, ...data.map(item => Math.max(0, finite(item?.value))));
    const gap = 3;
    const barWidth = data.length ? Math.max(2, (width - gap * (data.length + 1)) / data.length) : 0;
    data.forEach((item, index) => {
      const barHeight = Math.max(2, Math.max(0, finite(item?.value)) / max * Math.max(2, height - 10));
      const bx = left + gap + index * (barWidth + gap);
      result += `<rect x="${number(bx)}" y="${number(bottom - barHeight)}" width="${number(barWidth)}" height="${number(barHeight)}" rx="2" fill="${safeColor(item?.color, ['#397ff2', '#25a783', '#8a6cf0', '#e69a45'][index % 4])}"/>`;
    });
  } else if (object.type === 'table' && Array.isArray(object.tableData)) {
    const rows = object.tableData.slice(0, 5);
    const columns = Math.min(5, Math.max(1, ...rows.map(row => Array.isArray(row) ? row.length : 0)));
    const cellW = width / columns;
    const cellH = height / Math.max(1, rows.length);
    rows.forEach((row, rowIndex) => {
      for (let col = 0; col < columns; col++) {
        const cx = left + col * cellW;
        const cy = top + rowIndex * cellH;
        result += `<rect x="${number(cx)}" y="${number(cy)}" width="${number(cellW)}" height="${number(cellH)}" fill="${rowIndex === 0 ? '#e9edf3' : '#ffffff'}" stroke="#d8dee7"/>`;
        result += svgText(Array.isArray(row) ? row[col] : '', cx + 3, cy + Math.min(cellH - 2, 12), cellW - 6, 9, '#344054');
      }
    });
  }
  result += '</g>';
  return result;
}

function wrapSvg(content, background = '#e7eaf0') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" rx="12" fill="${safeColor(background, '#e7eaf0')}"/>${content}</svg>`;
}

function renderNativeTextDocument(creative, documentName) {
  const data = creative.data || {};
  const title = escapeText(data.title || creative.name || documentName || 'Untitled');
  const blocks = Array.isArray(data.blocks) ? data.blocks.slice(0, 7) : [];
  let content = `<rect x="18" y="18" width="476" height="284" rx="9" fill="#ffffff" stroke="#d5dae1"/>`;
  content += `<text x="44" y="76" font-size="24" font-weight="700" fill="#202938">${title}</text>`;
  if (data.subtitle) content += svgText(data.subtitle, 44, 98, 420, 10, '#667085');
  let y = data.subtitle ? 132 : 118;
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'heading') {
      content += svgText(block.text, 44, y, 418, 15, '#202938', 700);
      y += 24;
    } else if (block.type === 'paragraph') {
      content += svgText(block.text, 44, y, 418, 10, '#667085');
      content += `<path d="M44 ${y + 7} H${Math.min(460, 44 + Math.max(80, String(block.text || '').length * 2.1))}" stroke="#e4e7ec" stroke-width="3" stroke-linecap="round"/>`;
      y += 27;
    } else if (block.type === 'task_list' || block.type === 'bullet_list') {
      const items = Array.isArray(block.items) ? block.items.slice(0, 4) : [];
      if (block.title) { content += svgText(block.title, 44, y, 420, 11, '#344054', 700); y += 17; }
      for (const item of items) {
        const label = typeof item === 'string' ? item : item?.text;
        content += `<rect x="46" y="${y - 10}" width="10" height="10" rx="2" fill="none" stroke="#98a2b3"/>`;
        content += svgText(label, 66, y, 390, 9, '#667085');
        y += 20;
      }
    } else if (block.type === 'callout') {
      content += `<rect x="42" y="${y - 15}" width="420" height="30" rx="5" fill="${block.tone === 'warning' ? '#fff3d8' : block.tone === 'success' ? '#e7f6ee' : '#eaf2ff'}"/>`;
      content += svgText(block.text, 54, y + 2, 396, 9, '#344054');
      y += 40;
    } else if (block.type === 'divider') {
      content += `<path d="M44 ${y} H462" stroke="#e4e7ec"/>`;
      y += 15;
    }
    if (y > 286) break;
  }
  if (!blocks.length) for (let i = 0; i < 5; i++) content += `<path d="M44 ${132 + i * 28} H${440 - i * 17}" stroke="#e4e7ec" stroke-width="4" stroke-linecap="round"/>`;
  return wrapSvg(content, '#e7eaf0');
}

function renderSpreadsheet(creative, documentName) {
  const data = creative.data || {};
  const sheet = Array.isArray(data.sheets) ? data.sheets.find(item => item?.id === data.activeSheetId) || data.sheets[0] : null;
  const columns = Array.isArray(sheet?.columns) ? sheet.columns.slice(0, 6) : [];
  const rows = Array.isArray(sheet?.rows) ? sheet.rows.slice(0, 4) : [];
  let content = '<rect x="18" y="18" width="476" height="284" rx="9" fill="#ffffff" stroke="#d5dae1"/>';
  content += svgText(sheet?.name || creative.name || documentName || 'Spreadsheet', 34, 49, 440, 18, '#202938', 700);
  const count = Math.max(1, columns.length || 4);
  const cellW = 444 / count;
  const top = 72;
  const headers = columns.length ? columns.map(item => item.label) : ['Name', 'Status', 'Owner', 'Due'];
  headers.forEach((label, col) => {
    const x = 34 + col * cellW;
    content += `<rect x="${number(x)}" y="${top}" width="${number(cellW)}" height="30" fill="#eaf1f9" stroke="#d5dae1"/>`;
    content += svgText(label, x + 5, top + 19, cellW - 10, 9, '#344054', 700);
  });
  for (let row = 0; row < Math.max(3, rows.length); row++) {
    const y = top + 30 + row * 38;
    const cells = rows[row]?.cells || {};
    columns.slice(0, count).forEach((column, col) => {
      const x = 34 + col * cellW;
      content += `<rect x="${number(x)}" y="${y}" width="${number(cellW)}" height="38" fill="#ffffff" stroke="#e4e7ec"/>`;
      content += svgText(cells[column.id], x + 5, y + 22, cellW - 10, 8, '#667085');
    });
  }
  return wrapSvg(content, '#e7eaf0');
}

function renderBoardCollection(boards, label) {
  if (!Array.isArray(boards) || !boards.length) {
    return wrapSvg(`<rect x="28" y="28" width="456" height="264" rx="8" fill="#ffffff" stroke="#d5dae1"/><text x="256" y="160" text-anchor="middle" font-size="17" font-family="Arial,sans-serif" fill="#667085">${escapeText(label || 'Untitled')}</text>`);
  }
  const visible = boards.slice(0, 4);
  const columns = visible.length === 1 ? 1 : 2;
  const rows = Math.ceil(visible.length / columns);
  const gap = 12;
  const margin = 16;
  const slotWidth = (WIDTH - 2 * margin - gap * (columns - 1)) / columns;
  const slotHeight = (HEIGHT - 2 * margin - gap * (rows - 1)) / rows;
  let content = '';
  visible.forEach((board, index) => {
    const slotX = margin + (index % columns) * (slotWidth + gap);
    const slotY = margin + Math.floor(index / columns) * (slotHeight + gap);
    const boardWidth = Math.max(1, finite(board.width, 1200));
    const boardHeight = Math.max(1, finite(board.height, 675));
    const scale = Math.min((slotWidth - 16) / boardWidth, (slotHeight - 22) / boardHeight);
    const viewWidth = boardWidth * scale;
    const viewHeight = boardHeight * scale;
    const left = slotX + (slotWidth - viewWidth) / 2;
    const top = slotY + (slotHeight - viewHeight) / 2;
    content += `<rect x="${number(slotX)}" y="${number(slotY)}" width="${number(slotWidth)}" height="${number(slotHeight)}" rx="7" fill="#f5f6f8" stroke="#d5dae1"/>`;
    content += `<svg x="${number(left)}" y="${number(top)}" width="${number(viewWidth)}" height="${number(viewHeight)}" viewBox="0 0 ${number(boardWidth)} ${number(boardHeight)}" overflow="hidden"><rect width="100%" height="100%" fill="${safeColor(board.background, '#ffffff')}"/>`;
    const backgroundImage = safeRasterDataUri(board.backgroundImage);
    if (backgroundImage) content += `<image href="${backgroundImage}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"/>`;
    const counter = { count: 0 };
    const objects = Array.isArray(board.objects) ? board.objects : [];
    for (const object of objects) content += creativeObjectSvg(object, { width: boardWidth, height: boardHeight }, counter);
    const nodes = Array.isArray(board.nodes) ? board.nodes : [];
    for (const node of nodes) content += legacyNodeSvg(node, 0, 0, 1, 0, counter, { width: boardWidth, height: boardHeight });
    content += '</svg>';
  });
  if (boards.length > visible.length) {
    content += `<rect x="430" y="278" width="64" height="22" rx="11" fill="#344054"/><text x="462" y="293" text-anchor="middle" font-size="12" font-family="Arial,sans-serif" fill="white">+${boards.length - visible.length}</text>`;
  }
  return wrapSvg(content);
}

function renderDesignSystem(creative, documentName) {
  const data = creative.data || {};
  const title = escapeText(creative.name || documentName || 'Design System');
  const colors = Array.isArray(data.colors) ? data.colors.slice(0, 8) : [];
  const typography = Array.isArray(data.typography) ? data.typography.slice(0, 2) : [];
  let content = '<rect x="18" y="18" width="476" height="284" rx="9" fill="#ffffff" stroke="#d5dae1"/>';
  content += `<text x="40" y="58" font-size="22" font-weight="700" fill="#202938">${title}</text>`;
  if (data.description) content += svgText(data.description, 40, 78, 430, 9, '#667085');
  const swatchWidth = colors.length ? Math.min(52, 420 / colors.length) : 0;
  colors.forEach((item, index) => {
    const x = 40 + index * (swatchWidth + 6);
    content += `<rect x="${number(x)}" y="100" width="${number(swatchWidth)}" height="64" rx="5" fill="${safeColor(item.value, '#d0d5dd')}" stroke="#d5dae1"/>`;
    content += svgText(item.name, x, 178, swatchWidth, 7, '#344054');
  });
  typography.forEach((item, index) => {
    const y = 224 + index * 30;
    content += svgText(item.role || 'Type', 40, y, 80, 8, '#667085', 700);
    content += svgText(item.family || 'Typography', 128, y, 210, 15, '#202938', clamp(finite(item.weight, 500), 100, 900));
    content += svgText(`${finite(item.size, 16)} px`, 370, y, 80, 8, '#667085');
  });
  if (!colors.length && !typography.length) content += '<path d="M40 116 H460 M40 145 H420 M40 174 H440" stroke="#e4e7ec" stroke-width="6" stroke-linecap="round"/>';
  return wrapSvg(content, '#e7eaf0');
}

function renderCode(creative, documentName) {
  const data = creative.data || {};
  const file = Array.isArray(data.files) ? data.files.find(item => item?.id === data.activeFileId) || data.files[0] : null;
  const lines = String(file?.content || '').split(/\r?\n/).slice(0, 7);
  let content = '<rect x="18" y="18" width="476" height="284" rx="9" fill="#171a21" stroke="#343a46"/>';
  content += '<circle cx="38" cy="40" r="5" fill="#f06b65"/><circle cx="55" cy="40" r="5" fill="#e8b65d"/><circle cx="72" cy="40" r="5" fill="#66bd83"/>';
  content += svgText(file?.name || creative.name || documentName || 'Workspace', 94, 43, 360, 9, '#cbd5e1', 600);
  lines.forEach((line, index) => {
    content += svgText(line, 42, 82 + index * 27, 420, 10, index === 0 ? '#8cc7ff' : '#d1d5db', 400);
  });
  if (!lines.length) content += '<path d="M42 92 H340 M42 119 H420 M42 146 H300 M42 173 H380" stroke="#424a58" stroke-width="5" stroke-linecap="round"/>';
  return wrapSvg(content, '#e7eaf0');
}

export function renderCanvasThumbnailSvg(document) {
  const creative = document?.creativeWorkspace?.artifact;
  if (creative && typeof creative === 'object') {
    if (creative.type === 'page' || creative.type === 'document') return renderNativeTextDocument(creative, document.name);
    if (creative.type === 'spreadsheet') return renderSpreadsheet(creative, document.name);
    if (creative.type === 'slides') {
      const slides = Array.isArray(creative.data?.slides) ? creative.data.slides : [];
      return renderBoardCollection(slides.map(slide => ({ ...slide, width: 1200, height: 675 })), creative.name || document.name);
    }
    if (creative.type === 'design' || creative.type === 'whiteboard') {
      const boards = Array.isArray(creative.data?.artboards) ? creative.data.artboards : [];
      return renderBoardCollection(boards, creative.name || document.name);
    }
    if (creative.type === 'system') return renderDesignSystem(creative, document.name);
    if (creative.type === 'code') return renderCode(creative, document.name);
  }

  if (!Array.isArray(document?.artboards) || !document.artboards.length) return null;
  return renderBoardCollection(document.artboards, document.name || 'Canvas');
}
