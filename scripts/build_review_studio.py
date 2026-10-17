#!/usr/bin/env python3
"""
build_review_studio.py  (stdlib only; ffmpeg/ffprobe optional)

Builds REVIEW-STUDIO.html: a local capture-review page for choosing moments worth
presenting from real source recordings and exporting timecoded creative notes.
It never edits, trims or re-encodes your source footage.

  python3 build_review_studio.py --media ~/captures --out ~/captures --serve
  -> http://127.0.0.1:8795/REVIEW-STUDIO.html

Media folder contents (all optional except at least one video or image):
  *.webm *.mp4 *.mov      recordings
  *.png *.jpg *.webp      stills / extracted frames
  clips.json              [{"title","file","start","end","note"}]  named moments inside recordings
  meta.json               {"commit","qa","source","note","title"}  shown under the player

With ffmpeg present, --frames N extracts N stills per recording into <out>/frames/.
"""
import argparse, functools, html, http.server, json, os, shutil, socketserver, subprocess, sys

VIDEO = {".webm", ".mp4", ".mov", ".m4v"}
IMAGE = {".png", ".jpg", ".jpeg", ".webp"}


def probe(path):
    if not shutil.which("ffprobe"): return {}
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                            "-of", "json", path], capture_output=True, text=True, timeout=30)
        d = json.loads(r.stdout or "{}"); s = (d.get("streams") or [{}])[0]
        return {"duration": float(d.get("format", {}).get("duration") or 0), "width": s.get("width"), "height": s.get("height")}
    except Exception: return {}


def extract_frames(path, out_dir, n, duration):
    if not shutil.which("ffmpeg") or not duration or n < 1: return []
    os.makedirs(out_dir, exist_ok=True); stem = os.path.splitext(os.path.basename(path))[0]; made = []
    for i in range(n):
        t = duration * (i + 0.5) / n; name = f"{stem}-{i + 1:02d}.png"; dest = os.path.join(out_dir, name)
        r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", path, "-frames:v", "1", dest], capture_output=True, timeout=60)
        if r.returncode == 0 and os.path.exists(dest): made.append({"file": f"frames/{name}", "t": round(t, 2), "from": os.path.basename(path)})
    return made


def build_manifest(media, out, frames_n):
    files = sorted(os.listdir(media))
    vids, imgs = [], []
    for f in files:
        ext = os.path.splitext(f)[1].lower(); p = os.path.join(media, f)
        if ext in VIDEO: vids.append({"file": os.path.relpath(p, out).replace(os.sep, "/"), "name": f, "size": os.path.getsize(p), **probe(p)})
        elif ext in IMAGE: imgs.append({"file": os.path.relpath(p, out).replace(os.sep, "/"), "name": f})
    def load(n):
        p = os.path.join(media, n)
        try: return json.load(open(p))
        except Exception: return None
    clips = load("clips.json") or []
    meta = load("meta.json") or {}
    if not clips:  # one clip per recording
        clips = [{"title": os.path.splitext(v["name"])[0].replace("-", " ").replace("_", " ").title(), "file": v["file"], "start": 0, "end": v.get("duration") or 0} for v in vids]
    by_name = {v["name"]: v for v in vids}
    for c in clips:  # allow bare filenames in clips.json
        if c["file"] in by_name: c["file"] = by_name[c["file"]]["file"]
        if not c.get("end"):
            v = next((x for x in vids if x["file"] == c["file"]), {}); c["end"] = v.get("duration") or 0
    frames = []
    if frames_n:
        for v in vids: frames += extract_frames(os.path.join(out, v["file"]), os.path.join(out, "frames"), frames_n, v.get("duration"))
    frames += [{"file": i["file"], "t": None, "from": i["name"]} for i in imgs if not i["file"].startswith("frames/")]
    return {"schema": "agentsam.capture-review.v1", "title": meta.get("title", "Capture Review"), "meta": meta, "recordings": vids, "clips": clips, "frames": frames}


