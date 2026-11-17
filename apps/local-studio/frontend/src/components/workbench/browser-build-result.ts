/** A browser Build result is only a preview when the model actually produced a complete HTML page. */
export function extractRunnableHtml(message: string): string | null {
  const candidates = [...message.matchAll(/```(?:html|htm)?\s*\n([\s\S]*?)```/gi)].map(match => match[1].trim());
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(message)) candidates.push(message.trim());
  const source = candidates.find(candidate => /(?:<!doctype\s+html|<html\b)/i.test(candidate) && /<body\b/i.test(candidate) && /<\/html\s*>/i.test(candidate));
  return source && source.length <= 350_000 ? source : null;
}
export function buildBrowserInstruction(prompt: string, previousHtml?: string | null): string {
  const task = prompt.trim().slice(0,10_000);
  const continuation = previousHtml ? '\nYou are editing this current browser preview. Preserve working functionality and regenerate a COMPLETE replacement page:\n```html\n' + previousHtml.slice(0,16_000) + '\n```\n' : '';
  return [
    'Build a functioning interactive webpage in the AgentSam Browser for this request:', task, continuation,
    'Return exactly one complete self-contained runnable HTML document inside a ```html code fence.',
    'Include semantic structure, responsive styling and working client-side interactions where appropriate. Do not output commentary instead of the document.',
    'Do not include private account information, passwords, API tokens, untrusted remote scripts or remote dependencies.',
  ].filter(Boolean).join('\n\n');
}


/** An opaque-origin preview cooperates with the host annotator via bounded postMessage data. */
export function withBrowserAnnotationBridge(html: string): string {
  const script = `<script>(function(){
  var enabled=false,last=0;
  function send(type,element){
    var el=element&&element.closest&& (element.closest('button,a,img,input,textarea,select,label,h1,h2,h3,h4,p,li,article,section,[role="button"],[data-annotation-target]')||element);
    if(!el)return;
    var r=el.getBoundingClientRect(),field=el.matches('input,textarea,select,[contenteditable="true"]');
    var clean=function(v,n){return String(v||'').replace(/\\s+/g,' ').trim().slice(0,n)};
    parent.postMessage({source:'agentsam-browser',type:type,selection:{tag:el.tagName.toLowerCase(),label:clean(el.getAttribute('aria-label')||el.getAttribute('alt')||(field?'Input field':el.textContent),180),text:field?'[field value withheld]':clean(el.textContent,300),rect:{left:r.left,top:r.top,width:r.width,height:r.height},url:location.href}},'*');
  }
  addEventListener('message',function(e){if(e.source===parent&&e.data&&e.data.source==='agentsam-host'&&e.data.type==='annotation-mode')enabled=e.data.enabled===true});
  addEventListener('pointermove',function(e){if(!enabled||Date.now()-last<70)return;last=Date.now();send('annotation-hover',e.target)},true);
  addEventListener('click',function(e){if(!enabled)return;e.preventDefault();e.stopImmediatePropagation();send('annotation-selection',e.target)},true);
})();</script>`;
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${script}</body>`) : `${html}${script}`;
}
