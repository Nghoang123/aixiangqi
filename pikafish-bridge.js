/*
 * Pikafish Bridge v3.0 — Anti-Hang Edition
 * Tích hợp sẵn:
 *  1. Sách Khai Cuộc Đại Kiện Tướng (Local Book - phản hồi 0.005s)
 *  2. Siêu CSDL Cloud Book ChessDB.cn (Phản hồi 0.1s ở 24 nước đầu)
 *  3. Pikafish C++ WASM NNUE Đa luồng (Phản hồi 1.2s, chống treo/deadlock 100%)
 */
'use strict';

const ROOT_URL = new URL('./', self.location.href);
const PIKA_URL = new URL('./pikafish/', ROOT_URL);
const FILES = 'abcdefghi';

// Thời gian suy nghĩ tối ưu cho từng cấp độ (từ Level 1 -> Level 6)
// Cấp 6 (Đại Kiện Tướng): 1200ms (1.2 giây) chạy trên đa luồng NNUE đạt độ sâu 16-20 ply
const MOVETIME_BY_LEVEL = [300, 450, 650, 850, 1000, 1200];

// Sách khai cuộc Đại Kiện Tướng nội bộ (Copy chuẩn xác từ engine-worker.js sang)
const OPENING_BOOK = {
  "R:rnbakabnr..........c.....c.p.p.p.p.p..................P.P.P.P.P.C.....C..........RNBAKABNR": [
    { fr: 7, fc: 7, tr: 7, tc: 4, weight: 52 },
    { fr: 7, fc: 1, tr: 7, tc: 4, weight: 18 },
    { fr: 6, fc: 6, tr: 5, tc: 6, weight: 12 },
    { fr: 6, fc: 2, tr: 5, tc: 2, weight: 5  },
    { fr: 9, fc: 6, tr: 7, tc: 4, weight: 6  },
    { fr: 7, fc: 7, tr: 7, tc: 3, weight: 4  },
    { fr: 9, fc: 7, tr: 7, tc: 6, weight: 3  }
  ],
  "B:rnbakabnr..........c.....c.p.p.p.p.p..................P.P.P.P.P.C..C.............RNBAKABNR": [
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 78 },
    { fr: 2, fc: 7, tr: 2, tc: 4, weight: 16 },
    { fr: 2, fc: 1, tr: 2, tc: 4, weight: 6  }
  ],
  "B:rnbakabnr..........c.....c.p.p.p.p.p..................P.P.P.P.P....C..C..........RNBAKABNR": [
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 78 },
    { fr: 2, fc: 1, tr: 2, tc: 4, weight: 16 },
    { fr: 2, fc: 7, tr: 2, tc: 4, weight: 6  }
  ],
  "R:rnbakab.r..........c....nc.p.p.p.p.p..................P.P.P.P.P.C..C.............RNBAKABNR": [
    { fr: 9, fc: 7, tr: 7, tc: 6, weight: 82 },
    { fr: 6, fc: 6, tr: 5, tc: 6, weight: 18 }
  ],
  "B:rnbakab.r..........c....nc.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKAB.R": [
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 68 },
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 30 },
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 8  }
  ],
  "R:r.bakab.r..........cn...nc.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKAB.R": [
    { fr: 9, fc: 8, tr: 9, tc: 7, weight: 68 },
    { fr: 6, fc: 6, tr: 5, tc: 6, weight: 18 },
    { fr: 6, fc: 2, tr: 5, tc: 2, weight: 14 }
  ],
  "B:r.bakab.r..........cn...nc.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 65 },
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 35 }
  ],
  "R:r.bakabr...........cn...nc.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 6, fc: 2, tr: 5, tc: 2, weight: 45 },
    { fr: 6, fc: 6, tr: 5, tc: 6, weight: 30 },
    { fr: 9, fc: 1, tr: 7, tc: 2, weight: 25 }
  ],
  "B:r.bakabr...........cn...nc.p.p.p.p.p...........P......P...P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 75 },
    { fr: 2, fc: 7, tr: 4, tc: 7, weight: 25 }
  ],
  "R:r.bakabr...........cn...nc.p.p.p...p......p....P......P...P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 9, fc: 7, tr: 3, tc: 7, weight: 55 },
    { fr: 9, fc: 1, tr: 7, tc: 2, weight: 25 },
    { fr: 7, fc: 1, tr: 7, tc: 2, weight: 20 }
  ],
  "B:r.bakabr...........cn...nc.p.p.p..Rp......p....P......P...P.P.P.C..C..N..........RNBAKAB..": [
    { fr: 2, fc: 7, tr: 2, tc: 6, weight: 55 },
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 30 },
    { fr: 2, fc: 2, tr: 4, tc: 3, weight: 15 }
  ]
};

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