TEMPLATE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgentSam Capture Review</title>
<style>
:root{--bg:#f1f2f7;--card:#fff;--ink:#14142b;--mut:#5c6078;--line:#e1e3ec;--acc:#6d4aff;--accsoft:#efeaff;--ok:#0c7a43;--okbg:#e5f6ec;--dark:#14122e}
@media (prefers-color-scheme:dark){:root{--bg:#0f1017;--card:#171923;--ink:#eef0f8;--mut:#9aa0b8;--line:#2a2d3d;--accsoft:#241f45;--okbg:#10291c;--ok:#5ee09a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
header{background:var(--card);border-bottom:1px solid var(--line);padding:14px 38px;display:flex;align-items:center;gap:12px}
.logo{width:32px;height:32px;border-radius:9px;background:var(--acc);color:#fff;display:grid;place-items:center;font-weight:800}
header b{font-size:18px}header span.s{font-size:18px;color:var(--mut)}header .pill{margin-left:auto;font-size:12px;font-weight:600;color:var(--ok);background:var(--okbg);border:1px solid var(--ok);padding:5px 11px;border-radius:99px}
main{max-width:1240px;margin:0 auto;padding:30px 38px 80px}
.eyebrow{font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
h1{font-size:clamp(40px,6vw,64px);letter-spacing:-.045em;line-height:1;margin:14px 0 14px}
.lead{color:var(--mut);max-width:720px;margin:0}
.top{display:flex;gap:24px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;margin-bottom:26px}
.btn{font:inherit;font-weight:600;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:10px 16px;border-radius:9px;cursor:pointer}
.btn:hover{border-color:var(--mut)}.btn.dark{background:var(--dark);color:#fff;border-color:var(--dark)}.btn.acc{background:var(--acc);color:#fff;border-color:var(--acc)}
.btn:focus-visible,select:focus-visible,textarea:focus-visible,.clip:focus-visible,input:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
.grid{display:grid;grid-template-columns:230px minmax(0,1fr) 265px;gap:20px;align-items:start}
@media(max-width:1000px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
.clip{display:grid;grid-template-columns:30px 1fr;gap:6px;padding:12px;border-radius:10px;border:1px solid transparent;cursor:pointer;text-align:left;background:none;font:inherit;color:inherit;width:100%}
.clip .n{font:700 12px ui-monospace,Menlo,monospace;color:var(--acc)}.clip b{display:block;font-size:14.5px}.clip small{color:var(--mut);font-size:12px}
.clip.on{background:var(--accsoft);border-color:var(--acc)}.clip.done b::after{content:" ✓";color:var(--ok)}
hr{border:0;border-top:1px solid var(--line);margin:16px 0}
.ref{display:grid;grid-template-columns:34px 1fr;padding:9px 6px}.ref .k{font:700 11px ui-monospace,Menlo,monospace;color:var(--acc)}.ref small{color:var(--mut);display:block}
.stagehead{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.stagehead h2{margin:0;font-size:19px}.stagehead small{color:var(--mut)}
select,textarea,input[type=text]{font:inherit;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--ink)}
.stage{position:relative;background:#0b0b16;border-radius:10px;overflow:hidden;display:grid;place-items:center;aspect-ratio:16/10;padding:0}
.stage[data-ar="16/9"]{aspect-ratio:16/9}.stage[data-ar="4/3"]{aspect-ratio:4/3}.stage[data-ar="1/1"]{aspect-ratio:1/1}.stage[data-ar="9/16"]{aspect-ratio:9/16;max-height:640px;margin:0 auto}
.stage video{width:100%;height:100%;object-fit:contain;background:#000}
.safe{position:absolute;inset:7%;border:1px dashed rgba(255,255,255,.7);pointer-events:none;display:none}.stage.safe-on .safe{display:block}
.empty{color:#9aa0b8;padding:40px;text-align:center}
.scrub{display:block;width:100%;margin:14px 0 8px;accent-color:var(--acc)}
.ctl{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}.ctl .t{color:var(--mut);font-size:13px}
.meta{border-top:1px solid var(--line);margin:14px -18px -18px;padding:14px 18px;color:var(--mut);font-size:13px;display:flex;gap:26px;flex-wrap:wrap}
.field{margin:14px 0}.field label{display:block;font-weight:600;font-size:13.5px;margin-bottom:6px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.inout{background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px 12px;margin-top:8px;font-size:13px}
textarea{min-height:110px;resize:vertical}.status{font-size:12px;color:var(--mut);margin-top:10px}
.sec{margin-top:56px}.sec h2{font-size:clamp(28px,4vw,40px);letter-spacing:-.035em;margin:8px 0}.frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-top:20px}
.frames figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}.frames img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#0b0b16}.frames figcaption{padding:8px 12px;font-size:12px;color:var(--mut)}
</style></head><body>
<header><div class="logo">A</div><b>AgentSam</b><span class="s">/ <span id="ttl">Capture Review</span></span><span class="pill mono" id="pill"></span></header>
<main>
 <div class="top"><div><div class="eyebrow">Scene research</div><h1>Real work. Better scenes.</h1>
  <p class="lead">Watch source recordings, choose moments worth presenting, and export timecoded creative notes. Nothing here edits the source footage.</p></div>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="safe">Safe area: Off</button><button class="btn dark" id="xbrief">Export brief</button><button class="btn acc" id="xjson">Export JSON</button></div></div>
 <div class="grid">
  <aside class="card"><div class="eyebrow" id="lhead">Moments</div><div id="clips" style="margin-top:8px"></div><hr><div class="eyebrow">Originals / reference</div><div id="refs"></div></aside>
  <section class="card"><div class="stagehead"><div><h2 id="ctitle">No recordings found</h2><small id="csub" class="mono"></small></div>
    <select id="ar" style="width:auto" aria-label="Aspect ratio"><option value="16/10">Desktop 16:10</option><option value="16/9">Wide 16:9</option><option value="4/3">4:3</option><option value="1/1">Square 1:1</option><option value="9/16">Vertical 9:16</option></select></div>
   <div class="stage" id="stage" data-ar="16/10"><div class="empty" id="empty">Add .webm / .mp4 files to the media folder and rebuild.</div><video id="v" playsinline preload="metadata" hidden></video><div class="safe"></div></div>
   <input class="scrub" id="scrub" type="range" min="0" max="1000" value="0" aria-label="Seek within moment">
   <div class="ctl"><span class="t mono" id="time">00:00.00 / 00:00.00</span><span style="display:flex;gap:8px"><button class="btn" id="b-5">−5s</button><button class="btn" id="bp">Play / Pause</button><button class="btn" id="b5">+5s</button><button class="btn" id="rate">1×</button></span></div>
   <div class="meta mono" id="meta"></div></section>
  <aside class="card"><div class="eyebrow">Selection / direction</div><h2 style="margin:8px 0 4px;font-size:21px">Mark the moment.</h2><small style="color:var(--mut)">Review state stays in this browser until you export a file.</small>
   <div class="field"><label for="role">Narrative role</label><select id="role"><option>Opening hook</option><option>Product proof</option><option>Process</option><option>Detail close-up</option><option>Result</option><option>Cutaway</option></select></div>
   <div class="field"><label>Source in/out</label><div class="two"><button class="btn" id="min">Mark IN</button><button class="btn" id="mout">Mark OUT</button></div><div class="inout mono" id="inout">IN — · OUT —</div></div>
   <div class="field"><label for="note">What would you change?</label><textarea id="note" placeholder="e.g. Keep the real UI, tighten the intro, animate a state-based overlay, preserve authentic motion…"></textarea></div>
   <div class="field"><label for="world">Visual world</label><select id="world"><option>Navy product stage</option><option>Light studio</option><option>Warm paper</option><option>Clay white chapter</option><option>Dark showcase</option></select></div>
   <div class="two"><button class="btn" id="save">Save review</button><button class="btn" id="next">Next →</button></div><div class="status" id="status">No review yet.</div></aside>
 </div>
 <div class="sec" id="fsec" hidden><div class="eyebrow">Source frames</div><h2>Moments worth a second look.</h2><div class="frames" id="frames"></div></div>
</main>
<script id="manifest" type="application/json">__MANIFEST__</script>
<script>
(function(){
var M=JSON.parse(document.getElementById('manifest').textContent),$=function(i){return document.getElementById(i)};
$('ttl').textContent=M.title;document.title='AgentSam '+M.title;
if(M.meta&&M.meta.commit)$('pill').textContent='Source-verified · '+M.meta.commit;else $('pill').hidden=true;
var KEY='iam.capture-review.'+(M.title||'x'),state={};try{state=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}}
var v=$('v'),cur=0;
function f2(t){t=Math.max(0,t||0);var m=Math.floor(t/60),s=t-m*60;return String(m).padStart(2,'0')+':'+s.toFixed(2).padStart(5,'0')}
function range(c){return[c.start||0,c.end||v.duration||0]}
function renderList(){var h='';M.clips.forEach(function(c,i){var r=state[i]||{};h+='<button class="clip'+(i===cur?' on':'')+(r.saved?' done':'')+'" data-i="'+i+'"><span class="n mono">'+String(i+1).padStart(2,'0')+'</span><span><b></b><small class="mono"></small></span></button>'});
 $('clips').innerHTML=h||'<small>No moments.</small>';
 [].forEach.call($('clips').querySelectorAll('.clip'),function(b){var c=M.clips[b.dataset.i];b.querySelector('b').textContent=c.title;b.querySelector('small').textContent=f2(c.start)+'–'+f2(c.end);b.onclick=function(){select(+b.dataset.i)}});
 $('refs').innerHTML='';M.recordings.forEach(function(r){var d=document.createElement('div');d.className='ref';d.innerHTML='<span class="k mono"></span><span><b></b><small class="mono"></small></span>';d.querySelector('.k').textContent=(r.name.split('.').pop()||'').toUpperCase();d.querySelector('b').textContent=r.name;d.querySelector('small').textContent=(r.width?r.width+'×'+r.height+' · ':'')+(r.duration?f2(r.duration):'')+' · '+(r.size/1048576).toFixed(1)+' MB';$('refs').appendChild(d)});}
function select(i){cur=i;var c=M.clips[i];if(!c)return;$('ctitle').textContent=c.title;$('csub').textContent=f2(c.start)+'–'+f2(c.end)+' · '+c.file.split('.').pop().toUpperCase();
 $('empty').hidden=true;v.hidden=false;var abs=new URL(c.file,location.href).href;if(v.src!==abs){v.src=c.file}v.onloadedmetadata=function(){v.currentTime=c.start||0;tick()};if(v.readyState>0)v.currentTime=c.start||0;
 var r=state[i]||{};$('role').value=r.role||$('role').options[0].value;$('note').value=r.note||'';$('world').value=r.world||$('world').options[0].value;io();$('status').textContent=r.saved?'Saved '+new Date(r.saved).toLocaleTimeString():'No review yet.';
 $('meta').textContent='';if(M.meta){['commit','qa','source','note'].forEach(function(k){if(M.meta[k]){var s=document.createElement('span');s.textContent=(k==='qa'?'QA':k[0].toUpperCase()+k.slice(1))+': '+M.meta[k];$('meta').appendChild(s)}})}renderList();}
function tick(){var c=M.clips[cur];if(!c)return;var a=range(c),len=Math.max(.01,a[1]-a[0]);if(v.currentTime>=a[1]&&!v.paused){v.pause();v.currentTime=a[1]}
 $('scrub').value=Math.round(((v.currentTime-a[0])/len)*1000);$('time').textContent=f2(v.currentTime-a[0])+' / '+f2(len)}
v.addEventListener('timeupdate',tick);
$('scrub').oninput=function(){var a=range(M.clips[cur]);v.currentTime=a[0]+(a[1]-a[0])*this.value/1000};
$('bp').onclick=function(){if(v.paused){var a=range(M.clips[cur]);if(v.currentTime>=a[1]-.05)v.currentTime=a[0];v.play()}else v.pause()};
function seek(d){var a=range(M.clips[cur]);v.currentTime=Math.min(a[1],Math.max(a[0],v.currentTime+d))}
$('b-5').onclick=function(){seek(-5)};$('b5').onclick=function(){seek(5)};
var rates=[1,1.5,2,.5],ri=0;$('rate').onclick=function(){ri=(ri+1)%rates.length;v.playbackRate=rates[ri];this.textContent=rates[ri]+'×'};
$('ar').onchange=function(){$('stage').dataset.ar=this.value};
var safeOn=false;$('safe').onclick=function(){safeOn=!safeOn;$('stage').classList.toggle('safe-on',safeOn);this.textContent='Safe area: '+(safeOn?'On':'Off')};
function rec(){return state[cur]=state[cur]||{}}
function io(){var r=state[cur]||{};$('inout').textContent='IN '+(r.in!=null?f2(r.in):'—')+' · OUT '+(r.out!=null?f2(r.out):'—')}
$('min').onclick=function(){rec().in=v.currentTime;io()};$('mout').onclick=function(){rec().out=v.currentTime;io()};
$('save').onclick=function(){var r=rec();r.role=$('role').value;r.note=$('note').value;r.world=$('world').value;r.saved=Date.now();persist();$('status').textContent='Saved '+new Date(r.saved).toLocaleTimeString();renderList()};
$('next').onclick=function(){if(M.clips.length)select((cur+1)%M.clips.length)};
document.addEventListener('keydown',function(e){if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key===' '){e.preventDefault();$('bp').click()}else if(e.key==='i')$('min').click();else if(e.key==='o')$('mout').click();else if(e.key==='ArrowLeft')seek(-5);else if(e.key==='ArrowRight')seek(5)});
function dl(name,type,text){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:type}));a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},500)}
function reviewed(){return M.clips.map(function(c,i){var r=state[i]||{};return{index:i+1,title:c.title,file:c.file,clip:[c.start,c.end],role:r.role||null,in:r.in!=null?r.in:null,out:r.out!=null?r.out:null,world:r.world||null,note:r.note||'',reviewed:!!r.saved}})}
$('xjson').onclick=function(){dl('capture-review.json','application/json',JSON.stringify({schema:'agentsam.capture-review-notes.v1',title:M.title,meta:M.meta,exported:new Date().toISOString(),moments:reviewed()},null,2))};
$('xbrief').onclick=function(){var t='# '+M.title+' — creative brief\n\n';reviewed().forEach(function(m){t+='## '+String(m.index).padStart(2,'0')+' '+m.title+'\n- Source: '+m.file+' ('+f2(m.in!=null?m.in:m.clip[0])+' – '+f2(m.out!=null?m.out:m.clip[1])+')\n- Role: '+(m.role||'unassigned')+'\n- Visual world: '+(m.world||'unassigned')+'\n- Direction: '+(m.note||'—')+'\n\n'});dl('capture-brief.md','text/markdown',t)};
if(M.frames.length){$('fsec').hidden=false;M.frames.forEach(function(fr){var g=document.createElement('figure'),im=new Image();im.loading='lazy';im.alt='';im.src=fr.file;var cp=document.createElement('figcaption');cp.className='mono';cp.textContent=fr.from+(fr.t!=null?' · '+f2(fr.t):'');g.appendChild(im);g.appendChild(cp);$('frames').appendChild(g)})}
renderList();if(M.clips.length)select(0);
})();
</script></body></html>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--media", required=True, help="folder with recordings/stills (clips.json, meta.json optional)")
    ap.add_argument("--out", default=None, help="folder to write REVIEW-STUDIO.html into (default: --media)")
    ap.add_argument("--frames", type=int, default=0, help="extract N stills per recording with ffmpeg")
    ap.add_argument("--serve", action="store_true"); ap.add_argument("--port", type=int, default=8795)
    a = ap.parse_args()
    media = os.path.abspath(os.path.expanduser(a.media)); out = os.path.abspath(os.path.expanduser(a.out or a.media))
    if not os.path.isdir(media): sys.exit(f"media folder not found: {media}")
    os.makedirs(out, exist_ok=True)
    man = build_manifest(media, out, a.frames)
    blob = json.dumps(man).replace("</", "<\\/")
    open(os.path.join(out, "REVIEW-STUDIO.html"), "w", encoding="utf-8").write(TEMPLATE.replace("__MANIFEST__", blob))
    json.dump(man, open(os.path.join(out, "capture-manifest.json"), "w"), indent=1)
    print(f"{len(man['recordings'])} recordings, {len(man['clips'])} moments, {len(man['frames'])} stills -> {out}/REVIEW-STUDIO.html")
    if a.serve:
        h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=out)
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(("127.0.0.1", a.port), h) as s:
            print(f"serving http://127.0.0.1:{a.port}/REVIEW-STUDIO.html  (ctrl-c to stop)")
            try: s.serve_forever()
            except KeyboardInterrupt: pass


if __name__ == "__main__":
    main()
