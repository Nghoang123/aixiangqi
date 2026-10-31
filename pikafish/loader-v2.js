/* Pikafish isolated WASM loader: 20261031-fix2 */
/*
 * Pikafish browser UCI worker.
 * Source: https://github.com/brianhliou/pikafish-wasm/blob/main/worker.js
 * Distributed as part of Pikafish WASM GPLv3; see upstream LICENSE.
 * This local copy retains the upstream worker init/UCI command protocol.
 */
let command = null;
let runtimeInitializationStarted = false;

async function fetchNet(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`net fetch failed: ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    self.postMessage({type:'net-progress',loaded,total});
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  return bytes;
}
self.addEventListener('message', async (event) => {
  const message = event.data;
  if (message?.type === 'init') {
    // One engine runtime per dedicated Worker; never importScripts twice.
    if (runtimeInitializationStarted) return;
    runtimeInitializationStarted = true;
    try {
      if (!message.jsUrl || !message.wasmUrl) throw new Error('Thiếu URL engine Pikafish');
      const netPromise = fetchNet(message.netUrl);
      importScripts(message.jsUrl);
      const factory = self.Pikafish;
      if (typeof self.pikafishEngine !== 'undefined') self.postMessage({type:'stderr',line:'Phát hiện script khác khai báo pikafishEngine; kiểm tra cache và đường dẫn.'});
      if (typeof factory !== 'function') throw new Error('Pikafish factory missing after script load');
      const module = await factory({
        locateFile: file => file.endsWith('.wasm') ? message.wasmUrl : file,
        mainScriptUrlOrBlob: message.jsUrl,
        print: line => self.postMessage({type:'line',line:String(line)}),
        printErr: line => self.postMessage({type:'stderr',line:String(line)})
      });
      const net = await netPromise;
      module.FS.writeFile('/pikafish.nnue',net);
      self.postMessage({type:'net-written',bytes:net.byteLength});
      const initialize = module.cwrap('pikafish_initialize',null,[]);
      command = module.cwrap('pikafish_command',null,['string']);
      initialize();
      self.postMessage({type:'ready'});
    } catch (error) {
      self.postMessage({type:'error',error:error instanceof Error ? error.message : String(error)});
    }
    return;
  }
  if (message?.type === 'command' && typeof message.command === 'string') {
    if (!command) { self.postMessage({type:'error',error:'Pikafish worker is not ready'}); return; }
    command(message.command);
  }
});
