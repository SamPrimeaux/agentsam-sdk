import ts from 'typescript';

/** Fast source checks. Rendered accessibility and responsive checks remain separate. */
export function auditUiSource(source, file) {
  if (/\.html?$/i.test(file)) {
    const issues = [];
    source.split(/\r?\n/).forEach((line, index) => {
      for (const tag of line.match(/<img\b[^>]*>/gi) ?? []) {
        if (!/\balt\s*=/i.test(tag)) issues.push({
          file, line: index + 1, rule: 'image-alt',
          message: 'Images require alt text, or alt="" when decorative.',
        });
      }
      if (/\bstyle\s*=\s*["']/i.test(line)) issues.push({
        file, line: index + 1, rule: 'inline-static-style',
        message: 'Use a class and stylesheet, not inline styles.',
      });
    });
    return issues;
  }
  if (!/\.(tsx|jsx)$/i.test(file)) return [];
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    /\.tsx$/i.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
  const issues = [];
  const add = (node, rule, message) => issues.push({
    file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
    endLine: sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
    rule, message,
  });
  const attribute = (node, name) => node.attributes?.properties.find((p) =>
    ts.isJsxAttribute(p) && p.name.getText(sf) === name);
  const hasContent = (node) => {
    if (!ts.isJsxOpeningElement(node)) return false;
    return node.parent.children.some((child) => {
      if (ts.isJsxText(child)) return child.text.trim().length > 0;
      if (ts.isJsxExpression(child)) return !!child.expression;
      if (ts.isJsxElement(child)) return child.children.some((grandchild) =>
        (ts.isJsxText(grandchild) && !!grandchild.text.trim()) ||
        (ts.isJsxExpression(grandchild) && !!grandchild.expression));
      return false;
    });
  };
  const hasTooltipAncestor = (node) => {
    let parent = node.parent;
    while (parent) {
      if (ts.isJsxElement(parent) &&
          ['Tooltip', 'TooltipTrigger'].includes(parent.openingElement.tagName.getText(sf))) return true;
      parent = parent.parent;
    }
    return false;
  };
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      const name = tag.toLowerCase();
      if (name === 'img' && !attribute(node, 'alt')) add(node, 'image-alt',
        'Images require alt text, or alt="" when decorative.');
      if (name === 'button' || tag === 'Button') {
        const iconOnly = !hasContent(node);
        const named = !!(attribute(node, 'aria-label') || attribute(node, 'aria-labelledby'));
        if (iconOnly && !named) add(node, 'control-name',
          'Icon-only buttons require aria-label or aria-labelledby.');
        else if (iconOnly && !hasTooltipAncestor(node)) add(node, 'icon-helper',
          'Icon-only buttons require a focus-visible tooltip/help wrapper or the IconAction primitive.');
      }
      if ((name === 'div' || name === 'span') && attribute(node, 'onClick') &&
          (!attribute(node, 'role') || !attribute(node, 'tabIndex') ||
           !attribute(node, 'onKeyDown'))) add(node, 'nonsemantic-action',
        'Use a button or link, or provide role, tabIndex, and keyboard handling.');
      const style = attribute(node, 'style');
      if (style) {
        const init = style.initializer;
        let expression = init && ts.isJsxExpression(init) ? init.expression : null;
        while (expression && (ts.isAsExpression(expression) ||
          ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression))) {
          expression = expression.expression;
        }
        const object = expression && ts.isObjectLiteralExpression(expression) ? expression : null;
        const allVars = object && object.properties.length > 0 &&
          object.properties.every((prop) =>
            ts.isPropertyAssignment(prop) && /^--/.test(prop.name.getText(sf).replace(/^["']|["']$/g, '')));
        if (!allVars) add(node, 'inline-style',
          'Use utility classes or packaged CSS; only CSS custom-property runtime bindings are exempt.');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return issues;
}
