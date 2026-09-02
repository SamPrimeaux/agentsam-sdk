import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const templateRoot = fileURLToPath(new URL('../../../templates/mini/', import.meta.url));
export const MINI_TEMPLATES = Object.freeze({
  gadget: 'A working focus timer',
  page: 'A small editable landing page',
  data: 'A searchable JSON viewer',
});

export function createMini({ name, template = 'gadget', cwd = process.cwd() }) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name || '')) {
    throw new Error('Use a name of 1–64 lowercase letters, numbers, or hyphens, starting with a letter or number.');
  }
  if (!Object.hasOwn(MINI_TEMPLATES, template)) throw new Error(`Unknown template: ${template}`);
  const root = path.resolve(cwd, name);
  // Load everything first; a missing packaged template must not leave a partial project.
  const files = ['index.html', 'app.js', 'style.css'].map((file) => ({
    file,
    content: fs.readFileSync(path.join(templateRoot, file === 'style.css' ? 'shared' : template, file), 'utf8')
      .replaceAll('{{NAME}}', name),
  }));
  fs.mkdirSync(root); // Exclusive: never overwrite an existing project or symlink.
  try {
    fs.mkdirSync(path.join(root, 'public'));
    for (const { file, content } of files) fs.writeFileSync(path.join(root, 'public', file), content);
    fs.writeFileSync(path.join(root, 'mini.json'), JSON.stringify({ kind: 'agentsam-mini', version: 1, name, template }, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'README.md'), `# ${name}\n\nAn AgentSam mini using the ${template} starter.\n\nEdit public/index.html, public/style.css, and public/app.js, then refresh the browser.\n\nFrom this folder, run:\n\n\`\`\`bash\nagentsam mini preview .\n\`\`\`\n\nThe preview stays in the foreground on 127.0.0.1, closes after 20 minutes, and stops with Ctrl+C. Use --timeout <seconds> to change the lifetime. Files remain when the preview stops. Only public/ is served.\n\nNo install step is needed. To share later, public/ is a plain static site; publishing is separate.\n`);
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  return { root, name, template };
}