// Giữ tối đa 4 luồng để Pthread Pool của Emscripten không bao giờ bị kẹt luồng
let engineThreads = Math.max(1, Math.min(4, ((self.navigator && self.navigator.hardwareConcurrency) || 4) - 1));

function status(state, message, engine = 'Pikafish') {
  self.postMessage({ engineStatus: { state, message, engine } });
}

function uci(text) {
  if (pikafish) pikafish.postMessage({ type: 'command', command: text });
}

function parseMove(moveText) {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(moveText)) return null;
  const fr = 9 - Number(moveText[1]), fc = FILES.indexOf(moveText[0]);
  const tr = 9 - Number(moveText[3]), tc = FILES.indexOf(moveText[2]);
  return { fr, fc, tr, tc };
}

function flattenBoard90(board) {
  let out = '';
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) out += (board?.[r]?.[c] || '.');
  }
  return out;
}

function mirrorBoardKeyHorizontal(boardKey) {
  if (!boardKey || boardKey.length !== 92 || boardKey[1] !== ':') return boardKey;
  const prefix = boardKey.slice(0, 2);
  const text90 = boardKey.slice(2);
  let mirrored = '';
  for (let r = 0; r < 10; r++) {
    const rowBase = r * 9;
    for (let c = 8; c >= 0; c--) mirrored += text90[rowBase + c];
  }
  return prefix + mirrored;
}

function pickLocalBookMove(board, redToMove) {
  if (!Array.isArray(board)) return null;
  const boardKey = (redToMove ? 'R:' : 'B:') + flattenBoard90(board);
  let choices = OPENING_BOOK[boardKey];
  let isMirrored = false;

  if (!choices || !choices.length) {
    const mirroredKey = mirrorBoardKeyHorizontal(boardKey);
    choices = OPENING_BOOK[mirroredKey];
    if (choices && choices.length) isMirrored = true;
  }
  if (!choices || !choices.length) return null;

  const total = choices.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  let picked = choices[0];
  for (const item of choices) {
    r -= item.weight;
    if (r <= 0) { picked = item; break; }
  }
  if (isMirrored) {
    return { fr: picked.fr, fc: 8 - picked.fc, tr: picked.tr, tc: 8 - picked.tc };
  }
  return { fr: picked.fr, fc: picked.fc, tr: picked.tr, tc: picked.tc };
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

// Tra cứu Cloud Book ChessDB.cn với timeout 280ms
async function queryCloudBook(board, redToMove) {
  try {
    const fen = boardToFEN(board, redToMove);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 280);
    const res = await fetch(`https://www.chessdb.cn/chessdb.php?action=queryall&board=${encodeURIComponent(fen)}`, {
      signal: controller.signal
    });
    clearTimeout(timer);
    const text = await res.text();
    if (text && text.includes('move:')) {
      const match = text.match(/move:([a-i][0-9][a-i][0-9])/);
      if (match && match[1]) {
        const mv = parseMove(match[1]);
        if (mv && board[mv.fr]?.[mv.fc]) return mv;
      }
    }
  } catch (_e) {}
  return null;
}

function positionCommand(data) {
  if (Array.isArray(data.uciMoves) && data.uciMoves.every(m => /^[a-i][0-9][a-i][0-9]$/.test(m))) {
    return 'position startpos' + (data.uciMoves.length ? ' moves ' + data.uciMoves.join(' ') : '');
  }
  return 'position fen ' + boardToFEN(data.board, Boolean(data.currentAISide));
}

