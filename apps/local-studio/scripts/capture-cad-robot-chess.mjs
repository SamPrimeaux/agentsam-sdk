/**
 * Labelled, reproducible CAD Robotics chess visual QA capture.
 * Run: node scripts/capture-cad-robot-chess.mjs http://127.0.0.1:5199/?presentation=embedded
 * Produces a screenshot, unedited QA video and evidence.json. No staged/mock results.
 */
import { chromium } from 'playwright';
import { mkdir, rename, writeFile, access, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2] || 'http://127.0.0.1:5199/?presentation=embedded';
const target = new URL(input);
if (!['localhost','127.0.0.1','agentsam.inneranimalmedia.com'].includes(target.hostname)) {
  throw new Error('capture_host_not_allowlisted');
}
const shotId = 'CAD-ROBOTICS-CHESS-01';
const MAX_CLIP_SECONDS = 25; // strictly below 30 s, including encoder rounding
const MEDIA_VERSION = 'agentsam.capture.v2';
const safeSlug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const startedAt = new Date().toISOString();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let revision = 'unknown';
try { revision = execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim(); } catch {}
const captureRoot = process.env.AGENTSAM_CAPTURE_DIR || path.join(homedir(), 'Downloads', 'AgentSamEvidence', 'robot-chess');
// Each source-identified take has its own directory; never overwrite another recording.
const out = path.join(captureRoot, startedAt.replace(/[:.]/g,'-') + '--' + revision.slice(0,12));
await mkdir(path.join(out,'raw'), { recursive: true });
const errors = [];
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
  recordVideo: { dir: path.join(out,'raw'), size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.on('pageerror', error => errors.push('page: ' + error.message));
page.on('requestfailed', request => errors.push(
  'network: ' + new URL(request.url()).pathname + ' ' + request.failure()?.errorText
));
page.on('response', response => {
  if (response.status() >= 400 && response.url().includes('/chess/baroque/')) {
    errors.push('model_http_' + response.status() + ': ' + new URL(response.url()).pathname);
  }
});
let hudVisible = false, originalsLoaded = false, loadingState = '';
let loadedAtSeconds = null, playedAtSeconds = null, repliedAtSeconds = null, chessMoveVerified = false;
const fallbackScreenshots = [];
let initialScreenshotCreated = false, replyScreenshotCreated = false;
const monotonicStart = Date.now();
try {
  await page.goto(target.href, { waitUntil: 'load', timeout: 30000 });
  const workspace = page.locator('#cad-creator-header nav button').filter({ hasText: 'Robotics' });
  await workspace.waitFor({ timeout: 15000 });
  await workspace.click();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(4000);
    hudVisible = await page.getByTestId('robot-chess-hud').count() > 0;
    loadingState = hudVisible
      ? await page.getByTestId('baroque-load-status').innerText()
      : 'MuJoCo simulation loading';
    if (i % 5 === 0) console.log(shotId, 'elapsed=' + (i + 1) * 4, loadingState);
    if (loadingState.includes('Original Baroque models loaded')) { originalsLoaded = true; loadedAtSeconds=(Date.now()-monotonicStart)/1000; break; }
    if (loadingState.includes('Original models unavailable')) break;
  }
  const screenshot = shotId + '--desktop-1440x900--' + (originalsLoaded ? 'original-glbs' : 'blocked') + '.png';
  try {
    await page.screenshot({ path: path.join(out, screenshot), timeout: 10000, animations: 'disabled' });
    initialScreenshotCreated = true;
  } catch (error) {
    errors.push('screenshot: initial: ' + String(error));
    // A stalled renderer snapshot must not prevent the actual chess move test.
  }
  if (originalsLoaded) {
    // Same projection parameters as the existing MuJoCo chess scene. Interact
    // through actual canvas pointer events, not a fake chess state injector.
    const require = createRequire(new URL('../../cad-creator/frontend/package.json', import.meta.url));
    const THREE = require('three');
    const bounds = await page.locator('canvas:visible').last().boundingBox();
    if (!bounds) throw new Error('chess_canvas_not_visible');
    const camera = new THREE.PerspectiveCamera(45, bounds.width / bounds.height, 0.1, 1000);
    camera.up.set(0, 0, 1);
    camera.position.set(0.82, 1.12, 0.85);
    camera.lookAt(0, 0.31, 0.15);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const squarePixel = square => {
      const file = square.charCodeAt(0) - 97, rank = Number(square[1]);
      const world = new THREE.Vector3(
        (file - 3.5) * 0.05715, 0.18 + (8-rank) * 0.05715, 0.034,
      ).project(camera);
      return { x: bounds.x + (world.x+1)*bounds.width/2,
        y: bounds.y + (1-world.y)*bounds.height/2 };
    };
    const a = squarePixel('e2');
    await page.mouse.click(a.x, a.y);
    await page.getByTestId('robot-chess-hud').getByText(/Selected e2/).waitFor({ timeout: 5000 });
    playedAtSeconds = (Date.now()-monotonicStart)/1000;
    const b = squarePixel('e4');
    await page.mouse.click(b.x, b.y);
    await page.getByTestId('robot-chess-hud').getByText(/2 half-moves/).waitFor({ timeout: 12000 });
    repliedAtSeconds = (Date.now()-monotonicStart)/1000;
    await page.waitForTimeout(2500);
    chessMoveVerified = true;
    try {
      await page.screenshot({ path: path.join(out, shotId+'--desktop-1440x900--e2-e4-franka-reply.png'), timeout: 10000, animations: 'disabled' });
      replyScreenshotCreated = true;
    } catch (error) { errors.push('screenshot: reply: ' + String(error)); }
  }
} catch (error) {
  errors.push('capture: ' + String(error));
} finally {
  const originalVideo = await page.video()?.path();
  await context.close();
  await browser.close();
  if (originalVideo) await rename(originalVideo, path.join(out,'raw',shotId + '--full-unedited-qa.webm'));
}
// Slice raw QA into editor-ready, continuously time-coded clips. Do not substitute
// artificial frames or claim the clipping operation is a runtime verification.
const clipBase = safeSlug(shotId);
const clipDate = startedAt.slice(0,10).replace(/-/g,'');
const rawVideo = path.join(out,'raw',shotId + '--full-unedited-qa.webm');
const clips = [];
let clipFailure = null;
try {
  await access(rawVideo);
  const ffmpeg = process.env.AGENTSAM_FFMPEG || path.join(homedir(),'Library','Caches','ms-playwright','ffmpeg-1011','ffmpeg-mac');
  const probe = (() => {
    try {execFileSync(ffmpeg,['-hide_banner','-i',rawVideo],{encoding:'utf8',stdio:['ignore','pipe','pipe']}); return '';}
    catch(error) { return String(error.stderr || ''); }
  })();
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(probe);
  if (!match) throw new Error('recorded_video_duration_unavailable');
  const duration = Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
  for (let start=0, index=1; start<duration-0.15; start+=MAX_CLIP_SECONDS,index++) {
    const length = Math.min(MAX_CLIP_SECONDS,duration-start);
    const step = playedAtSeconds !== null && start >= playedAtSeconds ? 'chess-play'
      : loadedAtSeconds!==null && start >= loadedAtSeconds ? 'board-ready'
      : start < 15 ? 'sim-initializing' : 'asset-loading';
    const name = 'CAD--ROBOT-CHESS--' + String(index).padStart(2,'0') + '--' + step +
      '--' + clipDate + '--' + revision.slice(0,12) + '--desktop-1440x900.webm';
    const args=['-hide_banner','-loglevel','error','-y','-ss',String(start),'-t',String(length),
      '-i',rawVideo,'-an','-c:v','libvpx','-deadline','realtime','-cpu-used','6',
      '-b:v','1350k','-f','webm',path.join(out,name)];
    execFileSync(ffmpeg,args,{encoding:'utf8',timeout:180000});
    const bytes=(await stat(path.join(out,name))).size;
    if(bytes===0) throw new Error('empty_clip:'+name);
    clips.push({ id:clipBase+'-'+String(index).padStart(2,'0'),filename:name,
      index,start_seconds:start,end_seconds:Math.min(duration,start+length),
      duration_seconds:length,step,source_id:shotId,source_file:'raw/'+shotId+'--full-unedited-qa.webm',
      kind:'unedited_qa_segment',size_bytes:bytes });
  }
  // A WebGL-heavy Chromium page can time out on page.screenshot even while
  // video recording succeeds. Extract actual video frames (never fabricated
  // stills) and label their recorded source/time in the evidence receipt.
  const extractFrame = async (second, filename, kind) => {
    const time = Math.max(0.1, Math.min(duration - 0.1, second));
    execFileSync(ffmpeg, ['-hide_banner','-loglevel','error','-y',
      '-i',rawVideo,'-ss',String(time),'-frames:v','1',path.join(out,filename)],
    {encoding:'utf8',timeout:30000});
    if ((await stat(path.join(out,filename))).size===0) throw new Error('empty_recorded_frame');
    fallbackScreenshots.push({filename,second:time,kind,source_file:'raw/'+shotId+'--full-unedited-qa.webm'});
  };
  if (!initialScreenshotCreated && originalsLoaded && loadedAtSeconds!==null) {
    try {
      await extractFrame(loadedAtSeconds + 1,
        shotId + '--desktop-1440x900--original-glbs.png', 'recorded_board_frame');
      initialScreenshotCreated = true;
    } catch(error) {errors.push('frame_extract: initial: '+String(error));}
  }
  if (!replyScreenshotCreated && chessMoveVerified && repliedAtSeconds!==null) {
    try {
      await extractFrame(repliedAtSeconds + 0.5,
        shotId + '--desktop-1440x900--e2-e4-franka-reply.png', 'recorded_chess_reply_frame');
      replyScreenshotCreated = true;
    } catch(error) {errors.push('frame_extract: reply: '+String(error));}
  }
} catch(error) {clipFailure=String(error);}
const evidence = {
  schema: MEDIA_VERSION, shot_id: shotId, started_at: startedAt,
  source_route: target.pathname, source_commit: revision,
  viewport: '1440x900', mode: 'unedited segmented QA footage',
  checks: { chess_hud_visible: hudVisible, original_baroque_glbs_loaded: originalsLoaded, e2_e4_franka_response: chessMoveVerified },
  status: originalsLoaded && chessMoveVerified && !errors.some(e => e.startsWith('page:')) ? 'visual_chess_journey_verified' : 'blocked',
  loading_state: loadingState, errors, clip_error: clipFailure, max_clip_seconds: MAX_CLIP_SECONDS,
  screenshot_fallbacks: fallbackScreenshots,
  artifacts: clips.map(clip=>clip.filename).concat([
    ...(initialScreenshotCreated ? [shotId + '--desktop-1440x900--' + (originalsLoaded ? 'original-glbs' : 'blocked') + '.png'] : []),
    ...(replyScreenshotCreated ? [shotId+'--desktop-1440x900--e2-e4-franka-reply.png'] : []),
  ]),
  clips, full_raw_media: 'raw/'+shotId+'--full-unedited-qa.webm',
  disclosure: 'Simulation only; no verified grasp or physical robot',
};
await writeFile(path.join(out, shotId + '--evidence.json'), JSON.stringify(evidence,null,2) + '\n');
await writeFile(path.join(out, 'manifest.json'), JSON.stringify({schema:MEDIA_VERSION,source:shotId,clips:clips.map(({id,filename,index,start_seconds,end_seconds,duration_seconds,step,source_file})=>({id,filename,index,start_seconds,end_seconds,duration_seconds,step,source_file})),commit:revision,status:evidence.status},null,2)+'\n');
console.log(JSON.stringify({ output:out, evidence },null,2));
if (evidence.status === 'blocked' || clipFailure || !clips.length) process.exitCode = 1;
