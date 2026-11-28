import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('Files never embeds launcher widgets as a disconnected editor setup',()=>{
 const source=read('../frontend/src/components/workbench/files.tsx');
 assert.doesNotMatch(source,/<NewTabStage/);
 assert.match(source,/Connect a local workspace/);
 assert.match(source,/Open browser folder/);
});
test('Terminal keeps the shared dock and does not duplicate the safe area',()=>{
 const page=read('../frontend/agentsam/AgentSamPage.tsx');
 const shell=read('../frontend/agentsam/shell.css');
 const dock=read('../frontend/agentsam/AgentSamLaunchDock.tsx');
 assert.match(page,/!\["newtab", "files", "artifacts", "apps", "terminal"\]\.includes\(activeStage.kind\)/);
 assert.match(shell,/:not\(:has\(\[data-side-stage-kind="terminal"\] \[data-terminal-viewport\] textarea:focus\)\)/);
 assert.match(dock,/active: terminalStageActive \|\| workSurface === 'terminal'/);
 assert.match(dock,/active: !terminalStageActive && workSurface === 'chat'/);
});
test('Portable IDE uses actual container width and retains access to secondary actions',()=>{
 const source=read('../../../packages/agentsam-ide/src/surface/WorkspaceEditor.tsx');
 const css=read('../../../packages/agentsam-ide/src/surface/workspace-editor.css');
 assert.match(source,/data-compact-pane=\{compactPane\}/);
 assert.match(source,/setActive\(file.path\);setCompactPane\('editor'\)/);
 assert.match(source,/aria-label="More editor actions"/);
 assert.match(css,/@container \(max-width:720px\)/);
 assert.match(css,/\.asi-ide\[data-compact-pane=editor\] \.asi-main \.asi-aside \{ display:none;/);
 assert.doesNotMatch(css,/minmax\(130px,34%\)/);
});
