/** Deterministic stdio JSON-RPC LSP fixture for framing and lifecycle tests. */
let input=Buffer.alloc(0);
function emit(message){
  const bytes=Buffer.from(JSON.stringify(message),'utf8');
  const frame=Buffer.concat([Buffer.from('Content-Length: '+bytes.length+'\r\n\r\n'),bytes]);
  // Deliberately split a frame inside a multibyte code point.
  for(let i=0;i<frame.length;i+=3)process.stdout.write(frame.subarray(i,i+3));
}
process.stdin.on('data',chunk=>{
  input=Buffer.concat([input,chunk]);
  for(;;){
    const mark=input.indexOf('\r\n\r\n');if(mark<0)break;
    const header=input.subarray(0,mark).toString('ascii');
    const size=Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1]);
    if(!size||input.length<mark+4+size)break;
    const raw=input.subarray(mark+4,mark+4+size).toString('utf8');
    input=input.subarray(mark+4+size);
    const msg=JSON.parse(raw);
    if(msg.method==='initialize')emit({jsonrpc:'2.0',id:msg.id,result:{serverInfo:{name:'fake-lsp'},capabilities:{}}});
    else if(msg.method==='test/unicode')emit({jsonrpc:'2.0',id:msg.id,result:{text:'λ © 🌍',ok:true}});
    else if(msg.method==='test/shutdown')process.exit(0);
    else if(msg.id!==undefined)emit({jsonrpc:'2.0',id:msg.id,result:null});
  }
});
