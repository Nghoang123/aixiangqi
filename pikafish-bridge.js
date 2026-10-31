/* Pikafish isolated worker: corrected upload 20261031 */
/*
 * Pikafish -> giao thức engine-worker.js của web Cờ Tướng AI.
 * Chạy trong 1 Worker; Pikafish đa luồng ở Worker con.
 * Tương thích: init_worker, clear_cache, stop_ponder, start_ponder,
 *              {board,currentAISide,uciMoves,difficulty,isHint}.
 * Không chạy cả Pikafish và AI JS cùng lúc.
 */
'use strict';

const ROOT_URL = new URL('./', self.location.href);
const PIKA_URL = new URL('./pikafish/', ROOT_URL);
const FILES = 'abcdefghi';
const MOVETIME_BY_LEVEL = [500, 700, 1100, 1700, 2500, 3500];
let initialized = false;
let pikafish = null;
let fallback = null;
let pikafishReady = false;
let didUci = false;
let active = null;
let pending = null;
let generation = 0;
let needNewGame = true;
let startupTimer = 0;
let searchTimer = 0;
let engineThreads = Math.max(1, Math.min(4, (self.navigator && self.navigator.hardwareConcurrency || 2) - 1));

function status(state, message, engine = 'Pikafish') {
  self.postMessage({ engineStatus: {state, message, engine} });
}
function uci(text) {
  if (pikafish) pikafish.postMessage({ type: 'command', command: text });
}
function parseMove(moveText) {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(moveText)) return null;
  const fr = 9 - Number(moveText[1]), fc = FILES.indexOf(moveText[0]);
  const tr = 9 - Number(moveText[3]), tc = FILES.indexOf(moveText[2]);
  return {fr, fc, tr, tc};
}
function boardToFEN(board, redToMove) {
  if (!Array.isArray(board) || board.length !== 10) throw new Error('Bàn cờ không đủ 10 hàng');
  const rows = board.map(row => {
    if (!Array.isArray(row) || row.length !== 9) throw new Error('Bàn cờ không đủ 9 cột');
    let s = '', empty = 0;
    for (const p of row) {
      if (!p) { empty++; continue; }
      if (empty) { s += empty; empty = 0; }
      if (!/^[RNBAKCP rnbakcp]$/.test(p) || p.length !== 1 || p === ' ') {
        throw new Error('Quân cờ không hợp lệ: ' + p);
      }
      s += p;
    }
    if (empty) s += empty;
    return s;
  });
  return rows.join('/') + (redToMove ? ' w' : ' b') + ' - - 0 1';
}
function positionCommand(data) {
  // Ưu tiên startpos+moves để Pikafish có đầy đủ lịch sử, bắt lặp nước.
  if (Array.isArray(data.uciMoves) && data.uciMoves.every(m => /^[a-i][0-9][a-i][0-9]$/.test(m))) {
    return 'position startpos' + (data.uciMoves.length ? ' moves ' + data.uciMoves.join(' ') : '');
  }
  return 'position fen ' + boardToFEN(data.board, Boolean(data.currentAISide));
}
function startJob(data) {
  if (!pikafishReady) { pending = data; return; }
  if (active) {
    pending = data;
    active.cancelled = true;
    uci('stop');
    return;
  }
  if (needNewGame) {
    uci('ucinewgame');
    needNewGame = false;
  }
  let position;
  try { position = positionCommand(data); }
  catch (e) { useFallback('Không tạo được vị trí UCI: ' + e.message); return; }

  const level = Math.min(6, Math.max(1, Number(data.difficulty) || 6));
  const movetime = data.isHint ? 1800 : MOVETIME_BY_LEVEL[level - 1];
  active = {
    payload: data,
    cancelled: false,
    generation,
    start: performance.now(),
    depth: 0,
    nodes: 0,
    score: 0,
    pv: [],
  };
  uci(position);
  uci('go movetime ' + movetime);
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (active && !active.cancelled) useFallback('Pikafish không trả bestmove đúng thời hạn.');
  }, Math.max(20000, movetime * 6));
}
function onInfo(line) {
  if (!active || active.cancelled) return;
  const depth = /\bdepth (\d+)/.exec(line);
  const nodes = /\bnodes (\d+)/.exec(line);
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  const pv = /\bpv ((?:[a-i][0-9][a-i][0-9](?:\s+|$))+)/.exec(line);
  if (depth) active.depth = Number(depth[1]);
  if (nodes) active.nodes = Number(nodes[1]);
  if (score) active.score = score[1] === 'mate' ? (Number(score[2]) > 0 ? 20000 : -20000) : Number(score[2]);
  if (pv) active.pv = pv[1].trim().split(/\s+/).map(parseMove).filter(Boolean).slice(0, 12);
}
function onBestmove(line) {
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = 0; }
  const job = active;
  active = null;
  if (job && !job.cancelled && job.generation === generation) {
    const match = /^bestmove\s+([a-i][0-9][a-i][0-9]|\(none\)|0000)/.exec(line);
    const move = match ? parseMove(match[1]) : null;
    const sideRed = Boolean(job.payload.currentAISide);
    const timeMs = Math.max(1, performance.now() - job.start);
    self.postMessage({ result: {
      move,
      score: sideRed ? job.score : -job.score, // giao diện hiện tại hiển thị theo phía Đỏ
      nodes: job.nodes,
      depth: job.depth,
      pv: job.pv,
      timeMs,
      isHint: Boolean(job.payload.isHint),
      ponderHit: false
    }});
  }
  if (pending) {
    const next = pending; pending = null;
    startJob(next);
  }
}
function useFallback(reason) {
  if (fallback) return;
  if (startupTimer) { clearTimeout(startupTimer); startupTimer = 0; }
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = 0; }
  // Nếu Pikafish bị lỗi trong khi suy nghĩ, chuyển job chưa trả lời sang AI JS.
  const unfinished = pending || (active && !active.cancelled ? active.payload : null);
  active = null;
  pending = null;
  pikafishReady = false;
  if (pikafish) { pikafish.terminate(); pikafish = null; }
  status('fallback', reason, 'AI JavaScript');
  startFallbackWorker();
  if (unfinished && fallback) fallback.postMessage(unfinished);
}
function startFallbackWorker() {
  if (fallback) { fallback.terminate(); fallback = null; }
  try {
    const w = new Worker(new URL('./engine-worker.js', ROOT_URL).href);
    fallback = w;
    w.onmessage = (e) => { if (fallback === w) self.postMessage(e.data); };
    w.onerror = (e) => { if (fallback === w) self.postMessage({error:'AI JS dự phòng lỗi: '+(e.message || 'không rõ')}); };
  } catch (e) {
    self.postMessage({error:'Không khởi động được AI JS dự phòng: '+e.message});
  }
}
function pikafishMessage(event) {
  const msg = event.data || {};
  if (msg.type === 'net-progress') {
    const loaded = (msg.loaded / (1024 * 1024)).toFixed(1);
    const total = msg.total ? ' / ' + (msg.total / (1024 * 1024)).toFixed(1) : '';
    status('loading', `Đang tải mạng NNUE ${loaded}${total} MB`);
    return;
  }
  if (msg.type === 'net-written') {
    status('loading', 'Đã tải NNUE, đang khởi tạo engine...');
    return;
  }
  if (msg.type === 'error') {
    useFallback('Pikafish WASM: ' + msg.error);
    return;
  }
  if (msg.type === 'stderr') {
    if (/abort|fatal|failed|exception/i.test(msg.line || '')) useFallback('Pikafish: ' + msg.line);
    return;
  }
  if (msg.type === 'ready') {
    uci('uci');
    return;
  }
  if (msg.type !== 'line') return;
  const line = String(msg.line || '').trim();
  if (/CRITICAL ERROR/i.test(line)) { useFallback(line); return; }
  if (line === 'uciok' && !didUci) {
    didUci = true;
    uci('setoption name Threads value ' + engineThreads);
    uci('setoption name Hash value 64');
    uci('isready');
  } else if (line === 'readyok' && !pikafishReady) {
    if (startupTimer) {clearTimeout(startupTimer);startupTimer=0;}
    pikafishReady = true;
    status('ready', `Pikafish NNUE sẵn sàng (${engineThreads} luồng)`);
    if (pending) { const next = pending; pending = null; startJob(next); }
  } else if (line.startsWith('info ')) {
    onInfo(line);
  } else if (line.startsWith('bestmove ')) {
    onBestmove(line);
  }
}
function init() {
  if (initialized) return;
  initialized = true;
  if (!self.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    useFallback('Máy chủ thiếu COOP/COEP (crossOriginIsolated=false), không chạy được bản Pikafish pthreads.');
    return;
  }
  status('loading', 'Đang khởi tạo Pikafish WASM/NNUE...');
  try {
    pikafish = new Worker(new URL('./loader-v2.js', PIKA_URL).href);
    pikafish.onmessage = pikafishMessage;
    pikafish.onerror = (e) => useFallback('Không tải được pikafish/loader-v2.js: ' + (e.message || 'lỗi Worker'));
    pikafish.postMessage({
      type:'init',
      jsUrl: new URL('./pikafish-runtime-v2.js', PIKA_URL).href,
      wasmUrl: new URL('./pikafish.wasm', PIKA_URL).href,
      netUrl: new URL('./pikafish.nnue', PIKA_URL).href
    });
    startupTimer = setTimeout(() => {
      if (!pikafishReady) useFallback('Pikafish khởi tạo quá lâu (120 giây).');
    }, 120000);
  } catch (e) { useFallback(e.message); }
}
self.onmessage = ({data = {}}) => {
  if (data.cmd === 'init_worker') {init(); return;}
  if (!initialized) init();
  if (data.cmd === 'start_ponder' || data.cmd === 'stop_ponder') {
    // Không kích hoạt ponder ở Pikafish: tránh treo do stop/bestmove bất đồng bộ.
    // Với AI JS dự phòng vẫn giữ chức năng ponder cũ.
    if (fallback) fallback.postMessage(data);
    return;
  }
  if (data.cmd === 'clear_cache') {
    generation++;
    pending = null;
    needNewGame = true;
    if (active) { active.cancelled = true; uci('stop'); }
    // Huỷ Worker dự phòng đang tính để tránh trả nước đi từ ván cũ sau khi New Game.
    if (fallback) startFallbackWorker();
    return;
  }
  if (data.board) {
    if (fallback) fallback.postMessage(data);
    else startJob(data);
  }
};
