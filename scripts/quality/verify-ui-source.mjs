#!/usr/bin/env node
/**
 * Incremental UI source gate. Only checks newly-added code and touched TSX
 * elements to avoid falsifying a claim that the entire historical CMS is AA.
 * Shared by generated/native/theme/app CI; never alters source files.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import process from 'node:process';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'../..');
const base=process.env.UI_QUALITY_BASE || 'origin/main';
try {execFileSync('git',['rev-parse','--verify',base],{cwd:root,stdio:'pipe'});}
catch {throw new Error('UI quality baseline '+base+' missing: fetch the base branch before running; never pass with zero inspected changes.');}
const argv=process.argv.slice(2);
const paths=argv.length?argv:['packages/agentsam-settings/src/frontend/index.tsx'];
const violations=[];
let scanned=0;
const findChangedLines=(file)=>{
  let diff='';
  diff=execFileSync('git',['diff','--unified=0',base,'--',file],{cwd:root,encoding:'utf8'});
  const lines=new Set();
  let current=0;
  for(const line of diff.split('\n')){
    const header=/^@@ .* \+(\d+)(?:,(\d+))? @@/.exec(line);
    if(header){current=Number(header[1]);continue;}
    if(line.startsWith('+++')||line.startsWith('---'))continue;
    if(line.startsWith('+')){lines.add(current++);continue;}
    if(line.startsWith(' '))current++;
  }
  return lines;
};
const isStaticValue=exp=>exp && (ts.isStringLiteral(exp)||ts.isNumericLiteral(exp)||exp.kind===ts.SyntaxKind.TrueKeyword||exp.kind===ts.SyntaxKind.FalseKeyword);
const hasText=el=>{
  const visit=child=>ts.isJsxText(child)?Boolean(child.text.trim())
    :ts.isJsxExpression(child)?Boolean(child.expression)
    :ts.isJsxElement(child)?child.children.some(visit):false;
  return el.children.some(visit);
};
for(const file of paths){
  const full=resolve(root,file);if(!existsSync(full)||!(/\.tsx?$/.test(file)))continue;
  const input=readFileSync(full,'utf8');
  const added=findChangedLines(file);
  const parsed=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const lineOf=node=>parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line+1;
  const report=(node,rule,detail)=>violations.push({file,line:lineOf(node),rule,detail});
  function visit(node){
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
      const line=lineOf(node);
      if(added.has(line)){
        scanned++;
        const name=node.tagName.getText(parsed).toLowerCase();
        const attrs=node.attributes.properties.filter(ts.isJsxAttribute);
        const has=a=>attrs.some(x=>x.name.getText(parsed)===a);
        if(name==='img'&&!has('alt'))report(node,'image_alternatives','Images require alt, even if empty for decorative media');
        const inline=attrs.find(x=>x.name.getText(parsed)==='style');
        if(inline && inline.initializer && ts.isJsxExpression(inline.initializer) &&
          inline.initializer.expression && ts.isObjectLiteralExpression(inline.initializer.expression) &&
          inline.initializer.expression.properties.length &&
          inline.initializer.expression.properties.every(prop=>ts.isPropertyAssignment(prop)&&isStaticValue(prop.initializer)))
          report(node,'style_authority','Static inline style must move to tokens or utility classes');
        if(name==='button'&&!has('aria-label')&&!has('aria-labelledby')&&!has('title')){
          const parent=node.parent;
          if(ts.isJsxSelfClosingElement(node)||ts.isJsxElement(parent)&&!hasText(parent))
            report(node,'accessibility_names','Icon-only button requires an accessible name');
        }
        if(['input','textarea','select'].includes(name)&&!has('aria-label')&&!has('aria-labelledby')&&!has('id')){
          let ancestor=node.parent;let isLabeled=false;
          for(let i=0;i<8&&ancestor;i++,ancestor=ancestor.parent){
            if(ts.isJsxElement(ancestor)&&ancestor.openingElement.tagName.getText(parsed)==='label'){isLabeled=true;break;}
          }
          if(!isLabeled)report(node,'accessibility_names','Form control lacks label association');
        }
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(parsed);
}
console.log(JSON.stringify({gate:'agentsam.ui-quality.source.v1',base,scanned,violations},null,2));
if(violations.length)process.exitCode=1;