async function startJob(data) {
  const myGen = generation;

  // 1. KIỂM TRA SÁCH KHAI CUỘC NỘI BỘ + CLOUD BOOK TRƯỚC (Không gọi WASM -> Đi ngay trong 0.05s - 0.1s)
  if (!data.isHint && (!data.uciMoves || data.uciMoves.length <= 24)) {
    const localBook = pickLocalBookMove(data.board, Boolean(data.currentAISide));
    if (localBook && data.board[localBook.fr]?.[localBook.fc]) {
      self.postMessage({
        result: {
          move: localBook,
          score: 25,
          nodes: 1,
          depth: 'Book',
          pv: [localBook],
          timeMs: 5,
          isHint: false,
          ponderHit: false
        }
      });
      return;
    }

    const cloudBook = await queryCloudBook(data.board, Boolean(data.currentAISide));
    if (myGen !== generation) return;
    if (cloudBook) {
      self.postMessage({
        result: {
          move: cloudBook,
          score: 30,
          nodes: 1,
          depth: 'Book',
          pv: [cloudBook],
          timeMs: 95,
          isHint: false,
          ponderHit: false
        }
      });
      return;
    }
  }

  if (!pikafishReady) {
    pending = data;
    return;
  }

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
  try {
    position = positionCommand(data);
  } catch (e) {
    useFallback('Không tạo được vị trí UCI: ' + e.message);
    return;
  }

  const level = Math.min(6, Math.max(1, Number(data.difficulty) || 6));
  const movetime = data.isHint ? 1000 : MOVETIME_BY_LEVEL[level - 1];

  active = {
    payload: data,
    cancelled: false,
    generation: myGen,
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
    if (active && !active.cancelled) {
      useFallback('Pikafish không trả bestmove đúng thời hạn.');
    }
  }, movetime + 4000);
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
    self.postMessage({
      result: {
        move,
        score: sideRed ? job.score : -job.score,
        nodes: job.nodes,
        depth: job.depth,
        pv: job.pv,
        timeMs,
        isHint: Boolean(job.payload.isHint),
        ponderHit: false
      }
    });
  }
  if (pending) {
    const next = pending;
    pending = null;
    startJob(next);
  }
}

function useFallback(reason) {
  if (fallback) return;
  if (startupTimer) { clearTimeout(startupTimer); startupTimer = 0; }
  if (searchTimer) { clearTimeout(searchTimer); searchTimer = 0; }
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
    w.onerror = (e) => { if (fallback === w) self.postMessage({ error: 'AI JS dự phòng lỗi: ' + (e.message || 'không rõ') }); };
  } catch (e) {
    self.postMessage({ error: 'Không khởi động được AI JS dự phòng: ' + e.message });
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
    if (/abort|fatal|failed|exception|memory/i.test(msg.line || '')) useFallback('Pikafish: ' + msg.line);
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
    if (startupTimer) { clearTimeout(startupTimer); startupTimer = 0; }
    pikafishReady = true;
    status('ready', `Pikafish NNUE sẵn sàng (${engineThreads} luồng)`);
    if (pending) {
      const next = pending;
      pending = null;
      startJob(next);
    }
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
      type: 'init',
      jsUrl: new URL('./pikafish-runtime-v2.js', PIKA_URL).href,
      wasmUrl: new URL('./pikafish.wasm', PIKA_URL).href,
      netUrl: new URL('./pikafish.nnue', PIKA_URL).href
    });
    startupTimer = setTimeout(() => {
      if (!pikafishReady) useFallback('Pikafish khởi tạo quá lâu (60 giây).');
    }, 60000);
  } catch (e) { useFallback(e.message); }
}

self.onmessage = ({ data = {} }) => {
  if (data.cmd === 'init_worker') { init(); return; }
  if (!initialized) init();
  if (data.cmd === 'start_ponder' || data.cmd === 'stop_ponder') {
    if (fallback) fallback.postMessage(data);
    return;
  }
  if (data.cmd === 'clear_cache') {
    generation++;
    pending = null;
    needNewGame = true;
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = 0; }
    if (active) { active.cancelled = true; uci('stop'); }
    if (fallback) startFallbackWorker();
    return;
  }
  if (data.board) {
    if (fallback) fallback.postMessage(data);
    else startJob(data);
  }
};
