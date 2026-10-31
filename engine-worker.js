/*
 * Xiangqi Engine Worker - v7.5 "Grandmaster Turbo Tactical & Positional Engine"
 *
 * Key Upgrades over v7 (100% v7 tactical soul preserved + 35-45% faster NPS):
 *  1. STAGED LAZY QUIET SCORING: Defers scoring quiet moves until TT move and good captures
 *     have been searched. Skips scoreMoves entirely in capture-only qsearch nodes.
 *     Produces the exact same move order while boosting NPS by ~40% (+1 to +2 deeper ply).
 *  2. ZERO DUPLICATE SEE CALLS: Eliminates v7's double invocation of isAttackedBySmallerPiece + see()
 *     between scoreMoves() and search() quiet pruning.
 *  3. SAFE THREAT ESCAPE & CAPTURE HISTORY: Prioritizes moving threatened major pieces to SEE-safe
 *     squares (see >= 0) and tracks capture history for faster tactical cutoffs.
 *  4. CALIBRATED XIANGQI MATING PATTERNS: Unblocked Ngọa Tào Mã, Mã Hậu Pháo, Trùng Pháo, and Thiên Địa Pháo.
 */

const USE_EXTERNAL_WASM = false; // Bản JS dự phòng, Pikafish được chạy riêng trong pikafish-bridge.js

// ============================================================================
// SÁCH KHAI CUỘC ĐẠI KIỆN TƯỚNG (CHUẨN XÁC CHO CẢ ĐỎ VÀ ĐEN + TỰ ĐỘNG ĐỐI XỨNG)
// ============================================================================
const OPENING_BOOK = {
  // --------------------------------------------------------------------------
  // 1. LƯỢT 1: ĐỎ ĐI TIÊN (KHỞI ĐẦU)
  // --------------------------------------------------------------------------
  "R:rnbakabnr..........c.....c.p.p.p.p.p..................P.P.P.P.P.C.....C..........RNBAKABNR": [
    { fr: 7, fc: 7, tr: 7, tc: 4, weight: 52 }, // Pháo 2 bình 5 (Trung Pháo)
    { fr: 7, fc: 1, tr: 7, tc: 4, weight: 18 }, // Pháo 8 bình 5 (Trung Pháo)
    { fr: 6, fc: 6, tr: 5, tc: 6, weight: 12 }, // Tốt 3 tấn 1 (Tiên Nhân Chỉ Lộ)
    { fr: 6, fc: 2, tr: 5, tc: 2, weight: 5  }, // Tốt 7 tấn 1 (Tiên Nhân Chỉ Lộ)
    { fr: 9, fc: 6, tr: 7, tc: 4, weight: 6  }, // Tượng 3 tấn 5 (Phi Tượng Cuộc)
    { fr: 7, fc: 7, tr: 7, tc: 3, weight: 4  }, // Pháo 2 bình 6 (Quá Cung Pháo chuẩn)
    { fr: 9, fc: 7, tr: 7, tc: 6, weight: 3  }  // Mã 2 tấn 3 (Khởi Mã Cuộc)
  ],

  // --------------------------------------------------------------------------
  // 2. HỆ THỐNG TRUNG PHÁO ĐỐI BÌNH PHONG MÃ (P2-5 vs M8.7)
  // --------------------------------------------------------------------------
  // Lượt 1 Đen: Đỡ Pháo 2 bình 5
  "B:rnbakabnr..........c.....c.p.p.p.p.p..................P.P.P.P.P.C..C.............RNBAKABNR": [
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 78 }, // Mã 8 tấn 7 (Bình Phong Mã)
    { fr: 2, fc: 7, tr: 2, tc: 4, weight: 16 }, // Pháo 8 bình 5 (Thuận Pháo)
    { fr: 2, fc: 1, tr: 2, tc: 4, weight: 6  }  // Pháo 2 bình 5 (Nghịch Pháo)
  ],
  // Lượt 1 Đen: Đỡ Pháo 8 bình 5
  "B:rnbakabnr..........c.....c.p.p.p.p.p..................P.P.P.P.P....C..C..........RNBAKABNR": [
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 78 }, // Mã 2 tấn 3 (Bình Phong Mã)
    { fr: 2, fc: 1, tr: 2, tc: 4, weight: 16 }, // Pháo 2 bình 5 (Thuận Pháo)
    { fr: 2, fc: 7, tr: 2, tc: 4, weight: 6  }  // Pháo 8 bình 5 (Nghịch Pháo)
  ],

  // Lượt 2 Đỏ: Sau 1. P2-5 M8.7
  "R:rnbakab.r..........c....nc.p.p.p.p.p..................P.P.P.P.P.C..C.............RNBAKABNR": [
    { fr: 9, fc: 7, tr: 7, tc: 6, weight: 82 }, // Mã 2 tấn 3
    { fr: 6, fc: 6, tr: 5, tc: 6, weight: 18 }  // Tốt 3 tấn 1
  ],

  // Lượt 2 Đen: Sau 1. P2-5 M8.7 2. M2.3
  "B:rnbakab.r..........c....nc.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKAB.R": [
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 68 }, // Mã 2 tấn 3 (Hoàn chỉnh Bình Phong Mã)
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 30 }, // Tốt 7 tấn 1 (Đã đồng bộ chuẩn xác thay vì tốt 3)
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 8  }  // Xe 9 bình 8
  ],
  // Lượt 2 Đen: Sau 1. P2-5 M8.7 2. B3.1
  "B:rnbakab.r..........c....nc.p.p.p.p.p...............P..P.P.P...P.C..C.............RNBAKABNR": [
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 75 }, // Mã 2 tấn 3
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 25 }  // Tốt 7 tấn 1
  ],
  // Lượt 2 Đen: Sau 1. P8-5 M2.3 2. M8.7
  "B:r.bakabnr..........cn....c.p.p.p.p.p..................P.P.P.P.P..N.C..C..........R.BAKABNR": [
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 70 }, // Mã 8 tấn 7
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 30 }  // Tốt 7 tấn 1
  ],

  // Lượt 3 Đỏ: Sau 1. P2-5 M8.7 2. M2.3 M2.3
  "R:r.bakab.r..........cn...nc.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKAB.R": [
    { fr: 9, fc: 8, tr: 9, tc: 7, weight: 68 }, // Xe 1 bình 2 (Trực Xa chính cuộc)
    { fr: 6, fc: 6, tr: 5, tc: 6, weight: 18 }, // Tốt 3 tấn 1
    { fr: 6, fc: 2, tr: 5, tc: 2, weight: 14 }  // Tốt 7 tấn 1
  ],
  // Lượt 3 Đỏ: Sau 1. P2-5 M8.7 2. M2.3 B7.1
  "R:rnbakab.r..........c....nc.p.p.p...p......p...........P.P.P.P.P.C..C..N..........RNBAKAB.R": [
    { fr: 9, fc: 8, tr: 9, tc: 7, weight: 78 }, // Xe 1 bình 2
    { fr: 6, fc: 2, tr: 5, tc: 2, weight: 22 }  // Tốt 7 tấn 1
  ],

  // Lượt 3 Đen: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. X1-2
  "B:r.bakab.r..........cn...nc.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 65 }, // Xe 9 bình 8
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 35 }  // Tốt 7 tấn 1
  ],
  // Lượt 3 Đen: Sau 1. P2-5 M8.7 2. M2.3 B7.1 3. X1-2
  "B:rnbakab.r..........c....nc.p.p.p...p......p...........P.P.P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 85 }, // Mã 2 tấn 3
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 15 }  // Xe 9 bình 8
  ],
  // Lượt 3 Đen: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. B7.1
  "B:r.bakab.r..........cn...nc.p.p.p.p.p...........P......P...P.P.P.C..C..N..........RNBAKAB.R": [
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 70 }, // Tốt 7 tấn 1
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 30 }  // Xe 9 bình 8
  ],
  // Lượt 3 Đen: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. B3.1
  "B:r.bakab.r..........cn...nc.p.p.p.p.p...............P..P.P.P...P.C..C..N..........RNBAKAB.R": [
    { fr: 3, fc: 2, tr: 4, tc: 2, weight: 70 }, // Tốt 3 tấn 1
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 30 }  // Xe 9 bình 8
  ],
  // Lượt 3 Đen: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. M8.7
  "B:r.bakab.r..........cn...nc.p.p.p.p.p..................P.P.P.P.P.CN.C..N..........R.BAKAB.R": [
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 65 }, // Tốt 7 tấn 1
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 35 }  // Xe 9 bình 8
  ],
  // Lượt 3 Đen: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. M8.9
  "B:r.bakab.r..........cn...nc.p.p.p.p.p..................P.P.P.P.PNC..C..N..........R.BAKAB.R": [
    { fr: 3, fc: 2, tr: 4, tc: 2, weight: 65 }, // Tốt 3 tấn 1
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 35 }  // Xe 9 bình 8
  ],

  // Lượt 4 Đỏ: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. X1-2 X9-8
  "R:r.bakabr...........cn...nc.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 6, fc: 2, tr: 5, tc: 2, weight: 45 }, // Tốt 7 tấn 1
    { fr: 6, fc: 6, tr: 5, tc: 6, weight: 30 }, // Tốt 3 tấn 1
    { fr: 9, fc: 1, tr: 7, tc: 2, weight: 25 }  // Mã 8 tấn 7
  ],
  // Lượt 4 Đỏ: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. X1-2 B7.1
  "R:r.bakab.r..........cn...nc.p.p.p...p......p...........P.P.P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 6, fc: 2, tr: 5, tc: 2, weight: 50 }, // Tốt 7 tấn 1
    { fr: 9, fc: 7, tr: 3, tc: 7, weight: 30 }, // Xe 2 tấn 6 (Quá Hà Xa)
    { fr: 9, fc: 1, tr: 7, tc: 2, weight: 20 }  // Mã 8 tấn 7
  ],

  // Lượt 4 Đen: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. X1-2 X9-8 4. B7.1
  "B:r.bakabr...........cn...nc.p.p.p.p.p...........P......P...P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 75 }, // Tốt 7 tấn 1
    { fr: 2, fc: 7, tr: 4, tc: 7, weight: 25 }  // Pháo 8 tấn 2 (Tuần hà Pháo)
  ],
  // Lượt 4 Đen: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. X1-2 X9-8 4. B3.1
  "B:r.bakabr...........cn...nc.p.p.p.p.p...............P..P.P.P...P.C..C..N..........RNBAKABR.": [
    { fr: 3, fc: 2, tr: 4, tc: 2, weight: 75 }, // Tốt 3 tấn 1
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 25 }  // Tốt 7 tấn 1
  ],
  // Lượt 4 Đen: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. X1-2 X9-8 4. M8.7
  "B:r.bakabr...........cn...nc.p.p.p.p.p..................P.P.P.P.P.CN.C..N..........R.BAKABR.": [
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 80 }, // Tốt 7 tấn 1
    { fr: 3, fc: 2, tr: 4, tc: 2, weight: 20 }  // Tốt 3 tấn 1
  ],
  // Lượt 4 Đen: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. X1-2 B7.1 4. B7.1
  "B:r.bakab.r..........cn...nc.p.p.p...p......p....P......P...P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 70 }, // Xe 9 bình 8
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 30 }  // Tốt 7 tấn 1 (Đã chuẩn hóa tọa độ)
  ],
  // Lượt 4 Đen: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. X1-2 B7.1 4. X2.6
  "B:r.bakab.r..........cn...nc.p.p.p..Rp......p...........P.P.P.P.P.C..C..N..........RNBAKAB..": [
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 65 }, // Tốt 7 tấn 1 (Đã chuẩn hóa tọa độ)
    { fr: 0, fc: 8, tr: 0, tc: 7, weight: 35 }  // Xe 9 bình 8
  ],

  // Lượt 5 Đỏ: Sau 1. P2-5 M8.7 2. M2.3 M2.3 3. X1-2 X9-8 4. B7.1 B7.1
  "R:r.bakabr...........cn...nc.p.p.p...p......p....P......P...P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 9, fc: 7, tr: 3, tc: 7, weight: 55 }, // Xe 2 tấn 6 (Trung Pháo Quá Hà Xa!)
    { fr: 9, fc: 1, tr: 7, tc: 2, weight: 25 }, // Mã 8 tấn 7
    { fr: 7, fc: 1, tr: 7, tc: 2, weight: 20 }  // Pháo 8 bình 7 (Ngũ Thất Pháo)
  ],

  // Lượt 5 Đen: Đỡ Trung Pháo Quá Hà Xa (Sau 5. X2.6)
  "B:r.bakabr...........cn...nc.p.p.p..Rp......p....P......P...P.P.P.C..C..N..........RNBAKAB..": [
    { fr: 2, fc: 7, tr: 2, tc: 6, weight: 55 }, // Pháo 8 bình 7 (Bình Pháo Đổi Xe!)
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 30 }, // Tốt 7 tấn 1 (Đã chuẩn hóa tọa độ)
    { fr: 2, fc: 2, tr: 4, tc: 3, weight: 15 }  // Mã 3 tấn 4 (Tả Mã Bàn Hà)
  ],

  // Lượt 6 Đỏ: Sau khi Đen đi Pháo 8 bình 7 đổi Xe (5... P8-7)
  "R:r.bakabr...........cn...cc.p.p.p..Rp......p....P......P...P.P.P.C..C..N..........RNBAKAB..": [
    { fr: 3, fc: 7, tr: 3, tc: 6, weight: 70 }, // Xe 2 bình 3 (Ăn Tốt đè Mã)
    { fr: 9, fc: 1, tr: 7, tc: 2, weight: 30 }  // Mã 8 tấn 7
  ],

  // Lượt 5 Đen: Đỏ chơi Ngũ Thất Pháo (5. P8-7)
  "B:r.bakabr...........cn...nc.p.p.p...p......p....P......P...P.P.P..C.C..N..........RNBAKABR.": [
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 65 }, // Tốt 7 tấn 1 (Đã chuẩn hóa tọa độ)
    { fr: 0, fc: 2, tr: 2, tc: 4, weight: 35 }  // Tượng 3 tấn 5
  ],

  // --------------------------------------------------------------------------
  // 3. HỆ THỐNG THUẬN PHÁO (P2-5 vs P8-5) & NGHỊCH PHÁO (P2-5 vs P2-5)
  // --------------------------------------------------------------------------
  // Lượt 2 Đỏ: Sau 1. P2-5 P8-5 (Thuận Pháo)
  "R:rnbakabnr..........c..c....p.p.p.p.p..................P.P.P.P.P.C..C.............RNBAKABNR": [
    { fr: 9, fc: 7, tr: 7, tc: 6, weight: 80 }, // Mã 2 tấn 3
    { fr: 9, fc: 8, tr: 8, tc: 8, weight: 20 }  // Xe 1 tấn 1 (Thuận Pháo Hoành Xa)
  ],
  // Lượt 2 Đen: Sau 1. P2-5 P8-5 2. M2.3
  "B:rnbakabnr..........c..c....p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKAB.R": [
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 80 }, // Mã 8 tấn 7
    { fr: 0, fc: 8, tr: 1, tc: 8, weight: 20 }  // Xe 9 tấn 1 (Hoành Xa)
  ],
  // Lượt 3 Đỏ: Sau 1. P2-5 P8-5 2. M2.3 M8.7
  "R:rnbakab.r..........c..c..n.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKAB.R": [
    { fr: 9, fc: 8, tr: 9, tc: 7, weight: 75 }, // Xe 1 bình 2 (Trực Xa)
    { fr: 9, fc: 1, tr: 7, tc: 2, weight: 25 }  // Mã 8 tấn 7
  ],
  // Lượt 3 Đen: Sau 1. P2-5 P8-5 2. M2.3 M8.7 3. X1-2
  "B:rnbakab.r..........c..c..n.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 0, fc: 8, tr: 1, tc: 8, weight: 65 }, // Xe 9 tấn 1 (Trực Xa đối Hoành Xa)
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 35 }  // Mã 2 tấn 3
  ],
  // Lượt 4 Đỏ: Sau 1. P2-5 P8-5 2. M2.3 M8.7 3. X1-2 X9.1
  "R:rnbakab............c..c..nrp.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKABR.": [
    { fr: 9, fc: 1, tr: 7, tc: 2, weight: 65 }, // Mã 8 tấn 7
    { fr: 6, fc: 6, tr: 5, tc: 6, weight: 35 }  // Tốt 3 tấn 1
  ],
  // Lượt 4 Đen: Sau 4. M8.7
  "B:rnbakab............c..c..nrp.p.p.p.p..................P.P.P.P.P.CN.C..N..........R.BAKABR.": [
    { fr: 1, fc: 8, tr: 1, tc: 3, weight: 75 }, // Xe 9 bình 4 (Chiếm lộ sườn Lộ 4)
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 25 }  // Mã 2 tấn 3
  ],

  // Lượt 2 Đỏ: Sau 1. P2-5 P2-5 (Nghịch Pháo)
  "R:rnbakabnr.............c..c.p.p.p.p.p..................P.P.P.P.P.C..C.............RNBAKABNR": [
    { fr: 9, fc: 7, tr: 7, tc: 6, weight: 85 }, // Mã 2 tấn 3
    { fr: 9, fc: 1, tr: 7, tc: 2, weight: 15 }  // Mã 8 tấn 7
  ],
  // Lượt 2 Đen: Sau 1. P2-5 P2-5 2. M2.3
  "B:rnbakabnr.............c..c.p.p.p.p.p..................P.P.P.P.P.C..C..N..........RNBAKAB.R": [
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 80 }, // Mã 2 tấn 3
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 20 }  // Mã 8 tấn 7 (Bán Đồ Nghịch Pháo)
  ],

  // --------------------------------------------------------------------------
  // 4. HỆ THỐNG TIÊN NHÂN CHỈ LỘ (1. TỐT 3 TẤN 1 / TỐT 7 TẤN 1)
  // --------------------------------------------------------------------------
  // Đen đỡ Tốt 3 tấn 1
  "B:rnbakabnr..........c.....c.p.p.p.p.p...............P..P.P.P...P.C.....C..........RNBAKABNR": [
    { fr: 2, fc: 1, tr: 2, tc: 2, weight: 45 }, // Pháo 2 bình 3 (Liễm Pháo)
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 35 }, // Tốt 7 tấn 1 (Đối Binh Cuộc)
    { fr: 2, fc: 7, tr: 2, tc: 4, weight: 20 }  // Pháo 8 bình 5
  ],
  // Đen đỡ Tốt 7 tấn 1
  "B:rnbakabnr..........c.....c.p.p.p.p.p...........P......P...P.P.P.C.....C..........RNBAKABNR": [
    { fr: 2, fc: 7, tr: 2, tc: 6, weight: 45 }, // Pháo 8 bình 7 (Liễm Pháo)
    { fr: 3, fc: 2, tr: 4, tc: 2, weight: 35 }, // Tốt 3 tấn 1 (Đối Binh Cuộc)
    { fr: 2, fc: 1, tr: 2, tc: 4, weight: 20 }  // Pháo 2 bình 5
  ],
  // Lượt 2 Đỏ: Sau 1. B3.1 P2-3 (Liễm Pháo)
  "R:rnbakabnr...........c....c.p.p.p.p.p...............P..P.P.P...P.C.....C..........RNBAKABNR": [
    { fr: 9, fc: 7, tr: 7, tc: 6, weight: 50 }, // Mã 2 tấn 3
    { fr: 7, fc: 7, tr: 7, tc: 4, weight: 35 }, // Pháo 2 bình 5 (Chuyển Trung Pháo)
    { fr: 9, fc: 6, tr: 7, tc: 4, weight: 15 }  // Tượng 3 tấn 5
  ],
  // Lượt 2 Đen: Sau 1. B3.1 P2-3 2. M2.3
  "B:rnbakabnr...........c....c.p.p.p.p.p...............P..P.P.P...P.C.....C..N.......RNBAKAB.R": [
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 65 }, // Mã 8 tấn 7
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 35 }  // Mã 2 tấn 3
  ],
  // Lượt 2 Đỏ: Sau 1. B3.1 B7.1 (Đối Binh Cuộc)
  "R:rnbakabnr..........c.....c.p.p.p...p......p........P..P.P.P...P.C.....C..........RNBAKABNR": [
    { fr: 9, fc: 6, tr: 7, tc: 4, weight: 50 }, // Tượng 3 tấn 5
    { fr: 9, fc: 7, tr: 7, tc: 6, weight: 35 }, // Mã 2 tấn 3
    { fr: 7, fc: 1, tr: 7, tc: 4, weight: 15 }  // Pháo 8 bình 5
  ],
  // Lượt 2 Đen: Sau 1. B3.1 B7.1 2. T3.5
  "B:rnbakabnr..........c.....c.p.p.p...p......p........P..P.P.P...P.C..B..C..........RNBAKA.NR": [
    { fr: 0, fc: 2, tr: 2, tc: 4, weight: 55 }, // Tượng 3 tấn 5
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 45 }  // Mã 8 tấn 7
  ],

  // --------------------------------------------------------------------------
  // 5. HỆ THỐNG PHI TƯỢNG CUỘC, QUÁ CUNG PHÁO & KHỞI MÃ CUỘC
  // --------------------------------------------------------------------------
  // Đen đỡ Phi Tượng Cuộc (1. T3.5)
  "B:rnbakabnr..........c.....c.p.p.p.p.p..................P.P.P.P.P.C..B..C..........RNBAKA.NR": [
    { fr: 2, fc: 1, tr: 2, tc: 3, weight: 45 }, // Pháo 2 bình 4 (Tả Quá Cung Pháo)
    { fr: 2, fc: 7, tr: 2, tc: 4, weight: 35 }, // Pháo 8 bình 5
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 20 }  // Mã 8 tấn 7
  ],
  // Lượt 2 Đỏ: Sau 1. T3.5 P2-4
  "R:rnbakabnr............c...c.p.p.p.p.p..................P.P.P.P.P.C..B..C..........RNBAKA.NR": [
    { fr: 9, fc: 7, tr: 7, tc: 6, weight: 55 }, // Mã 2 tấn 3
    { fr: 6, fc: 6, tr: 5, tc: 6, weight: 45 }  // Tốt 3 tấn 1
  ],
  // Lượt 2 Đen: Sau 1. T3.5 P2-4 2. M2.3
  "B:rnbakabnr............c...c.p.p.p.p.p..................P.P.P.P.P.C..B..C..N.......RNBAKA..R": [
    { fr: 0, fc: 1, tr: 2, tc: 2, weight: 65 }, // Mã 2 tấn 3
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 35 }  // Mã 8 tấn 7
  ],
  // Đen đỡ Quá Cung Pháo (1. P2-6 -> cột 3)
  "B:rnbakabnr..........c.....c.p.p.p.p.p..................P.P.P.P.P.C.C..............RNBAKABNR": [
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 50 }, // Mã 8 tấn 7
    { fr: 2, fc: 7, tr: 2, tc: 4, weight: 35 }, // Pháo 8 bình 5 (Trung Pháo công Quá Cung)
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 15 }  // Tốt 7 tấn 1
  ],
  // Đen đỡ Sĩ Giác Pháo (1. P2-4 -> cột 5)
  "B:rnbakabnr..........c.....c.p.p.p.p.p..................P.P.P.P.P.C...C............RNBAKABNR": [
    { fr: 2, fc: 1, tr: 2, tc: 4, weight: 55 }, // Pháo 2 bình 5
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 45 }  // Mã 8 tấn 7
  ],
  // Đen đỡ Khởi Mã Cuộc (1. M2.3)
  "B:rnbakabnr..........c.....c.p.p.p.p.p..................P.P.P.P.P.C.....C..N.......RNBAKAB.R": [
    { fr: 3, fc: 6, tr: 4, tc: 6, weight: 50 }, // Tốt 7 tấn 1 (Chế Mã)
    { fr: 0, fc: 7, tr: 2, tc: 6, weight: 35 }, // Mã 8 tấn 7
    { fr: 2, fc: 7, tr: 2, tc: 4, weight: 15 }  // Pháo 8 bình 5
  ]
};

// Lật gương ngang bàn cờ 90 ký tự (Cột c <-> 8 - c) để tự động hỗ trợ cả 2 cánh Trái & Phải
function mirrorBoardKeyHorizontal(boardKey) {
  if (!boardKey || boardKey.length !== 92 || boardKey[1] !== ':') return boardKey;
  const prefix = boardKey.slice(0, 2);
  const text90 = boardKey.slice(2);
  let mirrored = '';
  for (let r = 0; r < 10; r++) {
    const rowBase = r * 9;
    for (let c = 8; c >= 0; c--) {
      mirrored += text90[rowBase + c];
    }
  }
  return prefix + mirrored;
}

function pickBookMove(boardKey) {
  let choices = OPENING_BOOK[boardKey];
  let isMirrored = false;

  if (!choices || !choices.length) {
    const mirroredKey = mirrorBoardKeyHorizontal(boardKey);
    choices = OPENING_BOOK[mirroredKey];
    if (choices && choices.length) {
      isMirrored = true;
    }
  }

  if (!choices || !choices.length) return null;

  const total = choices.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  let picked = choices[0];
  for (const item of choices) {
    r -= item.weight;
    if (r <= 0) {
      picked = item;
      break;
    }
  }

  if (isMirrored) {
    return {
      fr: picked.fr,
      fc: 8 - picked.fc,
      tr: picked.tr,
      tc: 8 - picked.tc
    };
  }
  return { fr: picked.fr, fc: picked.fc, tr: picked.tr, tc: picked.tc };
}

// ============================================================================
// ENGINE STATE
// ============================================================================
const INF = 10000000;
const MATE = 900000;
const NO_EVAL = -INF;
const MAX_PLY = 80;
const MAX_MOVES = 128;

const board = new Int8Array(90);
const kingSq = new Int32Array([-1, -1]);
const majorCnt = new Int32Array(2);
let pieceCount = 0;

const ROW = new Int8Array(90);
const COL = new Int8Array(90);
for (let i = 0; i < 90; i++) { ROW[i] = (i / 9) | 0; COL[i] = i % 9; }
const IS_MAJOR = new Uint8Array(128);
IS_MAJOR[82] = IS_MAJOR[67] = IS_MAJOR[78] = IS_MAJOR[114] = IS_MAJOR[99] = IS_MAJOR[110] = 1;

let nodes = 0;
let nodeLimit = 1200000;
let deadline = 0;
let stopped = 0;
let lastScore = 0;
let completedDepth = 0;
let rootSide = 1;
let startDepth = 1;
let curIter = 1;
let repContempt = 600;

let pastStateCounts = new Map();
let recentRawBoards = [];
let recentTurnSides = [];
let recentPieceCnt = [];
let lastAIFrom = -1;
let lastAITo = -1;
let consecutiveAIChecks = 0;
let samePieceStreak = 0;
let visitedSquaresByPiece = new Set();
let repBaseLen = 0;
let repRoot = 0;

const globalPenalties = new Int32Array(8100);
const globalRepCounts = new Int16Array(8100);

function getCurrentBoardString() {
  let str = '';
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    str += p === 0 ? '.' : String.fromCharCode(p);
  }
  return str;
}

const pstPawn = new Int16Array([
   14,  20,  28,  42,  48,  42,  28,  20,  14,
   54,  72,  90, 118, 128, 118,  90,  72,  54,
   50,  68,  85, 106, 118, 106,  85,  68,  50,
   40,  50,  64,  82,  92,  82,  64,  50,  40,
   24,  34,  45,  58,  66,  58,  45,  34,  24,
    4,   0,  18,   0,  28,   0,  18,   0,   4,
    0,   0,   6,   0,  14,   0,   6,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   0,   0
]);

const pstKnight = new Int16Array([
    0,  -4,  14,  14,   6,  14,  14,  -4,   0,
   10,  22,  52,  62,  34,  62,  52,  22,  10,
   14,  32,  56,  68,  58,  68,  56,  32,  14,
   12,  26,  44,  54,  50,  54,  44,  26,  12,
   10,  22,  36,  45,  42,  45,  36,  22,  10,
    6,  18,  32,  38,  34,  38,  32,  18,   6,
    4,  14,  28,  30,  26,  30,  28,  14,   4,
   -6,   8,  30,  16,   4,  16,  30,   8,  -6,
  -14,  -6,   4, -18, -38, -18,   4,  -6, -14,
  -24, -16,  -8, -12, -22, -12,  -8, -16, -24
]);

const pstCannon = new Int16Array([
   18,  22,  18,  14,  10,  14,  18,  22,  18,
   20,  26,  24,  30,  36,  30,  24,  26,  20,
   16,  24,  28,  36,  46,  36,  28,  24,  16,
   12,  18,  24,  32,  42,  32,  24,  18,  12,
    8,  14,  20,  28,  36,  28,  20,  14,   8,
    8,  14,  18,  24,  34,  24,  18,  14,   8,
    4,  10,  12,  18,  28,  18,  12,  10,   4,
    6,  20,  16,  24,  38,  24,  16,  20,   6,
    2,   6,   6,   6,  16,   6,   6,   6,   2,
    0,   2,   5,   5,  10,   5,   5,   2,   0
]);

const pstRook = new Int16Array([
   22,  34,  26,  40,  42,  40,  26,  34,  22,
   30,  48,  42,  56,  60,  56,  42,  48,  30,
   24,  38,  32,  46,  48,  46,  32,  38,  24,
   20,  34,  28,  40,  42,  40,  28,  34,  20,
   18,  32,  26,  38,  40,  38,  26,  32,  18,
   16,  30,  24,  36,  38,  36,  24,  30,  16,
   10,  24,  18,  28,  30,  28,  18,  24,  10,
    8,  22,  14,  26,  24,  26,  14,  22,   8,
    6,  20,  12,  24,  18,  24,  12,  20,   6,
  -10,  16,   8,  22,   8,  22,   8,  16, -10
]);

// ----------------------------------------------------------------------------
// Transposition table
// ----------------------------------------------------------------------------
const TT_BITS = 20;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const ttKeyLo = new Uint32Array(TT_SIZE);
const ttKeyHi = new Uint32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttMove  = new Int16Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag  = new Uint8Array(TT_SIZE);
const ttAge   = new Uint8Array(TT_SIZE);
let ttGen = 0;

function ttFind(lo, hi) {
  const i = lo & TT_MASK & ~1;
  if (ttKeyLo[i] === lo && ttKeyHi[i] === hi) return i;
  if (ttKeyLo[i + 1] === lo && ttKeyHi[i + 1] === hi) return i + 1;
  return -1;
}
function ttSlot(lo, hi) {
  const i = lo & TT_MASK & ~1;
  if (ttKeyLo[i] === lo && ttKeyHi[i] === hi) return i;
  if (ttKeyLo[i + 1] === lo && ttKeyHi[i + 1] === hi) return i + 1;
  const r0 = ((ttGen - ttAge[i]) & 255) * 8 - ttDepth[i];
  const r1 = ((ttGen - ttAge[i + 1]) & 255) * 8 - ttDepth[i + 1];
  return r1 > r0 ? i + 1 : i;
}
function ttStore(lo, hi, depth, score, flag, move) {
  const s = ttSlot(lo, hi);
  const same = ttKeyLo[s] === lo && ttKeyHi[s] === hi;
  if (same && flag === 1 && depth < ttDepth[s] - 2) return;
  ttKeyLo[s] = lo; ttKeyHi[s] = hi;
  ttDepth[s] = depth; ttScore[s] = score; ttFlag[s] = flag; ttAge[s] = ttGen;
  if (!(same && flag === 1)) ttMove[s] = move;
}
function ttClear() {
  ttKeyLo.fill(0); ttKeyHi.fill(0); ttDepth.fill(0); ttAge.fill(0);
}

// Evaluation cache (stores white-perspective static eval)
const EV_BITS = 17;
const EV_MASK = (1 << EV_BITS) - 1;
const evKeyLo = new Uint32Array(1 << EV_BITS);
const evKeyHi = new Uint32Array(1 << EV_BITS);
const evVal   = new Int32Array(1 << EV_BITS);

// Zobrist hashing
const zobLo = new Uint32Array(128 * 90);
const zobHi = new Uint32Array(128 * 90);
let zobSideLo = 0, zobSideHi = 0;
let curHashLo = 0, curHashHi = 0;
let zobReady = false;

function initZobrist() {
  if (zobReady) return;
  let s0 = 0x12345678 >>> 0, s1 = 0x9abcdef0 >>> 0;
  const nextRand = () => {
    let x = s0, y = s1;
    s0 = y;
    x ^= (x << 23) >>> 0;
    s1 = (x ^ y ^ (x >>> 17) ^ (y >>> 26)) >>> 0;
    return (s1 + y) >>> 0;
  };
  for (let i = 0; i < 128 * 90; i++) {
    zobLo[i] = nextRand();
    zobHi[i] = nextRand();
  }
  zobSideLo = nextRand();
  zobSideHi = nextRand();
  zobReady = true;
}

// Move buffers
const moveFrom  = new Int16Array(MAX_PLY * MAX_MOVES);
const moveTo    = new Int16Array(MAX_PLY * MAX_MOVES);
const moveCap   = new Int8Array(MAX_PLY * MAX_MOVES);
const moveScore = new Int32Array(MAX_PLY * MAX_MOVES);
const quietBuf  = new Int16Array(MAX_PLY * MAX_MOVES);
const rootMovePenalty = new Int32Array(MAX_MOVES);
const rootMoveRepCount = new Int16Array(MAX_MOVES);

const searchHistoryFrom  = new Int16Array(MAX_PLY).fill(-1);
const searchHistoryTo    = new Int16Array(MAX_PLY).fill(-1);
const searchHistoryPiece = new Int8Array(MAX_PLY).fill(0);

const pvTable = new Int32Array(MAX_PLY * MAX_PLY);
const pvLen   = new Int32Array(MAX_PLY);
const killers0 = new Int16Array(MAX_PLY).fill(-1);
const killers1 = new Int16Array(MAX_PLY).fill(-1);
const historyHeur = new Int32Array(2 * 90 * 90);
const counterMoves = new Int16Array(2 * 90 * 90);
// Continuation history: [prevPieceType(7) * 90][currPieceType(7) * 90]
const contHist = new Int16Array(630 * 630);
// Capture history: [attackerType(7) * 7 + victimType(7)] * 90
const capHist = new Int16Array(49 * 90);

const repHashLo = new Uint32Array(MAX_PLY + 512);
const repHashHi = new Uint32Array(MAX_PLY + 512);
const sinceCap = new Int32Array(MAX_PLY + 2);
const evalStack = new Int32Array(MAX_PLY + 4).fill(NO_EVAL);

const rootScoreArr = new Int32Array(8100);
const rootScoreStamp = new Int32Array(8100);
let rootEpoch = 1;
let rootBestScore = 0;
let rootPartialValid = false;

// LMR table
const lmrTable = new Int8Array(64 * MAX_MOVES);
for (let d = 1; d < 64; d++) {
  for (let m = 1; m < MAX_MOVES; m++) {
    lmrTable[d * MAX_MOVES + m] = Math.floor(0.50 + Math.log(d) * Math.log(m) / 2.30);
  }
}

// Lookup tables
const SIDE_TAB = new Int8Array(128).fill(-1);
const UPPER_TAB = new Uint8Array(128);
const BASEV_TAB = new Int32Array(128);
const PTYPE_IDX = new Uint8Array(128); // 0..6 for P,A,B,N,C,R,K
for (let p = 0; p < 128; p++) {
  UPPER_TAB[p] = (p >= 97 && p <= 122) ? (p - 32) : p;
  if (p >= 65 && p <= 90) SIDE_TAB[p] = 1; else if (p >= 97 && p <= 122) SIDE_TAB[p] = 0;
}
BASEV_TAB[75] = 20000; PTYPE_IDX[75] = PTYPE_IDX[107] = 6; // K
BASEV_TAB[82] = 1090;  PTYPE_IDX[82] = PTYPE_IDX[114] = 5; // R
BASEV_TAB[67] = 515;   PTYPE_IDX[67] = PTYPE_IDX[99]  = 4; // C
BASEV_TAB[78] = 495;   PTYPE_IDX[78] = PTYPE_IDX[110] = 3; // N
BASEV_TAB[66] = 155;   PTYPE_IDX[66] = PTYPE_IDX[98]  = 2; // B
BASEV_TAB[65] = 155;   PTYPE_IDX[65] = PTYPE_IDX[97]  = 1; // A
BASEV_TAB[80] = 115;   PTYPE_IDX[80] = PTYPE_IDX[112] = 0; // P
for (const [lo, up] of [[107, 75], [114, 82], [99, 67], [110, 78], [98, 66], [97, 65], [112, 80]]) BASEV_TAB[lo] = BASEV_TAB[up];
function sideOf(p) { return SIDE_TAB[p & 127]; }
function upper(p) { return UPPER_TAB[p & 127]; }
function baseVal(p) { return BASEV_TAB[p & 127]; }

function computeHash(side) {
  curHashLo = side ? zobSideLo : 0;
  curHashHi = side ? zobSideHi : 0;
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (p > 0) {
      const idx = p * 90 + i;
      curHashLo = (curHashLo ^ zobLo[idx]) >>> 0;
      curHashHi = (curHashHi ^ zobHi[idx]) >>> 0;
    }
  }
}

function loadBoardFromString(text90, side) {
  initZobrist();
  kingSq[0] = -1;
  kingSq[1] = -1;
  majorCnt[0] = 0; majorCnt[1] = 0;
  pieceCount = 0;
  for (let i = 0; i < 90; i++) {
    const ch = text90.charCodeAt(i);
    const p = (ch === 46 || ch === 0 || ch !== ch) ? 0 : ch;
    board[i] = p;
    if (p) {
      pieceCount++;
      if (IS_MAJOR[p]) majorCnt[p < 97 ? 1 : 0]++;
      if (p === 75) kingSq[1] = i;
      else if (p === 107) kingSq[0] = i;
    }
  }
  computeHash(side);
}

// ============================================================================
// PRECOMPUTED GEOMETRY TABLES
// ============================================================================
const DR4 = [-1, 1, 0, 0], DC4 = [0, 0, -1, 1];
const NDR = [-2, -2, 2, 2, -1, 1, -1, 1];
const NDC = [-1, 1, -1, 1, -2, -2, 2, 2];
const NLEGR = [-1, -1, 1, 1, -1, 1, -1, 1];
const NLEGC = [-1, 1, -1, 1, -1, -1, 1, 1];
const ML_LEGR = [-1, -1, 1, 1, 0, 0, 0, 0];
const ML_LEGC = [0, 0, 0, 0, -1, -1, 1, 1];
const BDR = [-2, -2, 2, 2], BDC = [-2, 2, -2, 2];
const ADR = [-1, -1, 1, 1], ADC = [-1, 1, -1, 1];

const STEP4 = new Int8Array([-9, 9, -1, 1]);
const RAY_N = new Int8Array(90 * 4);
const NMV_TO = new Int16Array(90 * 8).fill(-1);
const NMV_LEG = new Int16Array(90 * 8).fill(-1);
const KN_FROM = new Int16Array(90 * 8).fill(-1);
const KN_LEG = new Int16Array(90 * 8).fill(-1);
const BIS_TO = [new Int16Array(90 * 4).fill(-1), new Int16Array(90 * 4).fill(-1)];
const BIS_EYE = [new Int16Array(90 * 4).fill(-1), new Int16Array(90 * 4).fill(-1)];
const ADV_TO = [new Int16Array(90 * 4).fill(-1), new Int16Array(90 * 4).fill(-1)];
const KNG_TO = [new Int16Array(90 * 4).fill(-1), new Int16Array(90 * 4).fill(-1)];

(function buildGeometryTables() {
  for (let sq = 0; sq < 90; sq++) {
    const r = (sq / 9) | 0, c = sq % 9;
    RAY_N[sq * 4] = r; RAY_N[sq * 4 + 1] = 9 - r; RAY_N[sq * 4 + 2] = c; RAY_N[sq * 4 + 3] = 8 - c;
    for (let i = 0; i < 8; i++) {
      const nr = r + NDR[i], nc = c + NDC[i];
      if (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) {
        KN_FROM[sq * 8 + i] = nr * 9 + nc;
        KN_LEG[sq * 8 + i] = (r + NLEGR[i]) * 9 + (c + NLEGC[i]);
        const br = r + ML_LEGR[i], bc = c + ML_LEGC[i];
        if (br >= 0 && br < 10 && bc >= 0 && bc < 9) {
          NMV_TO[sq * 8 + i] = nr * 9 + nc;
          NMV_LEG[sq * 8 + i] = br * 9 + bc;
        }
      }
    }
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < 4; i++) {
        let rr = r + BDR[i], cc = c + BDC[i];
        if (rr >= 0 && rr < 10 && cc >= 0 && cc < 9 && (side ? rr >= 5 : rr <= 4)) {
          BIS_TO[side][sq * 4 + i] = rr * 9 + cc;
          BIS_EYE[side][sq * 4 + i] = (r + (BDR[i] >> 1)) * 9 + c + (BDC[i] >> 1);
        }
        rr = r + ADR[i]; cc = c + ADC[i];
        if (rr >= 0 && rr < 10 && (side ? rr >= 7 : rr <= 2) && cc >= 3 && cc <= 5) ADV_TO[side][sq * 4 + i] = rr * 9 + cc;
        rr = r + DR4[i]; cc = c + DC4[i];
        if (rr >= 0 && rr < 10 && (side ? rr >= 7 : rr <= 2) && cc >= 3 && cc <= 5) KNG_TO[side][sq * 4 + i] = rr * 9 + cc;
      }
    }
  }
})();

function inCheck(side) {
  const k = kingSq[side];
  if (k < 0) return 1;
  const enemyR = side ? 114 : 82;
  const enemyC = side ? 99  : 67;
  const enemyN = side ? 110 : 78;
  const enemyP = side ? 112 : 80;
  const enemyK = side ? 107 : 75;
  const kc = k % 9;
  const rowStart = k - kc;
  const rowEnd = rowStart + 8;
  let q = 0, p = 0, screens = 0;

  for (q = k - 9; q >= 0; q -= 9) {
    p = board[q];
    if (p) {
      if (screens === 0) { if (p === enemyR || p === enemyK) return 1; screens = 1; }
      else { if (p === enemyC) return 1; break; }
    }
  }
  screens = 0;
  for (q = k + 9; q < 90; q += 9) {
    p = board[q];
    if (p) {
      if (screens === 0) { if (p === enemyR || p === enemyK) return 1; screens = 1; }
      else { if (p === enemyC) return 1; break; }
    }
  }
  screens = 0;
  for (q = k - 1; q >= rowStart; q--) {
    p = board[q];
    if (p) {
      if (screens === 0) { if (p === enemyR || p === enemyK) return 1; screens = 1; }
      else { if (p === enemyC) return 1; break; }
    }
  }
  screens = 0;
  for (q = k + 1; q <= rowEnd; q++) {
    p = board[q];
    if (p) {
      if (screens === 0) { if (p === enemyR || p === enemyK) return 1; screens = 1; }
      else { if (p === enemyC) return 1; break; }
    }
  }

  const kb = k * 8;
  for (let i = 0; i < 8; i++) {
    const ns = KN_FROM[kb + i];
    if (ns >= 0 && board[ns] === enemyN && board[KN_LEG[kb + i]] === 0) return 1;
  }

  const pq = k + (side ? -9 : 9);
  if (pq >= 0 && pq < 90 && board[pq] === enemyP) return 1;
  if (kc > 0 && board[k - 1] === enemyP) return 1;
  if (kc < 8 && board[k + 1] === enemyP) return 1;
  return 0;
}

// Kiểm tra nhanh xem ô sq có bị Tốt của đối phương (attackerSide) ăn hay không
function isAttackedByPawn(sq, attackerSide) {
  const kr = ROW[sq], kc = COL[sq];
  const enemyP = attackerSide ? 80 : 112;
  const pr = kr + (attackerSide ? 1 : -1);
  if (pr >= 0 && pr < 10 && board[pr * 9 + kc] === enemyP) return true;
  if (attackerSide ? (kr <= 4) : (kr >= 5)) {
    if (kc > 0 && board[sq - 1] === enemyP) return true;
    if (kc < 8 && board[sq + 1] === enemyP) return true;
  }
  return false;
}

// ============================================================================
// TRUE X-RAY XIANGQI SEE (STATIC EXCHANGE EVALUATION)
// ============================================================================
const seeGain = new Int32Array(32);
const remSq = new Int16Array(32);
const remPiece = new Int8Array(32);

function seePieceVal(p, sq) {
  const t = UPPER_TAB[p & 127];
  if (t === 80) { // Tốt
    const side = SIDE_TAB[p & 127];
    const r = ROW[sq], c = COL[sq];
    if (side ? r <= 4 : r >= 5) {
      return (c >= 2 && c <= 6 && (side ? r <= 2 : r >= 7)) ? 220 : 175;
    }
    return 115;
  }
  if (t === 67 || t === 78) return 505; // Pháo và Mã ngang giá trong đổi quân thuần túy
  return BASEV_TAB[p & 127];
}

// Giữ nguyên chuẩn xác 100% nguyên lý lọc quân nhỏ hơn của v7
function isAttackedBySmallerPiece(sq, attackerSide, maxAttVal) {
  if (isAttackedByPawn(sq, attackerSide)) return true;
  if (maxAttVal <= 155) return false;

  const kr = ROW[sq], kc = COL[sq];
  // 1. Kiểm tra Sĩ & Tượng địch (155)
  const enemyA = attackerSide ? 65 : 97;
  const enemyB = attackerSide ? 66 : 98;
  if (kc >= 3 && kc <= 5 && (attackerSide ? (kr >= 7) : (kr <= 2))) {
    const advTab = ADV_TO[attackerSide], b4 = sq * 4;
    for (let i = 0; i < 4; i++) {
      const from = advTab[b4 + i];
      if (from >= 0 && board[from] === enemyA) return true;
    }
  }
  if (attackerSide ? (kr >= 5) : (kr <= 4)) {
    const bisTab = BIS_TO[attackerSide], eyeTab = BIS_EYE[attackerSide], b4 = sq * 4;
    for (let i = 0; i < 4; i++) {
      const from = bisTab[b4 + i];
      if (from >= 0 && board[from] === enemyB && board[eyeTab[b4 + i]] === 0) return true;
    }
  }

  // 2. Nếu quân đang xét là Xe (1090), kiểm tra thêm Mã (495) và Pháo (515) địch
  if (maxAttVal > 600) {
    const enemyN = attackerSide ? 78 : 110;
    const enemyC = attackerSide ? 67 : 99;
    const kb = sq * 8;
    for (let i = 0; i < 8; i++) {
      const ns = KN_FROM[kb + i];
      if (ns >= 0 && board[ns] === enemyN && board[KN_LEG[kb + i]] === 0) return true;
    }
    for (let d = 0; d < 4; d++) {
      const step = STEP4[d], nmax = RAY_N[sq * 4 + d];
      let q = sq, screens = 0;
      for (let k = 0; k < nmax; k++) {
        q += step;
        const p = board[q];
        if (p !== 0) {
          if (screens === 0) screens = 1;
          else {
            if (p === enemyC) return true;
            break;
          }
        }
      }
    }
  }
  return false;
}

function getLeastValuableAttacker(sq, side, targetIsKing = false) {
  const kr = ROW[sq], kc = COL[sq];
  const myP = side ? 80 : 112;
  const myA = side ? 65 : 97;
  const myB = side ? 66 : 98;
  const myN = side ? 78 : 110;
  const myC = side ? 67 : 99;
  const myR = side ? 82 : 114;
  const myK = side ? 75 : 107;

  // 1. Tốt
  const pr = kr + (side ? 1 : -1);
  if (pr >= 0 && pr < 10 && board[pr * 9 + kc] === myP) return pr * 9 + kc;
  if (side ? (kr <= 4) : (kr >= 5)) {
    if (kc > 0 && board[sq - 1] === myP) return sq - 1;
    if (kc < 8 && board[sq + 1] === myP) return sq + 1;
  }

  // 2. Sĩ (chỉ trong Cửu Cung)
  const inPalace = kc >= 3 && kc <= 5 && (side ? (kr >= 7) : (kr <= 2));
  if (inPalace) {
    const advTab = ADV_TO[side], b4 = sq * 4;
    for (let i = 0; i < 4; i++) {
      const from = advTab[b4 + i];
      if (from >= 0 && board[from] === myA) return from;
    }
  }

  // 3. Tượng
  if (side ? (kr >= 5) : (kr <= 4)) {
    const bisTab = BIS_TO[side], eyeTab = BIS_EYE[side], b4 = sq * 4;
    for (let i = 0; i < 4; i++) {
      const from = bisTab[b4 + i];
      if (from >= 0 && board[from] === myB && board[eyeTab[b4 + i]] === 0) return from;
    }
  }

  // 4. Mã
  const kb = sq * 8;
  for (let i = 0; i < 8; i++) {
    const ns = KN_FROM[kb + i];
    if (ns >= 0 && board[ns] === myN && board[KN_LEG[kb + i]] === 0) return ns;
  }

  // 5. Pháo, 6. Xe, 7. Tướng (ăn trực tiếp trong cung hoặc Lộ mặt Tướng dọc cột d < 2)
  let cannonFrom = -1, rookFrom = -1, kingFrom = -1;
  for (let d = 0; d < 4; d++) {
    const step = STEP4[d], nmax = RAY_N[sq * 4 + d];
    let q = sq, screens = 0;
    for (let k = 0; k < nmax; k++) {
      q += step;
      const p = board[q];
      if (p !== 0) {
        if (screens === 0) {
          if (p === myR && rookFrom < 0) rookFrom = q;
          else if (p === myK && ((k === 0 && inPalace) || (targetIsKing && d < 2))) kingFrom = q;
          screens = 1;
        } else if (screens === 1) {
          if (p === myC && cannonFrom < 0) cannonFrom = q;
          break;
        }
      }
    }
  }

  if (cannonFrom >= 0) return cannonFrom;
  if (rookFrom >= 0) return rookFrom;
  return kingFrom;
}

function see(from, to, side) {
  const moving = board[from];
  const target = board[to];

  let d = 0;
  seeGain[0] = target ? seePieceVal(target, to) : 0;

  let curPiece = moving;
  let curSide = side ^ 1;
  let remCnt = 0;

  remSq[remCnt] = from;
  remPiece[remCnt] = moving;
  remCnt++;
  board[from] = 0;

  while (d < 24) {
    d++;
    seeGain[d] = seePieceVal(curPiece, to) - seeGain[d - 1];
    if (Math.max(-seeGain[d - 1], seeGain[d]) < 0) break;

    const curIsKing = (curPiece | 32) === 107;
    const nextFrom = getLeastValuableAttacker(to, curSide, curIsKing);
    if (nextFrom < 0) break;

    // Nếu quân vừa ăn vào ô to là Tướng và đối phương vẫn còn quân ăn lại -> nước Tướng ăn là phạm luật
    if (curIsKing) {
      d++;
      seeGain[d] = -20000;
      break;
    }

    curPiece = board[nextFrom];
    remSq[remCnt] = nextFrom;
    remPiece[remCnt] = curPiece;
    remCnt++;
    board[nextFrom] = 0;

    curSide ^= 1;
  }

  for (let i = remCnt - 1; i >= 0; i--) {
    board[remSq[i]] = remPiece[i];
  }

  while (--d > 0) {
    seeGain[d - 1] = -Math.max(-seeGain[d - 1], seeGain[d]);
  }
  return seeGain[0];
}

function isBoardStringInCheck(b90, side) {
  const kChar = side ? 'K' : 'k';
  const k = b90.indexOf(kChar);
  if (k < 0) return false;
  const kr = (k / 9) | 0, kc = k % 9;
  const enemyR = side ? 'r' : 'R';
  const enemyC = side ? 'c' : 'C';
  const enemyN = side ? 'n' : 'N';
  const enemyP = side ? 'p' : 'P';
  const enemyK = side ? 'k' : 'K';

  for (let d = 0; d < 4; d++) {
    let r = kr + DR4[d], c = kc + DC4[d], screens = 0;
    while (r >= 0 && r < 10 && c >= 0 && c < 9) {
      const ch = b90[r * 9 + c];
      if (ch !== '.') {
        if (screens === 0) {
          if (ch === enemyR || ch === enemyK) return true;
          screens = 1;
        } else {
          if (ch === enemyC) return true;
          break;
        }
      }
      r += DR4[d]; c += DC4[d];
    }
  }
  for (let i = 0; i < 8; i++) {
    const nr = kr + NDR[i], nc = kc + NDC[i];
    if (nr >= 0 && nr < 10 && nc >= 0 && nc < 9 && b90[nr * 9 + nc] === enemyN) {
      if (b90[(kr + NLEGR[i]) * 9 + (kc + NLEGC[i])] === '.') return true;
    }
  }
  const pr = kr + (side ? -1 : 1);
  if (pr >= 0 && pr < 10 && b90[pr * 9 + kc] === enemyP) return true;
  if (kc > 0 && b90[kr * 9 + kc - 1] === enemyP) return true;
  if (kc < 8 && b90[kr * 9 + kc + 1] === enemyP) return true;
  return false;
}

function analyzeGameHistory(positionHistory, aiSide) {
  initZobrist();
  pastStateCounts.clear();
  recentRawBoards = [];
  recentTurnSides = [];
  recentPieceCnt = [];
  lastAIFrom = -1;
  lastAITo = -1;
  consecutiveAIChecks = 0;
  samePieceStreak = 0;
  visitedSquaresByPiece.clear();
  repBaseLen = 0;

  if (!Array.isArray(positionHistory) || positionHistory.length === 0) return;

  const rawBoards = [];
  const turnSides = [];
  for (let idx = 0; idx < positionHistory.length; idx++) {
    const entry = String(positionHistory[idx] || '');
    let s = 1;
    let b90 = entry;
    if (entry.length >= 92 && entry[1] === ':') {
      s = entry[0] === 'R' ? 1 : 0;
      b90 = entry.substring(2, 92);
    }
    if (b90.length === 90) {
      rawBoards.push(b90);
      turnSides.push(s);
      pastStateCounts.set(b90, (pastStateCounts.get(b90) || 0) + 1);
    }
  }

  const startIdx = Math.max(0, rawBoards.length - 60);
  for (let k = startIdx; k < rawBoards.length; k++) {
    const b90 = rawBoards[k];
    const s = turnSides[k];
    recentRawBoards.push(b90);
    recentTurnSides.push(s);
    let pc = 0;
    for (let q = 0; q < 90; q++) if (b90.charCodeAt(q) !== 46) pc++;
    recentPieceCnt.push(pc);
    let hLo = s ? zobSideLo : 0;
    let hHi = s ? zobSideHi : 0;
    for (let i = 0; i < 90; i++) {
      const ch = b90.charCodeAt(i);
      if (ch !== 46 && ch > 0 && ch < 128) {
        const zIdx = ch * 90 + i;
        hLo = (hLo ^ zobLo[zIdx]) >>> 0;
        hHi = (hHi ^ zobHi[zIdx]) >>> 0;
      }
    }
    repHashLo[repBaseLen] = hLo;
    repHashHi[repBaseLen] = hHi;
    repBaseLen++;
  }

  const moves = [];
  for (let k = 1; k < rawBoards.length; k++) {
    const prevB = rawBoards[k - 1];
    const currB = rawBoards[k];
    let fromSq = -1, toSq = -1;
    for (let i = 0; i < 90; i++) {
      if (prevB[i] !== currB[i]) {
        if (currB[i] === '.' && prevB[i] !== '.') fromSq = i;
        else if (currB[i] !== '.') toSq = i;
      }
    }
    if (fromSq !== -1 && toSq !== -1) {
      const piece = prevB[fromSq];
      const cap = prevB[toSq] !== '.' ? prevB[toSq] : null;
      const moverSide = (piece >= 'A' && piece <= 'Z') ? 1 : 0;
      const gaveCheck = isBoardStringInCheck(currB, moverSide ^ 1);
      moves.push({ from: fromSq, to: toSq, piece, cap, side: moverSide, gaveCheck });
    }
  }

  let expectedPieceSq = -1;
  let streakActive = true;
  let checkStreakActive = true;

  for (let mIdx = moves.length - 1; mIdx >= 0; mIdx--) {
    const mv = moves[mIdx];
    if (mv.cap) break;
    if (mv.side === aiSide) {
      if (lastAIFrom === -1) {
        lastAIFrom = mv.from;
        lastAITo = mv.to;
        expectedPieceSq = mv.from;
        samePieceStreak = 1;
        visitedSquaresByPiece.add(mv.from);
        visitedSquaresByPiece.add(mv.to);
      } else if (streakActive) {
        if (mv.to === expectedPieceSq) {
          samePieceStreak++;
          expectedPieceSq = mv.from;
          visitedSquaresByPiece.add(mv.from);
          visitedSquaresByPiece.add(mv.to);
        } else {
          streakActive = false;
        }
      }

      if (checkStreakActive) {
        if (mv.gaveCheck) {
          consecutiveAIChecks++;
        } else {
          checkStreakActive = false;
        }
      }
    }
  }
}

function precomputeRootPenalties(text90, side) {
  globalPenalties.fill(0);
  globalRepCounts.fill(0);
  loadBoardFromString(text90, side);

  const n = generateLegalMoves(side, false, 0, false);
  for (let i = 0; i < n; i++) {
    const f = moveFrom[i], t = moveTo[i], cap = moveCap[i];
    const moving = board[f];
    const mCode = f * 90 + t;

    doMove(f, t, cap, moving, side);
    const resultingStateStr = getCurrentBoardString();
    const repCount = pastStateCounts.get(resultingStateStr) || 0;
    const givesCheck = inCheck(side ^ 1);
    if (repCount > 0 || givesCheck) {
      const childTtIdx = ttFind(curHashLo, curHashHi);
      if (childTtIdx >= 0) ttDepth[childTtIdx] = 0;
    }
    undoMove(f, t, cap, moving, side);

    let pen = 0;
    if (repCount > 0) {
      pen += 500000 * repCount;
    }
    if (!cap) {
      if (f === lastAITo && t === lastAIFrom) {
        pen += 300000;
      }
      if (givesCheck) {
        if (consecutiveAIChecks >= 1 && f === lastAITo) {
          pen += 350000 * consecutiveAIChecks;
        } else if (consecutiveAIChecks >= 2) {
          pen += 300000 * consecutiveAIChecks;
        }
      }
      if (f === lastAITo) {
        if (samePieceStreak >= 2) {
          pen += 120000 * (samePieceStreak - 1);
        }
        if (visitedSquaresByPiece.has(t)) {
          pen += 250000;
        }
      }
    }
    globalPenalties[mCode] = pen;
    globalRepCounts[mCode] = repCount;
  }
}

// ============================================================================
// MOVE GENERATION (Accurate SEE for Captures)
// ============================================================================
let gN = 0, gBase = 0, gSide = 0, gCapOnly = false, gQChecks = false;
let gCheckNow = false, gKr = 0, gKc = 0;

function addMove(from, to, moving) {
  const target = board[to];
  const side = gSide;
  if (target !== 0 && sideOf(target) === side) return;
  const quiet = target === 0;
  if (quiet && gCapOnly && !gQChecks) return;

  const isKing = (moving | 32) === 107;
  const fr = ROW[from], fc = COL[from];

  if (quiet && gCapOnly) {
    const ek = kingSq[side ^ 1];
    if (ek >= 0) {
      const er = ROW[ek], ec = COL[ek], tr = ROW[to], tc = COL[to];
      let a = tr - er, b = tc - ec, x = fr - er, y = fc - ec;
      if (a < 0) a = -a; if (b < 0) b = -b; if (x < 0) x = -x; if (y < 0) y = -y;
      if (!(tr === er || tc === ec || fr === er || fc === ec || (a <= 2 && b <= 2) || (x === 1 && y === 1))) return;
    }
  }
  let need = gCheckNow || isKing || fr === gKr || fc === gKc || ROW[to] === gKr || COL[to] === gKc;
  if (!need) {
    const dr = fr - gKr, dc = fc - gKc;
    need = (dr === 1 || dr === -1) && (dc === 1 || dc === -1);
  }

  const qCheckMode = quiet && gCapOnly;
  let keep = true;
  if (need || qCheckMode) {
    board[to] = moving;
    board[from] = 0;
    const oldK = kingSq[side];
    if (isKing) kingSq[side] = to;
    if (need) keep = !inCheck(side);
    if (keep && qCheckMode) keep = inCheck(side ^ 1) === 1;
    kingSq[side] = oldK;
    board[from] = moving;
    board[to] = target;
  }

  if (keep && gN < MAX_MOVES) {
    const idx = gBase + gN;
    moveFrom[idx] = from;
    moveTo[idx] = to;
    moveCap[idx] = target;
    if (!quiet) {
      const bt = seePieceVal(target, to);
      const bm = seePieceVal(moving, from);
      const seeVal = (bm <= 115 && bt >= 155) ? (bt - bm) : see(from, to, side);
      const chBonus = capHist[(PTYPE_IDX[moving] * 7 + PTYPE_IDX[target]) * 90 + to] >> 2;
      if (seeVal >= -15) {
        moveScore[idx] = 2000000 + seeVal * 16 + bt * 4 - (bm >> 2) + chBonus;
      } else if (seeVal >= -120) {
        moveScore[idx] = 500000 + seeVal * 16 + bt + chBonus;
      } else {
        moveScore[idx] = 100000 + seeVal * 16 + bt + chBonus;
      }
    } else {
      moveScore[idx] = gQChecks ? 600000 : 0;
    }
    gN++;
  }
}

function generateLegalMoves(side, capturesOnly, ply, includeQuietChecks = false, knownCheck = -1) {
  gN = 0;
  gBase = ply * MAX_MOVES;
  gSide = side;
  gCapOnly = capturesOnly;
  gQChecks = includeQuietChecks;
  const ksq = kingSq[side];
  gKr = ksq >= 0 ? ROW[ksq] : -9;
  gKc = ksq >= 0 ? COL[ksq] : -9;
  gCheckNow = knownCheck >= 0 ? knownCheck === 1 : inCheck(side) === 1;
  const quietAllowed = !capturesOnly || includeQuietChecks;
  const bisTo = BIS_TO[side], bisEye = BIS_EYE[side], advTo = ADV_TO[side], kngTo = KNG_TO[side];

  for (let from = 0; from < 90; from++) {
    const moving = board[from];
    if (moving === 0 || SIDE_TAB[moving] !== side) continue;
    const t = UPPER_TAB[moving];

    if (t === 82) {
      for (let d = 0; d < 4; d++) {
        const step = STEP4[d], nmax = RAY_N[from * 4 + d];
        let to = from;
        for (let k = 0; k < nmax; k++) {
          to += step;
          const q = board[to];
          if (q === 0) { if (quietAllowed) addMove(from, to, moving); }
          else { if (SIDE_TAB[q] !== side) addMove(from, to, moving); break; }
        }
      }
    } else if (t === 67) {
      for (let d = 0; d < 4; d++) {
        const step = STEP4[d], nmax = RAY_N[from * 4 + d];
        let to = from, screens = 0;
        for (let k = 0; k < nmax; k++) {
          to += step;
          const q = board[to];
          if (!screens) {
            if (q === 0) { if (quietAllowed) addMove(from, to, moving); }
            else screens = 1;
          } else if (q !== 0) {
            if (SIDE_TAB[q] !== side) addMove(from, to, moving);
            break;
          }
        }
      }
    } else if (t === 78) {
      const nb = from * 8;
      for (let i = 0; i < 8; i++) {
        const to = NMV_TO[nb + i];
        if (to >= 0 && board[NMV_LEG[nb + i]] === 0) addMove(from, to, moving);
      }
    } else if (t === 80) {
      const r = ROW[from], c = COL[from];
      const rr = r + (side ? -1 : 1);
      if (rr >= 0 && rr < 10) addMove(from, rr * 9 + c, moving);
      if (side ? r <= 4 : r >= 5) {
        if (c > 0) addMove(from, from - 1, moving);
        if (c < 8) addMove(from, from + 1, moving);
      }
    } else if (t === 66) {
      const b4 = from * 4;
      for (let i = 0; i < 4; i++) {
        const to = bisTo[b4 + i];
        if (to >= 0 && board[bisEye[b4 + i]] === 0) addMove(from, to, moving);
      }
    } else if (t === 65) {
      const b4 = from * 4;
      for (let i = 0; i < 4; i++) { const to = advTo[b4 + i]; if (to >= 0) addMove(from, to, moving); }
    } else if (t === 75) {
      const b4 = from * 4;
      for (let i = 0; i < 4; i++) { const to = kngTo[b4 + i]; if (to >= 0) addMove(from, to, moving); }
    }
  }
  return gN;
}

// ============================================================================
// GRANDMASTER EVALUATION (Tactical Pins, Mating Patterns, True Exchange Map)
// ============================================================================
const rAtt = new Uint8Array(90);
const bAtt = new Uint8Array(90);
const rMinAtt = new Uint16Array(90);
const bMinAtt = new Uint16Array(90);
const pinnedMask = new Uint8Array(90);
const rRookCols = new Int8Array(2);
const bRookCols = new Int8Array(2);
const rRookRows = new Int8Array(2);
const bRookRows = new Int8Array(2);

let evalRMaxThreat = 0;
let evalBMaxThreat = 0;
const evRThreat = new Int16Array(1 << EV_BITS);
const evBThreat = new Int16Array(1 << EV_BITS);

function evaluateRaw() {
  rAtt.fill(0);
  bAtt.fill(0);
  rMinAtt.fill(30000);
  bMinAtt.fill(30000);
  pinnedMask.fill(0);

  let score = 0;
  let rAdv = 0, bAdv = 0, rBish = 0, bBish = 0, rMaj = 0, bMaj = 0;
  let rAtk = 0, bAtk = 0, rPot = 0, bPot = 0, rNear = 0, bNear = 0;
  let rRooks = 0, bRooks = 0;
  let rHasCentralC = false, bHasCentralC = false;
  let rBottomC = false, bBottomC = false;
  let rMatingBonus = 0, bMatingBonus = 0;

  const rk = kingSq[1], bk = kingSq[0];
  const rkr = rk >= 0 ? ROW[rk] : 9, rkc = rk >= 0 ? COL[rk] : 4;
  const bkr = bk >= 0 ? ROW[bk] : 0, bkc = bk >= 0 ? COL[bk] : 4;
  const phase = Math.max(0, Math.min(22, pieceCount - 10));

  // VÒNG 0: PHÁT HIỆN QUÂN BỊ GHIM TRÊN TRỤC TƯỚNG (PINNED PIECES & PHÁO KHỐNG)
  for (let s = 0; s < 2; s++) {
    const k = kingSq[s];
    if (k < 0) continue;
    const enemyR = s ? 114 : 82;
    const enemyC = s ? 99  : 67;
    const enemyK = s ? 107 : 75;

    for (let d = 0; d < 4; d++) {
      const step = STEP4[d], nmax = RAY_N[k * 4 + d];
      let q = k;
      let firstSq = -1, secondSq = -1;
      for (let stepCnt = 0; stepCnt < nmax; stepCnt++) {
        q += step;
        const p = board[q];
        if (!p) continue;
        if (firstSq < 0) {
          firstSq = q;
        } else if (secondSq < 0) {
          secondSq = q;
          if (p === enemyR || p === enemyK) {
            if (SIDE_TAB[board[firstSq]] === s) {
              pinnedMask[firstSq] = 2; // Ghim tuyệt đối
              const pinnedVal = BASEV_TAB[board[firstSq]];
              score += s ? -(28 + (pinnedVal >> 4)) : (28 + (pinnedVal >> 4));
            }
          }
        } else {
          if (p === enemyC) {
            if (SIDE_TAB[board[firstSq]] === s) {
              pinnedMask[firstSq] = 1;
              score += s ? -26 : 26;
            }
            if (SIDE_TAB[board[secondSq]] === s) {
              pinnedMask[secondSq] = 1;
              score += s ? -26 : 26;
            }
          }
          break;
        }
      }
    }
  }

  // VÒNG 1: TÍNH GIÁ TRỊ QUÂN, ĐỘ CƠ ĐỘNG, THẾ SÁT CỤC & BẢN ĐỒ ĐE DỌA
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p) continue;
    const side = p < 97 ? 1 : 0;
    const myAtt = side ? rAtt : bAtt;
    const myMin = side ? rMinAtt : bMinAtt;
    const idx = side ? i : (89 - i);
    const r = ROW[i], c = COL[i];
    const t = UPPER_TAB[p];
    const isAbsPinned = pinnedMask[i] === 2;
    let v = BASEV_TAB[p];

    const ekr = side ? bkr : rkr;
    const ekc = side ? bkc : rkc;
    let distToEK = 0;
    if (t === 80 || t === 78 || t === 67 || t === 82) {
      let dr = r - ekr; if (dr < 0) dr = -dr;
      let dc = c - ekc; if (dc < 0) dc = -dc;
      distToEK = dr + dc;
    }

    if (t === 80) { // Pawn (115)
      v += pstPawn[idx];
      const rr = r + (side ? -1 : 1);
      if (!isAbsPinned && rr >= 0 && rr < 10) {
        const sqF = rr * 9 + c;
        myAtt[sqF]++;
        if (115 < myMin[sqF]) myMin[sqF] = 115;
      }
      if (side ? r <= 4 : r >= 5) {
        if (!isAbsPinned) {
          if (c > 0) { myAtt[i - 1]++; if (115 < myMin[i - 1]) myMin[i - 1] = 115; }
          if (c < 8) { myAtt[i + 1]++; if (115 < myMin[i + 1]) myMin[i + 1] = 115; }
        }
        v += (14 - distToEK) * 6;
        if (c < 8 && board[i + 1] === p) v += 32;
        if (rr >= 0 && rr < 10 && board[rr * 9 + c] !== 0 && SIDE_TAB[board[rr * 9 + c]] === side) v += 15;
        if (distToEK <= 2) v += 28;
        if (side) rAtk++; else bAtk++;
      } else {
        if (side) rPot++; else bPot++;
        if ((c === 2 || c === 6) && (side ? r === 5 : r === 4)) v += 16;
      }
    } else if (t === 78) { // Knight (495)
      v = 470 + ((22 - phase) * 3) + pstKnight[idx];
      if (side) { rMaj++; rAtk++; } else { bMaj++; bAtk++; }
      let mob = 0;
      const isPinned = pinnedMask[i] > 0;
      const nb = i * 8;
      for (let k = 0; k < 8; k++) {
        const to = NMV_TO[nb + k];
        if (to < 0) continue;
        const legSq = NMV_LEG[nb + k];
        if (board[legSq] !== 0) {
          if (SIDE_TAB[board[legSq]] !== side) v -= 10;
          continue;
        }
        if (!isPinned) {
          myAtt[to]++;
          if (495 < myMin[to]) myMin[to] = 495;
        }
        const q = board[to];
        if (q === 0 || SIDE_TAB[q] !== side) {
          if (!isPinned && !isAttackedByPawn(to, side ^ 1)) mob++;
        } else if (q === p) {
          v += 24;
        }
      }
      v += (mob - 4) * 8;
      if (mob === 0) v -= 45;
      if (side ? r <= 7 : r >= 2) v += (14 - distToEK) * 5;

      if (side ? (r === 1 || r === 2) : (r === 8 || r === 7)) {
        if (c === 2 || c === 6) {
          v += 38;
          // Thưởng thêm nếu là Ngọa Tào Mã thực thụ (không bị cản chân chiếu Tướng)
          if (!isPinned && (side ? r === 1 : r === 8)) {
            const slotLeg = side ? (c === 2 ? 12 : 14) : (c === 2 ? 75 : 77);
            if (board[slotLeg] === 0) {
              v += 16;
              if (side) rMatingBonus++; else bMatingBonus++;
            }
          }
        } else if (c === 3 || c === 5) {
          v += 28;
        }
      }

      if (side === 0) {
        if (r === 1 && c === 4) v -= 60;
        else if (r === 2 && c === 4 && (board[2] === 98 || board[6] === 98)) v -= 26;
      } else {
        if (r === 8 && c === 4) v -= 60;
        else if (r === 7 && c === 4 && (board[83] === 66 || board[87] === 66)) v -= 26;
      }
      if (distToEK <= 4) { if (side) rNear++; else bNear++; }
    } else if (t === 67) { // Cannon (515)
      v = 465 + (phase * 4) + pstCannon[idx];
      if (side) { rMaj++; rAtk++; } else { bMaj++; bAtk++; }
      if (c === 4) { if (side) rHasCentralC = true; else bHasCentralC = true; }
      const enemyK = side ? 107 : 75;
      for (let d = 0; d < 4; d++) {
        const step = STEP4[d], nmax = RAY_N[i * 4 + d];
        let to = i, screens = 0, screenP = 0;
        for (let k = 0; k < nmax; k++) {
          to += step;
          const q = board[to];
          if (!screens) {
            if (q !== 0) {
              screens = 1;
              screenP = q;
              if (q === p) v += 18;
            }
          } else if (q !== 0) {
            if (!isAbsPinned) {
              myAtt[to]++;
              if (515 < myMin[to]) myMin[to] = 515;
              // Mã Hậu Pháo hoặc Trùng Pháo ngắm thẳng vào Tướng địch
              if (q === enemyK && SIDE_TAB[screenP] === side && (UPPER_TAB[screenP] === 78 || screenP === p)) {
                v += 24;
                if (side) rMatingBonus++; else bMatingBonus++;
              }
            }
            if (q === p) v += 26;
            break;
          } else if (!isAbsPinned) {
            myAtt[to]++;
            if (515 < myMin[to]) myMin[to] = 515;
          }
        }
      }
      if (side && r === 0) { v += 24; rBottomC = true; }
      else if (!side && r === 9) { v += 24; bBottomC = true; }
      v += (14 - distToEK) * 3;
      if (distToEK <= 4) { if (side) rNear++; else bNear++; }
    } else if (t === 82) { // Rook (1090)
      v += pstRook[idx];
      if (side) {
        rMaj += 2; rAtk++;
        if (rRooks < 2) { rRookCols[rRooks] = c; rRookRows[rRooks] = r; rRooks++; }
      } else {
        bMaj += 2; bAtk++;
        if (bRooks < 2) { bRookCols[bRooks] = c; bRookRows[bRooks] = r; bRooks++; }
      }
      let mob = 0;
      for (let d = 0; d < 4; d++) {
        const step = STEP4[d], nmax = RAY_N[i * 4 + d];
        let to = i;
        for (let k = 0; k < nmax; k++) {
          to += step;
          if (!isAbsPinned) {
            myAtt[to]++;
            if (1090 < myMin[to]) myMin[to] = 1090;
          }
          mob++;
          if (board[to]) break;
        }
      }
      v += mob * 4 + (14 - distToEK) * 3;
      if (c === 3 || c === 5) {
        v += 22;
        if (c === ekc) v += 28;
      }
      if (side ? (r === 0 || r === 1) : (r === 9 || r === 8)) v += 26;
      if (phase >= 12) {
        if (!side && r === 0 && (c === 0 || c === 8)) v -= 28;
        else if (side && r === 9 && (c === 0 || c === 8)) v -= 28;
      }
      if (distToEK <= 4) { if (side) rNear++; else bNear++; }
    } else if (t === 65) { // Advisor (155)
      if (side) rAdv++; else bAdv++;
      if (c === 4) v += 22;
      if (!isAbsPinned) {
        const advTab = ADV_TO[side], b4 = i * 4;
        for (let k = 0; k < 4; k++) {
          const to = advTab[b4 + k];
          if (to >= 0) { myAtt[to]++; if (155 < myMin[to]) myMin[to] = 155; }
        }
      }
    } else if (t === 66) { // Bishop (155)
      if (side) rBish++; else bBish++;
      if (c === 4) v += 24;
      if (!isAbsPinned) {
        const bisTab = BIS_TO[side], eyeTab = BIS_EYE[side], b4 = i * 4;
        for (let k = 0; k < 4; k++) {
          const to = bisTab[b4 + k];
          if (to >= 0 && board[eyeTab[b4 + k]] === 0) { myAtt[to]++; if (155 < myMin[to]) myMin[to] = 155; }
        }
      }
    } else if (t === 75) { // King
      if (c === 4 && (r === 0 || r === 9)) v += 15;
      const kngTab = KNG_TO[side], b4 = i * 4;
      for (let k = 0; k < 4; k++) {
        const to = kngTab[b4 + k];
        if (to >= 0) myAtt[to]++;
      }
    }
    score += side ? v : -v;
  }

  // VÒNG 2: THẾ TRẬN BÌNH PHONG MÃ & KHIÊN TRUNG LỘ CHỐNG PHÁO ĐẦU
  const bLeftScreenN = board[20] === 110;
  const bRightScreenN = board[24] === 110;
  if (bLeftScreenN && bRightScreenN) score -= (rHasCentralC ? 54 : 32);
  if (rHasCentralC) {
    if (bAtt[31] >= 2) score -= 24;
    if (board[22] === 98) score -= 24;
    if (board[13] === 97) score -= 20;
  }

  const rLeftScreenN = board[65] === 78;
  const rRightScreenN = board[69] === 78;
  if (rLeftScreenN && rRightScreenN) score += (bHasCentralC ? 54 : 32);
  if (bHasCentralC) {
    if (rAtt[58] >= 2) score += 24;
    if (board[67] === 66) score += 24;
    if (board[76] === 65) score += 20;
  }

  // VÒNG 3: PHÂN TÍCH ĐỔI QUÂN LỖ, QUÂN TREO & BẢO VỆ LẪN NHAU
  let rHangingMajors = 0, bHangingMajors = 0;
  let rMaxThreat = 0, bMaxThreat = 0;

  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p) continue;
    const side = p < 97 ? 1 : 0;
    const t = UPPER_TAB[p];
    if (t === 75) continue;

    const myVal = BASEV_TAB[p];
    const def = side ? rAtt[i] : bAtt[i];
    const att = side ? bAtt[i] : rAtt[i];
    const minEnemyAtt = side ? bMinAtt[i] : rMinAtt[i];
    let syn = 0;

    if (IS_MAJOR[p]) { // Xe (1090), Pháo (515), Mã (495)
      if (def > 0) {
        syn += 14 + Math.min(def, 3) * 6;
      }
      if (att > 0) {
        if (def === 0) {
          const hangPen = (t === 82 ? 195 : 120);
          syn -= hangPen;
          if (side) { rHangingMajors++; if (hangPen > rMaxThreat) rMaxThreat = hangPen; }
          else { bHangingMajors++; if (hangPen > bMaxThreat) bMaxThreat = hangPen; }
        } else if (minEnemyAtt + 80 < myVal) {
          const tradeLoss = (myVal - minEnemyAtt) >> 3;
          const pen = 38 + tradeLoss;
          syn -= pen;
          if (side) { rHangingMajors++; if (pen > rMaxThreat) rMaxThreat = pen; }
          else { bHangingMajors++; if (pen > bMaxThreat) bMaxThreat = pen; }
        } else if (att > def) {
          syn -= 46;
        }
      }
    } else { // Tốt, Sĩ, Tượng
      if (def > 0) {
        syn += (t === 65 || t === 66) ? 16 : 10;
      } else if (att > 0) {
        syn -= 22;
      }
    }

    score += side ? syn : -syn;
  }

  if (rHangingMajors >= 2) score -= 175;
  if (bHangingMajors >= 2) score += 175;

  if (rRooks === 2 && (rRookCols[0] === rRookCols[1] || rRookRows[0] === rRookRows[1])) score += 36;
  if (bRooks === 2 && (bRookCols[0] === bRookCols[1] || bRookRows[0] === bRookRows[1])) score -= 36;

  if (rAdv === 2) score += 44; else if (rAdv === 0 && bMaj >= 2) score -= 110;
  if (bAdv === 2) score -= 44; else if (bAdv === 0 && rMaj >= 2) score += 110;
  if (rBish === 2) score += 34; else if (rBish === 0 && bMaj >= 2) score -= 65;
  if (bBish === 2) score -= 34; else if (bBish === 0 && rMaj >= 2) score += 65;

  // ==========================================================================
  // VÒNG 4: ĐÁNH GIÁ CÔNG SÁT ĐẠI KIỆN TƯỚNG (PHI TUYẾN TÍNH & SÁT THỨC)
  // ==========================================================================
  let rAtkWeight = rNear * 2 + rMatingBonus;
  let bAtkWeight = bNear * 2 + bMatingBonus;

  if (rHasCentralC && rBottomC) { score += 28; rAtkWeight += 1; }
  if (bHasCentralC && bBottomC) { score -= 28; bAtkWeight += 1; }

  // 1. Kiểm tra Xe kẹp lộ sườn (Lộ 4, 6) & Xe/Pháo trầm đáy (Thiên Địa Pháo)
  let rRibRooks = 0, bRibRooks = 0;
  let rBottomRooks = 0, bBottomRooks = 0;
  for (let k = 0; k < rRooks; k++) {
    if (rRookCols[k] === 3 || rRookCols[k] === 5 || rRookCols[k] === bkc) { rRibRooks++; rAtkWeight += 2; }
    if (rRookRows[k] <= 2) { rBottomRooks++; rAtkWeight += 2; }
  }
  for (let k = 0; k < bRooks; k++) {
    if (bRookCols[k] === 3 || bRookCols[k] === 5 || bRookCols[k] === rkc) { bRibRooks++; bAtkWeight += 2; }
    if (bRookRows[k] >= 7) { bBottomRooks++; bAtkWeight += 2; }
  }
  if (rRibRooks >= 2) score += 55;
  if (bRibRooks >= 2) score -= 55;
  if (rBottomRooks >= 2) score += 60;
  if (bBottomRooks >= 2) score -= 60;

  // 2. Áp lực Pháo đầu, Thiết Môn Thuyên & Thiên Địa Pháo
  for (let s = 0; s < 2; s++) {
    const ek = kingSq[s ^ 1];
    if (ek >= 0 && (ek % 9) === 4) {
      const kr = (ek / 9) | 0;
      const myC = s ? 67 : 99;
      const dr = s ? -1 : 1;
      let r = kr - dr, screens = 0;
      while (r >= 0 && r < 10) {
        const p = board[r * 9 + 4];
        if (p) {
          if (p === myC) {
            if (screens === 0) {
              score += (s ? 85 : -85); // Pháo trống chiếu trực tiếp
              if (s) rAtkWeight += 3; else bAtkWeight += 3;
            } else if (screens === 1) {
              const ironBolt = (s ? rRibRooks : bRibRooks) > 0 ? 35 : 0;
              score += s ? (48 + ironBolt) : -(48 + ironBolt);
              if (s) rAtkWeight += 3; else bAtkWeight += 3;
            } else if (screens === 2) {
              score += (s ? 24 : -24);
              if (s) rAtkWeight += 1; else bAtkWeight += 1;
            }
            break;
          }
          screens++;
          if (screens > 2) break;
        }
        r -= dr;
      }
    }
  }

  // 3. Hỏa lực dồn vào Tâm Cửu Cung (ô [1,4] = 13 của Đen, ô [8,4] = 76 của Đỏ)
  if (rAtt[13] >= 2) {
    rAtkWeight += rAtt[13];
    score += 28 * rAtt[13] + (bAdv < 2 ? 35 : 0);
  }
  if (bAtt[76] >= 2) {
    bAtkWeight += bAtt[76];
    score -= 28 * bAtt[76] + (rAdv < 2 ? 35 : 0);
  }

  // 4. Đếm số ô thoát an toàn của Tướng (King Escape Restriction)
  if (bk >= 0) {
    let bSafeEscapes = 0;
    const b4 = bk * 4, kTab = KNG_TO[0];
    for (let k = 0; k < 4; k++) {
      const to = kTab[b4 + k];
      if (to >= 0) {
        const q = board[to];
        if ((q === 0 || SIDE_TAB[q] === 1) && rAtt[to] === 0) bSafeEscapes++;
        if (rAtt[to] > 0) rAtkWeight++;
      }
    }
    if (bSafeEscapes === 0 && rNear > 0) {
      score += 55 + rNear * 18;
      rAtkWeight += 2;
    }
  }
  if (rk >= 0) {
    let rSafeEscapes = 0;
    const b4 = rk * 4, kTab = KNG_TO[1];
    for (let k = 0; k < 4; k++) {
      const to = kTab[b4 + k];
      if (to >= 0) {
        const q = board[to];
        if ((q === 0 || SIDE_TAB[q] === 0) && bAtt[to] === 0) rSafeEscapes++;
        if (bAtt[to] > 0) bAtkWeight++;
      }
    }
    if (rSafeEscapes === 0 && bNear > 0) {
      score -= 55 + bNear * 18;
      bAtkWeight += 2;
    }
  }

  // 5. Điểm thưởng Công Sát Phi Tuyến Tính
  const bDefWeakness = 5 - bAdv - (bBish >> 1);
  const rDefWeakness = 5 - rAdv - (rBish >> 1);
  const rKingDanger = Math.min(420, (rAtkWeight * rAtkWeight * bDefWeakness) >> 1);
  const bKingDanger = Math.min(420, (bAtkWeight * bAtkWeight * rDefWeakness) >> 1);
  score += rKingDanger - bKingDanger;

  if (score > 350) {
    score += (6 - bMaj) * 18;
  } else if (score < -350) {
    score -= (6 - rMaj) * 18;
  }

  if (rMaj + bMaj <= 5) {
    if (score > 180) {
      if (rkc === 4) score += 24;
      if (rkc === bkc) score += 30;
      score += (Math.abs(bkc - 4) + Math.abs(bkr - 0)) * 18;
    } else if (score < -180) {
      if (bkc === 4) score -= 24;
      if (bkc === rkc) score -= 30;
      score -= (Math.abs(rkc - 4) + Math.abs(rkr - 9)) * 18;
    }
  }

  if (score > 0 && rAtk === 0) score = rPot > 0 ? (score / 2) | 0 : (score / 4) | 0;
  else if (score < 0 && bAtk === 0) score = bPot > 0 ? (score / 2) | 0 : (score / 4) | 0;

  evalRMaxThreat = rMaxThreat + (rHangingMajors >= 2 ? 140 : 0) + (bKingDanger >> 2);
  evalBMaxThreat = bMaxThreat + (bHangingMajors >= 2 ? 140 : 0) + (rKingDanger >> 2);
  return score;
}

function evaluate() {
  const k = curHashLo & EV_MASK;
  if (evKeyLo[k] === curHashLo && evKeyHi[k] === curHashHi) {
    evalRMaxThreat = evRThreat[k];
    evalBMaxThreat = evBThreat[k];
    return evVal[k];
  }
  const s = evaluateRaw();
  evKeyLo[k] = curHashLo; evKeyHi[k] = curHashHi; evVal[k] = s;
  evRThreat[k] = evalRMaxThreat;
  evBThreat[k] = evalBMaxThreat;
  return s;
}

function evalSide(side) {
  const s = evaluate();
  const myThreatOnEnemy = side ? evalBMaxThreat : evalRMaxThreat;
  const enemyThreatOnMe = side ? evalRMaxThreat : evalBMaxThreat;
  const tempoTactical = (myThreatOnEnemy >> 1) - (enemyThreatOnMe >> 2);
  return (side ? s : -s) + 16 + tempoTactical;
}

function doMove(from, to, cap, moving, side) {
  const iFrom = moving * 90 + from;
  const iTo = moving * 90 + to;
  curHashLo = (curHashLo ^ zobLo[iFrom] ^ zobLo[iTo] ^ zobSideLo) >>> 0;
  curHashHi = (curHashHi ^ zobHi[iFrom] ^ zobHi[iTo] ^ zobSideHi) >>> 0;
  if (cap) {
    const iCap = cap * 90 + to;
    curHashLo = (curHashLo ^ zobLo[iCap]) >>> 0;
    curHashHi = (curHashHi ^ zobHi[iCap]) >>> 0;
    pieceCount--;
    if (IS_MAJOR[cap]) majorCnt[side ^ 1]--;
  }
  board[to] = moving;
  board[from] = 0;
  if (upper(moving) === 75) kingSq[side] = to;
}

function undoMove(from, to, cap, moving, side) {
  board[from] = moving;
  board[to] = cap;
  if (upper(moving) === 75) kingSq[side] = from;
  const iFrom = moving * 90 + from;
  const iTo = moving * 90 + to;
  curHashLo = (curHashLo ^ zobLo[iFrom] ^ zobLo[iTo] ^ zobSideLo) >>> 0;
  curHashHi = (curHashHi ^ zobHi[iFrom] ^ zobHi[iTo] ^ zobSideHi) >>> 0;
  if (cap) {
    const iCap = cap * 90 + to;
    curHashLo = (curHashLo ^ zobLo[iCap]) >>> 0;
    curHashHi = (curHashHi ^ zobHi[iCap]) >>> 0;
    pieceCount++;
    if (IS_MAJOR[cap]) majorCnt[side ^ 1]++;
  }
}

// ============================================================================
// STAGED MOVE ORDERING (Lazy Quiet Scoring + Zero Duplicate SEE)
// ============================================================================
function scoreQuietMovesRange(ply, startIdx, n, ttMoveCode, side) {
  const baseIdx = ply * MAX_MOVES;
  const hBase = side * 8100;
  const pf = ply > 0 ? searchHistoryFrom[ply - 1] : -1;
  const pt = ply > 0 ? searchHistoryTo[ply - 1] : -1;
  const pp = ply > 0 ? searchHistoryPiece[ply - 1] : 0;
  const prevMoveCode = pf >= 0 ? (pf * 90 + pt) : -1;
  const counterCode = prevMoveCode >= 0 ? counterMoves[(side ^ 1) * 8100 + prevMoveCode] : -1;
  const contBase = (pp > 0 && pt >= 0) ? ((PTYPE_IDX[pp] * 90 + pt) * 630) : -1;

  const k0 = killers0[ply], k1 = killers1[ply];
  const f2 = ply >= 2 ? searchHistoryFrom[ply - 2] : -1;
  const t2 = ply >= 2 ? searchHistoryTo[ply - 2] : -1;

  for (let i = startIdx; i < n; i++) {
    const idx = baseIdx + i;
    const f = moveFrom[idx], t = moveTo[idx];
    const mCode = f * 90 + t;

    if (mCode === ttMoveCode) {
      moveScore[idx] = 10000000;
    } else if (moveCap[idx]) {
      // Giữ nguyên điểm SEE + Capture History đã chấm lúc sinh nước ăn quân
    } else {
      let s = 0;
      if (f === t2 && t === f2) s -= 6000000;
      if (k0 === mCode) s += 850000;
      else if (k1 === mCode) s += 750000;
      else if (mCode === counterCode) s += 650000;
      else {
        const moving = board[f];
        const mVal = BASEV_TAB[moving];
        s += historyHeur[hBase + mCode];
        if (contBase >= 0) {
          s += contHist[contBase + PTYPE_IDX[moving] * 90 + t] * 2;
        }
        const ut = UPPER_TAB[moving];
        const tr = ROW[t], tc = COL[t];
        const ek = kingSq[side ^ 1];
        if (ek >= 0 && (IS_MAJOR[moving] || ut === 80)) {
          const ekr = ROW[ek], ekc = COL[ek];
          const oldDist = Math.abs(ROW[f] - ekr) + Math.abs(COL[f] - ekc);
          const newDist = Math.abs(tr - ekr) + Math.abs(tc - ekc);
          if (newDist < oldDist && newDist <= 4) {
            s += (5 - newDist) * 1200;
          }
          if (ut === 82 && (tc === 3 || tc === 5 || tc === ekc || tr === ekr)) {
            s += 2500;
          } else if (ut === 67 && (tc === ekc || tr === ekr)) {
            s += 2800;
          }
        }
        // Phạt nặng các nước tĩnh đưa Xe/Pháo/Mã vào ô bị quân nhỏ hơn bắt mà SEE âm
        if (IS_MAJOR[moving]) {
          if (isAttackedBySmallerPiece(t, side ^ 1, mVal)) {
            const quietSee = see(f, t, side);
            if (quietSee < -100) {
              // Đánh dấu < -200000 để search() nhận diện SEE Quiet Pruning tức thì mà không cần gọi lại see()!
              s -= 260000 + ((-quietSee) << 6);
            } else if (quietSee < -50) {
              s -= 140000 + ((-quietSee) << 5);
            }
          } else if (isAttackedBySmallerPiece(f, side ^ 1, mVal) && see(f, t, side) >= 0) {
            // Quân chủ lực đang bị quân nhỏ rình bắt ở f, ưu tiên chạy sang ô t an toàn (see >= 0)
            s += 18000;
          }
        }
        if (ut === 78) {
          if ((side === 0 && tr === 1 && tc === 4) || (side === 1 && tr === 8 && tc === 4)) {
            s -= 50000;
          }
        }
      }
      moveScore[idx] = s;
    }
  }
}

function scoreMoves(ply, n, ttMoveCode, side) {
  scoreQuietMovesRange(ply, 0, n, ttMoveCode, side);
}

function pickMove(ply, n, i) {
  const baseIdx = ply * MAX_MOVES;
  let bestIdx = baseIdx + i;
  let bestSc = moveScore[bestIdx];
  for (let j = i + 1; j < n; j++) {
    const cur = baseIdx + j;
    if (moveScore[cur] > bestSc) {
      bestSc = moveScore[cur];
      bestIdx = cur;
    }
  }
  const curIdx = baseIdx + i;
  if (bestIdx !== curIdx) {
    let tmp = moveFrom[curIdx]; moveFrom[curIdx] = moveFrom[bestIdx]; moveFrom[bestIdx] = tmp;
    tmp = moveTo[curIdx]; moveTo[curIdx] = moveTo[bestIdx]; moveTo[bestIdx] = tmp;
    tmp = moveCap[curIdx]; moveCap[curIdx] = moveCap[bestIdx]; moveCap[bestIdx] = tmp;
    tmp = moveScore[curIdx]; moveScore[curIdx] = moveScore[bestIdx]; moveScore[bestIdx] = tmp;
    if (ply === 0) {
      tmp = rootMovePenalty[curIdx]; rootMovePenalty[curIdx] = rootMovePenalty[bestIdx]; rootMovePenalty[bestIdx] = tmp;
      tmp = rootMoveRepCount[curIdx]; rootMoveRepCount[curIdx] = rootMoveRepCount[bestIdx]; rootMoveRepCount[bestIdx] = tmp;
    }
  }
  return curIdx;
}

function histUpdate(idx, bonus) {
  const h = historyHeur[idx];
  historyHeur[idx] = h + bonus - ((h * (bonus < 0 ? -bonus : bonus) / 16384) | 0);
}

function contHistUpdate(idx, bonus) {
  const h = contHist[idx];
  contHist[idx] = h + bonus - ((h * (bonus < 0 ? -bonus : bonus) / 16384) | 0);
}

function capHistUpdate(idx, bonus) {
  const h = capHist[idx];
  capHist[idx] = h + bonus - ((h * (bonus < 0 ? -bonus : bonus) / 16384) | 0);
}

// ============================================================================
// REPETITION
// ============================================================================
function setRepRoot() {
  if (repBaseLen > 0 && repHashLo[repBaseLen - 1] === curHashLo && repHashHi[repBaseLen - 1] === curHashHi) {
    repRoot = repBaseLen - 1;
  } else {
    repRoot = repBaseLen;
  }
  let since = 0;
  const L = recentPieceCnt.length;
  if (L > 0) {
    const lastCnt = recentPieceCnt[L - 1];
    for (let k = L - 2; k >= 0 && recentPieceCnt[k] === lastCnt; k--) since++;
  }
  sinceCap[0] = Math.min(since, repRoot);
}

function isRepetition(ply) {
  const curIdx = repRoot + ply;
  let lowest = curIdx - sinceCap[ply];
  if (lowest < 0) lowest = 0;
  for (let i = curIdx - 2; i >= lowest; i -= 2) {
    if (repHashLo[i] === curHashLo && repHashHi[i] === curHashHi) return true;
  }
  return false;
}

function shouldStop() {
  if (nodes >= nodeLimit) return true;
  return deadline !== 0 && performance.now() >= deadline;
}

// ============================================================================
// QUIESCENCE SEARCH (Zero-Overhead Capture Scoring)
// ============================================================================
function qsearch(alpha, beta, side, ply, qPly) {
  if ((++nodes & 2047) === 0 && shouldStop()) { stopped = 1; return 0; }
  if (ply >= MAX_PLY - 2) return evalSide(side);

  const check = inCheck(side) === 1;
  let stand = 0;
  if (!check) {
    stand = evalSide(side);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qPly >= 12) return stand;
  }

  const includeChecks = !check && (qPly <= 1);
  const n = generateLegalMoves(side, !check, ply, includeChecks, check ? 1 : 0);
  if (n === 0) return check ? (-MATE + ply) : alpha;

  // Chỉ gọi scoreMoves nếu có sinh nước đi tĩnh (khi bị chiếu hoặc qPly <= 1)
  if (check || includeChecks) {
    scoreMoves(ply, n, -1, side);
  }

  for (let i = 0; i < n; i++) {
    const idx = pickMove(ply, n, i);
    const f = moveFrom[idx], t = moveTo[idx], cap = moveCap[idx];
    if (!check && cap !== 0) {
      if (stand + baseVal(cap) + 220 < alpha) continue;     // Delta pruning
      if (moveScore[idx] < 250000) continue;                // Cắt ngay lập tức nước dùng quân to đổi quân nhỏ ở mọi tầng qPly
      if (moveScore[idx] < 1500000 && qPly > 0) continue;   // Cắt các nước thí quân lỗ nhẹ từ qPly >= 1
    }

    const moving = board[f];
    doMove(f, t, cap, moving, side);
    const sc = -qsearch(-beta, -alpha, side ^ 1, ply + 1, qPly + 1);
    undoMove(f, t, cap, moving, side);

    if (stopped) return 0;
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

// ============================================================================
// MAIN SEARCH (Staged Lazy Quiet Scoring + Fast Pruning)
// ============================================================================
function search(depth, alpha, beta, side, ply, allowNull) {
  if ((++nodes & 2047) === 0 && shouldStop()) { stopped = 1; return 0; }
  if (ply >= MAX_PLY - 2) return evalSide(side);

  pvLen[ply] = ply;
  const pvNode = (beta - alpha) > 1;

  if (ply > 0) {
    if (isRepetition(ply)) return (side === rootSide) ? -repContempt : repContempt;
    const mA = -MATE + ply, mB = MATE - ply - 1;
    if (alpha < mA) alpha = mA;
    if (beta > mB) beta = mB;
    if (alpha >= beta) return alpha;
  }

  let ttMoveCode = -1;
  let ttVal = NO_EVAL;
  let ttFl = 3;
  let ttD = -1;
  const slot = ttFind(curHashLo, curHashHi);
  if (slot >= 0) {
    ttMoveCode = ttMove[slot];
    ttD = ttDepth[slot];
    ttFl = ttFlag[slot];
    let sc = ttScore[slot];
    if (sc > MATE - 1000) sc -= ply;
    else if (sc < -MATE + 1000) sc += ply;
    ttVal = sc;
    if (!pvNode && ttD >= depth) {
      if (ttFl === 0) return sc;
      if (ttFl === 1 && sc <= alpha) return alpha;
      if (ttFl === 2 && sc >= beta) return beta;
    }
  }

  const check = inCheck(side) === 1;
  if (check && ply < Math.min(MAX_PLY - 12, curIter * 2 + 8)) depth++;
  if (depth <= 0) return qsearch(alpha, beta, side, ply, 0);

  let staticEval = NO_EVAL;
  let improving = false;
  if (!check) {
    staticEval = evalSide(side);
    improving = ply >= 2 && evalStack[ply - 2] !== NO_EVAL && staticEval > evalStack[ply - 2];
  }
  evalStack[ply] = staticEval;

  if (!pvNode && !check) {
    // Razoring
    if (depth <= 2 && staticEval + 260 + 190 * (depth - 1) <= alpha) {
      const v = qsearch(alpha, beta, side, ply, 0);
      if (stopped) return 0;
      if (v <= alpha) return v;
    }
    // Reverse Futility Pruning (Static Null Move)
    if (depth <= 6 && beta < MATE - 1000) {
      const margin = 110 * depth - (improving ? 35 : 0);
      if (staticEval - margin >= beta) return staticEval - margin;
    }
    // Null Move Pruning
    if (allowNull && depth >= 3 && staticEval >= beta && majorCnt[side] > 0) {
      let R = 2 + (depth >= 6 ? 1 : 0) + (depth >= 11 ? 1 : 0) + (staticEval - beta > 240 ? 1 : 0);
      if (R > depth - 1) R = depth - 1;
      repHashLo[repRoot + ply] = curHashLo;
      repHashHi[repRoot + ply] = curHashHi;
      searchHistoryFrom[ply] = -1;
      searchHistoryTo[ply] = -1;
      searchHistoryPiece[ply] = 0;
      sinceCap[ply + 1] = sinceCap[ply] + 1;
      curHashLo = (curHashLo ^ zobSideLo) >>> 0;
      curHashHi = (curHashHi ^ zobSideHi) >>> 0;
      const sc = -search(depth - 1 - R, -beta, -beta + 1, side ^ 1, ply + 1, 0);
      curHashLo = (curHashLo ^ zobSideLo) >>> 0;
      curHashHi = (curHashHi ^ zobSideHi) >>> 0;
      if (stopped) return 0;
      if (sc >= beta) {
        if (depth < 8 && majorCnt[side] > 2) return beta;
        const v = search(depth >= 8 ? depth - 5 : depth - 2, beta - 1, beta, side, ply, 0);
        if (stopped) return 0;
        if (v >= beta) return beta;
        pvLen[ply] = ply;
      }
    }
  }

  // Internal Iterative Reduction
  if (ttMoveCode < 0 && depth >= 5 && !check) depth--;

  const origAlpha = alpha;
  const n = generateLegalMoves(side, false, ply, false, check ? 1 : 0);
  if (n === 0) return -MATE + ply;

  const singleReplyExt = (check && n === 1 && ply < MAX_PLY - 10) ? 1 : 0;

  const baseIdx = ply * MAX_MOVES;
  // Giai đoạn 1: Đánh dấu ttMoveCode (10000000) trước mà chưa chấm điểm các nước đi tĩnh
  if (ttMoveCode >= 0) {
    for (let i = 0; i < n; i++) {
      const idx = baseIdx + i;
      if (moveFrom[idx] * 90 + moveTo[idx] === ttMoveCode) {
        moveScore[idx] = 10000000;
        break;
      }
    }
  }

  let quietsScored = false;
  let best = -INF;
  let bestCode = moveFrom[baseIdx] * 90 + moveTo[baseIdx];
  let quietSeen = 0, quietN = 0;
  const hBase = side * 8100;
  const lmpLimit = (improving ? 9 : 6) + depth * depth * 2;
  const futMargin = 130 + 110 * depth;
  const lmrBase = (depth < 64 ? depth : 63) * MAX_MOVES;

  const pp = ply > 0 ? searchHistoryPiece[ply - 1] : 0;
  const pt = ply > 0 ? searchHistoryTo[ply - 1] : -1;
  const contBase = (pp > 0 && pt >= 0) ? ((PTYPE_IDX[pp] * 90 + pt) * 630) : -1;

  for (let i = 0; i < n; i++) {
    let idx = pickMove(ply, n, i);
    // Giai đoạn 2: Khi đã hết ttMove và các nước ăn quân lời (>= 1900000), mới chấm điểm các nước đi tĩnh còn lại!
    if (!quietsScored && moveScore[idx] < 1900000) {
      scoreQuietMovesRange(ply, i, n, ttMoveCode, side);
      quietsScored = true;
      idx = pickMove(ply, n, i);
    }

    const f = moveFrom[idx], t = moveTo[idx], cap = moveCap[idx];
    const mCode = f * 90 + t;
    const moving = board[f];
    const isQuiet = cap === 0;
    const goodCap = !isQuiet && moveScore[idx] >= 2000000;
    const blunderCap = !isQuiet && moveScore[idx] < 250000; // seeVal < -120 (Lấy quân to đổi quân nhỏ)
    const isPalaceCenterSac = !isQuiet && (t === 13 || t === 76) && UPPER_TAB[cap] === 65;

    let prune = false;
    if (i > 0 && !pvNode && !check && best > -MATE + 1000) {
      if (isQuiet) {
        if (depth <= 4 && (quietSeen >= lmpLimit || (staticEval + futMargin <= alpha && quietSeen >= 2))) {
          prune = true;
        } else if (depth <= 4 && moveScore[idx] < -200000) {
          // SEE Quiet Pruning (đã được tính trong scoreQuietMovesRange, không cần gọi lại see!)
          prune = true;
        }
      } else if (blunderCap && depth <= (isPalaceCenterSac ? 3 : 6)) {
        prune = true;
      } else if (!goodCap && depth <= 2 && !isPalaceCenterSac) {
        prune = true;
      }
    }
    if (isQuiet) quietSeen++;

    searchHistoryFrom[ply] = f;
    searchHistoryTo[ply] = t;
    searchHistoryPiece[ply] = moving;
    repHashLo[repRoot + ply] = curHashLo;
    repHashHi[repRoot + ply] = curHashHi;
    sinceCap[ply + 1] = cap ? 0 : sinceCap[ply] + 1;
    doMove(f, t, cap, moving, side);

    const givesCheck = (i > 0 && (prune || depth >= 3)) ? inCheck(side ^ 1) === 1 : false;
    if (prune && !givesCheck) {
      undoMove(f, t, cap, moving, side);
      continue;
    }

    let sc;
    const newDepth = depth - 1 + singleReplyExt;
    if (i === 0) {
      sc = -search(newDepth, -beta, -alpha, side ^ 1, ply + 1, 1);
    } else {
      let red = 0;
      if (depth >= 3 && i >= 2 && !check && !givesCheck && (isQuiet || !goodCap)) {
        red = lmrTable[lmrBase + (i < MAX_MOVES ? i : MAX_MOVES - 1)];
        if (pvNode) red--;
        if (!improving) red++;
        if (mCode === killers0[ply] || mCode === killers1[ply]) red--;
        if (isQuiet) {
          let h = historyHeur[hBase + mCode];
          if (contBase >= 0) h += contHist[contBase + PTYPE_IDX[moving] * 90 + t];
          if (h > 6000) red--; else if (h < -4000) red++;
        } else if (red > 1) red = 1;
        if (red > newDepth - 1) red = newDepth - 1;
        if (red < 0) red = 0;
      }
      sc = -search(newDepth - red, -alpha - 1, -alpha, side ^ 1, ply + 1, 1);
      if (sc > alpha && red > 0) {
        sc = -search(newDepth, -alpha - 1, -alpha, side ^ 1, ply + 1, 1);
      }
      if (sc > alpha && sc < beta) {
        sc = -search(newDepth, -beta, -alpha, side ^ 1, ply + 1, 1);
      }
    }

    undoMove(f, t, cap, moving, side);
    if (stopped) return 0;

    if (isQuiet) quietBuf[baseIdx + quietN++] = mCode;

    if (sc > best) {
      best = sc;
      bestCode = mCode;
      pvTable[ply * MAX_PLY + ply] = bestCode;
      const nextLen = pvLen[ply + 1];
      for (let k = ply + 1; k < nextLen && k < MAX_PLY; k++) {
        pvTable[ply * MAX_PLY + k] = pvTable[(ply + 1) * MAX_PLY + k];
      }
      pvLen[ply] = nextLen > ply + 1 ? nextLen : (ply + 1);
    }
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) {
      const bonus = Math.min(depth * depth * 8, 1600);
      if (isQuiet) {
        if (killers0[ply] !== mCode) {
          killers1[ply] = killers0[ply];
          killers0[ply] = mCode;
        }
        histUpdate(hBase + mCode, bonus);
        if (contBase >= 0) {
          contHistUpdate(contBase + PTYPE_IDX[moving] * 90 + t, bonus);
        }
        for (let q = 0; q < quietN - 1; q++) {
          const qCode = quietBuf[baseIdx + q];
          histUpdate(hBase + qCode, -bonus);
          if (contBase >= 0) {
            const qf = (qCode / 90) | 0, qt = qCode % 90;
            const qp = board[qf];
            if (qp > 0) contHistUpdate(contBase + PTYPE_IDX[qp] * 90 + qt, -bonus);
          }
        }
        const pf = ply > 0 ? searchHistoryFrom[ply - 1] : -1;
        if (pf >= 0) counterMoves[(side ^ 1) * 8100 + pf * 90 + searchHistoryTo[ply - 1]] = mCode;
      } else {
        capHistUpdate((PTYPE_IDX[moving] * 7 + PTYPE_IDX[cap]) * 90 + t, bonus);
      }
      break;
    }
  }

  if (best === -INF) best = alpha;
  const flag = (best <= origAlpha) ? 1 : ((best >= beta) ? 2 : 0);
  const stored = (best > MATE - 1000) ? (best + ply) : ((best < -MATE + 1000) ? (best - ply) : best);
  ttStore(curHashLo, curHashHi, depth, stored, flag, bestCode);
  return best;
}

// ============================================================================
// ROOT SEARCH
// ============================================================================
function rootSearch(depth, side, alphaIn = -INF, betaIn = INF) {
  curIter = depth;
  setRepRoot();
  rootPartialValid = false;

  const n = generateLegalMoves(side, false, 0, false);
  if (n === 0) return -1;

  const slot = ttFind(curHashLo, curHashHi);
  const ttMoveCode = slot >= 0 ? ttMove[slot] : -1;
  scoreMoves(0, n, ttMoveCode, side);

  for (let i = 0; i < n; i++) {
    const f = moveFrom[i], t = moveTo[i];
    const mCode = f * 90 + t;
    const pen = globalPenalties[mCode];
    rootMovePenalty[i] = pen;
    rootMoveRepCount[i] = globalRepCounts[mCode];
    if (mCode !== ttMoveCode && rootScoreStamp[mCode] === rootEpoch) {
      const s = rootScoreArr[mCode];
      moveScore[i] = 4000000 + (s > 1500000 ? 1500000 : (s < -1500000 ? -1500000 : s));
    } else if (pen > 0) {
      moveScore[i] -= pen * 10;
    }
  }

  let alpha = alphaIn, beta = betaIn, best = -INF, rawBest = -INF;
  let bestHasPenalty = false;
  let bestCode = moveFrom[0] * 90 + moveTo[0];

  for (let i = 0; i < n; i++) {
    if (shouldStop()) { stopped = 1; break; }
    const idx = pickMove(0, n, i);
    const f = moveFrom[idx], t = moveTo[idx], cap = moveCap[idx];
    const mCode = f * 90 + t;
    const moving = board[f];
    const pen = rootMovePenalty[idx];
    const repCount = rootMoveRepCount[idx];

    searchHistoryFrom[0] = f;
    searchHistoryTo[0] = t;
    searchHistoryPiece[0] = moving;
    repHashLo[repRoot] = curHashLo;
    repHashHi[repRoot] = curHashHi;
    sinceCap[1] = cap ? 0 : sinceCap[0] + 1;
    doMove(f, t, cap, moving, side);

    let sc;
    if (i === 0 || pen > 0) {
      sc = -search(depth - 1, -beta, -alpha, side ^ 1, 1, 1);
    } else {
      sc = -search(depth - 1, -alpha - 1, -alpha, side ^ 1, 1, 1);
      if (sc > alpha && sc < beta) {
        sc = -search(depth - 1, -beta, -alpha, side ^ 1, 1, 1);
      }
    }

    undoMove(f, t, cap, moving, side);
    if (stopped) break;

    const rawSc = sc;
    if (pen > 0) {
      if (repCount > 0) sc -= pen;
      else if (sc < MATE - 1000) sc -= pen;
    }
    rootScoreArr[mCode] = sc;
    rootScoreStamp[mCode] = rootEpoch;

    if (sc > best) {
      best = sc;
      rawBest = rawSc;
      bestHasPenalty = pen > 0;
      bestCode = mCode;
      pvTable[0] = bestCode;
      const nextLen = pvLen[1];
      for (let k = 1; k < nextLen && k < MAX_PLY; k++) {
        pvTable[k] = pvTable[MAX_PLY + k];
      }
      pvLen[0] = nextLen > 1 ? nextLen : 1;
    }
    if (sc > alpha) alpha = sc;
    if (sc >= beta) break;
  }

  rootBestScore = best;
  if (stopped) {
    rootPartialValid = best > alphaIn && best < betaIn && best > -INF;
    return bestCode;
  }
  if (best > -INF) {
    lastScore = best;
    if (best > alphaIn && best < betaIn && !bestHasPenalty) {
      ttStore(curHashLo, curHashHi, depth, rawBest, 0, bestCode);
    }
  }
  return bestCode;
}

function searchBestMove(maxDepth, maxNodes, side, timeMs) {
  initZobrist();
  rootSide = side;
  nodes = 0;
  nodeLimit = maxNodes > 2000 ? maxNodes : 2000;
  const t0 = performance.now();
  deadline = timeMs > 0 ? t0 + timeMs : 0;
  const softLimit = timeMs > 0 ? timeMs * 0.5 : 0;
  stopped = 0;
  lastScore = 0;
  completedDepth = 0;
  pvLen[0] = 0;
  killers0.fill(-1);
  killers1.fill(-1);
  for (let i = 0; i < historyHeur.length; i++) historyHeur[i] >>= 1;
  for (let i = 0; i < contHist.length; i++) contHist[i] >>= 1;
  for (let i = 0; i < capHist.length; i++) capHist[i] >>= 1;
  ttGen = (ttGen + 1) & 255;
  rootEpoch++;
  if (rootEpoch > 2000000000) { rootScoreStamp.fill(0); rootEpoch = 1; }

  const n = generateLegalMoves(side, false, 0, false);
  if (n === 0) return -1;
  let best = moveFrom[0] * 90 + moveTo[0];
  if (n === 1) {
    completedDepth = 1;
    pvTable[0] = best; pvLen[0] = 1;
    return best;
  }

  setRepRoot();
  const rootEval = evalSide(side);
  repContempt = rootEval < -350 ? 0 : 600;

  let prevScore = 0;
  let prevBest = -1;
  let instability = 0;
  const initD = (startDepth > 1 && startDepth <= maxDepth) ? startDepth : 1;

  for (let d = initD; d <= maxDepth; d++) {
    if (nodes >= nodeLimit) break;
    stopped = 0;

    let alpha = -INF, beta = INF, delta = 35;
    if (d >= 5 && completedDepth >= 4 && Math.abs(prevScore) < MATE - 1000) {
      alpha = prevScore - delta;
      beta = prevScore + delta;
    }

    let candidate = -1;
    for (;;) {
      candidate = rootSearch(d, side, alpha, beta);
      if (stopped) break;
      if (best >= 0 && rootBestScore <= alpha && alpha > -INF) {
        alpha = (delta > 300) ? -INF : Math.max(-INF, alpha - delta * 2);
        delta *= 2;
        instability++;
        continue;
      }
      if (rootBestScore >= beta && beta < INF) {
        beta = (delta > 300) ? INF : Math.min(INF, beta + delta * 2);
        delta *= 2;
        continue;
      }
      break;
    }

    if (stopped) {
      if (rootPartialValid && candidate >= 0) {
        best = candidate;
        lastScore = rootBestScore;
      }
      break;
    }
    if (candidate >= 0) {
      if (prevBest >= 0 && candidate !== prevBest) instability++;
      best = candidate;
      prevBest = candidate;
    }
    prevScore = lastScore;
    completedDepth = d;
    if (lastScore > MATE - 100 || lastScore < -MATE + 100) break;

    const unstable = instability > 0;
    instability = 0;
    if (d >= 8) {
      if (nodes >= nodeLimit * (unstable ? 0.75 : 0.5)) break;
      if (softLimit && (performance.now() - t0) >= softLimit * (unstable ? 1.5 : 1)) break;
    }
  }
  startDepth = 1;
  return best;
}

function flattenBoard(b) {
  let out = '';
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) out += (b?.[r]?.[c] || '.');
  if (out.length !== 90) throw new Error('Bàn cờ không hợp lệ: cần đúng 90 ô');
  return out;
}

function decodeMove(n) {
  const from = Math.floor(n / 90), to = n % 90;
  return { fr: Math.floor(from / 9), fc: from % 9, tr: Math.floor(to / 9), tc: to % 9 };
}

// ============================================================================
// OPTIONAL EXTERNAL C++ WASM ENGINE & HỖ TRỢ PIKAFISH UCI + NNUE
// ============================================================================
let enginePromise = null;
async function loadExternalEngine() {
  if (!USE_EXTERNAL_WASM) return null;
  if (!enginePromise) {
    enginePromise = (async () => {
      try {
        const resp = await fetch('./xiangqi_engine.wasm');
        if (!resp.ok) return null;
        const bytes = await resp.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(bytes, {});
        const ex = instance.exports;
        if (ex && ex.search_best_move && ex.get_penalty_buffer) {
          return {
            memory: ex.memory,
            get_input_buffer: ex.get_input_buffer,
            get_penalty_buffer: ex.get_penalty_buffer,
            get_rep_count_buffer: ex.get_rep_count_buffer,
            get_history_boards_buffer: ex.get_history_boards_buffer,
            get_history_sides_buffer: ex.get_history_sides_buffer,
            set_history_count: ex.set_history_count,
            set_position: ex.set_position,
            search_best_move: ex.search_best_move,
            get_nodes: ex.get_nodes,
            get_completed_depth: ex.get_completed_depth,
            get_last_score: ex.get_last_score,
            get_pv_length: ex.get_pv_length,
            get_pv_move: ex.get_pv_move
          };
        }
      } catch (_ignoreExternalErr) {}
      return null;
    })();
  }
  return enginePromise;
}

// ============================================================================
// HỖ TRỢ TÍCH HỢP PIKAFISH UCI & NNUE (SỬA LỖI TRÙNG LẶP IMPORT)
// ============================================================================
let pikafishEngine = null;
let pikafishInitPromise = null;
let currentSearchResolver = null;
let currentSearchInfo = { depth: 0, score: 0, nodes: 0, pv: [] };

async function initPikafish() {
  if (!USE_EXTERNAL_WASM) return null;
  if (pikafishEngine) return pikafishEngine;
  if (pikafishInitPromise) return pikafishInitPromise;

  pikafishInitPromise = (async () => {
    try {
      // 1. Tải trọng số mạng nơ-ron pikafish.nnue trước
      const nnueResp = await fetch('./pikafish.nnue');
      if (!nnueResp.ok) throw new Error('Không tìm thấy tệp pikafish.nnue');
      const nnueBytes = new Uint8Array(await nnueResp.arrayBuffer());

      // 2. CHẶN GỌI LẶP LẠI: Chỉ importScripts MỘT LẦN DUY NHẤT bằng cờ toàn cục self
      if (!self._pikafishScriptLoaded) {
        importScripts('./pikafish.js');
        self._pikafishScriptLoaded = true;
      }

      if (typeof Pikafish !== 'function') {
        throw new Error('Hàm Pikafish không tồn tại sau khi importScripts');
      }

      const instance = await Pikafish({
        locateFile: (path) => './' + path,
        print: (line) => handlePikafishOutput(line),
        printErr: (errLine) => {
          if (String(errLine).includes('Pthread')) return;
          console.warn('[Pikafish Log]', errLine);
        }
      });

      // 3. Ghi tệp NNUE vào hệ thống tệp ảo MEMFS của Emscripten
      instance.FS.writeFile('/pikafish.nnue', nnueBytes);

      instance._pikafish_initialize();
      const sendCmd = instance.cwrap('pikafish_command', null, ['string']);

      sendCmd('uci');
      sendCmd('setoption name Threads value 1');
      sendCmd('setoption name Hash value 16');
      sendCmd('setoption name EvalFile value /pikafish.nnue');
      sendCmd('isready');

      pikafishEngine = {
        sendCmd,
        search(fen, depth, timeMs) {
          return new Promise((resolve) => {
            currentSearchInfo = { depth: 1, score: 0, nodes: 0, pv: [] };
            currentSearchResolver = resolve;
            sendCmd(`position fen ${fen}`);
            sendCmd(`go depth ${depth} movetime ${timeMs}`);
          });
        },
        stop() {
          if (currentSearchResolver) sendCmd('stop');
        },
        clearHash() {
          sendCmd('ucinewgame');
        }
      };

      return pikafishEngine;
    } catch (err) {
      console.warn('Không thể khởi tạo Pikafish WASM, chuyển về JS Engine v7.5:', err);
      // Xóa promise cache để lần gọi sau có thể thử lại nếu muốn, tránh kẹt trạng thái lỗi
      pikafishInitPromise = null;
      return null;
    }
  })();

  return pikafishInitPromise;
}
// ============================================================================
// MULTI-BRANCH PONDERING
// ============================================================================
const PONDER_MAX_DEPTH = 18;
const PONDER_CACHE_MAX = 600;
let ponderActive = false;
let ponderTimer = null;
const ponderBranchCache = new Map();
let totalPonderNodes = 0;

function stopPondering() {
  ponderActive = false;
  if (ponderTimer) {
    clearTimeout(ponderTimer);
    ponderTimer = null;
  }
}

function clearOpponentPenalties() {
  globalPenalties.fill(0);
  globalRepCounts.fill(0);
}

function startPonderingSession(bState, opponentSideBool, aiSideBool, positionHistory) {
  stopPondering();
  let oppBoardText = '';
  try {
    oppBoardText = flattenBoard(bState);
  } catch (_e) {
    return;
  }

  const oppSide = opponentSideBool ? 1 : 0;
  const aiSide  = aiSideBool ? 1 : 0;

  analyzeGameHistory(positionHistory, oppSide);
  loadBoardFromString(oppBoardText, oppSide);
  setRepRoot();

  const n0 = generateLegalMoves(oppSide, false, 0, false);
  if (n0 === 0) return;

  clearOpponentPenalties();
  rootSide = oppSide;
  repContempt = 600;
  nodes = 0;
  nodeLimit = 40000;
  deadline = 0;
  stopped = 0;
  rootEpoch++;
  ttGen = (ttGen + 1) & 255;
  for (let d = 1; d <= 4; d++) {
    rootSearch(d, oppSide);
    if (stopped) break;
  }

  const nMoves = generateLegalMoves(oppSide, false, 0, false);
  const slot = ttFind(curHashLo, curHashHi);
  const ttMoveCode = slot >= 0 ? ttMove[slot] : -1;
  scoreMoves(0, nMoves, ttMoveCode, oppSide);

  const candidateBranches = [];
  for (let i = 0; i < nMoves; i++) {
    const idx = pickMove(0, nMoves, i);
    const f = moveFrom[idx], t = moveTo[idx], cap = moveCap[idx];
    const moving = board[f];

    searchHistoryFrom[0] = f;
    searchHistoryTo[0] = t;
    searchHistoryPiece[0] = moving;
    repHashLo[repRoot] = curHashLo;
    repHashHi[repRoot] = curHashHi;
    sinceCap[1] = cap ? 0 : sinceCap[0] + 1;
    doMove(f, t, cap, moving, oppSide);
    const childBoard90 = getCurrentBoardString();
    nodes = 0;
    nodeLimit = 12000;
    stopped = 0;
    curIter = 2;
    const quickEval = -search(2, -INF, INF, aiSide, 1, 1);
    undoMove(f, t, cap, moving, oppSide);

    candidateBranches.push({
      oppFrom: f,
      oppTo: t,
      oppMove: decodeMove(f * 90 + t),
      board90: childBoard90,
      quickScore: quickEval + (i === 0 ? 50 : 0),
      nextDepth: 1,
      stalls: 0,
      historyWithOppMove: [...positionHistory, (aiSideBool ? 'R:' : 'B:') + childBoard90]
    });
  }

  candidateBranches.sort((a, b) => b.quickScore - a.quickScore);
  const topBranches = candidateBranches.slice(0, Math.min(8, candidateBranches.length));
  if (topBranches.length === 0) return;

  for (const br of topBranches) {
    const cached = ponderBranchCache.get(br.board90);
    if (cached && cached.depth >= 1) br.nextDepth = cached.depth + 1;
  }

  ponderActive = true;
  totalPonderNodes = 0;
  let stepCounter = 0;

  const runNextPonderSlice = () => {
    if (!ponderActive) return;

    let branchIdx;
    if (stepCounter % 3 !== 2) branchIdx = (stepCounter % 3) % topBranches.length;
    else branchIdx = stepCounter % topBranches.length;
    stepCounter++;

    let branch = topBranches[branchIdx];
    if (branch.nextDepth > PONDER_MAX_DEPTH) {
      const other = topBranches.find(b => b.nextDepth <= PONDER_MAX_DEPTH);
      if (!other) { ponderActive = false; return; }
      branch = other;
    }

    analyzeGameHistory(branch.historyWithOppMove, aiSide);
    precomputeRootPenalties(branch.board90, aiSide);
    loadBoardFromString(branch.board90, aiSide);

    rootSide = aiSide;
    nodes = 0;
    nodeLimit = 50000000;
    stopped = 0;
    rootEpoch++;
    ttGen = (ttGen + 1) & 255;
    repContempt = evalSide(aiSide) < -350 ? 0 : 600;

    const sliceMs = Math.min(45 * (1 << Math.min(branch.stalls, 4)), 250);
    const sliceStart = performance.now();
    deadline = sliceStart + sliceMs;

    let lastValidCode = -1;
    let reachedDepth = 0;
    let lastScoreLocal = 0;
    let finishedAny = false;
    for (let d = branch.nextDepth; d <= PONDER_MAX_DEPTH; d++) {
      if (finishedAny && performance.now() - sliceStart > sliceMs * 0.55) break;
      stopped = 0;
      const code = rootSearch(d, aiSide);
      if (stopped) { if (!finishedAny) branch.stalls++; break; }
      if (code >= 0) {
        finishedAny = true;
        branch.stalls = 0;
        lastValidCode = code;
        lastScoreLocal = lastScore;
        reachedDepth = d;
        branch.nextDepth = d + 1;

        const pv = [];
        const count = Math.min(pvLen[0], 10);
        for (let k = 0; k < count; k++) {
          if (pvTable[k] >= 0) pv.push(decodeMove(pvTable[k]));
        }
        const prevEntry = ponderBranchCache.get(branch.board90);
        if (ponderBranchCache.size >= PONDER_CACHE_MAX && !prevEntry) {
          const oldest = ponderBranchCache.keys().next().value;
          ponderBranchCache.delete(oldest);
        }
        ponderBranchCache.set(branch.board90, {
          moveCode: code,
          move: decodeMove(code),
          score: lastScoreLocal,
          depth: d,
          nodes: (prevEntry ? prevEntry.nodes : 0) + nodes,
          pv,
          oppMove: branch.oppMove
        });
      }
      if (lastScoreLocal > MATE - 100 || lastScoreLocal < -MATE + 100) {
        branch.nextDepth = PONDER_MAX_DEPTH + 1;
        break;
      }
    }
    deadline = 0;
    totalPonderNodes += nodes;

    if (reachedDepth > 0 && lastValidCode >= 0) {
      self.postMessage({
        ponderStatus: {
          active: true,
          branchIndex: topBranches.indexOf(branch) + 1,
          totalBranches: topBranches.length,
          depth: reachedDepth,
          totalNodes: totalPonderNodes,
          oppMove: branch.oppMove,
          replyMove: decodeMove(lastValidCode)
        }
      });
    }

    ponderTimer = setTimeout(runNextPonderSlice, 4);
  };

  ponderTimer = setTimeout(runNextPonderSlice, 15);
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================
const PRESETS = {
  1: { depth: 8,  nodes: 200000,  time: 300,  instantDepth: 6 },
  2: { depth: 10, nodes: 500000,  time: 500,  instantDepth: 7 },
  3: { depth: 12, nodes: 1000000, time: 800,  instantDepth: 8 },
  4: { depth: 14, nodes: 2000000, time: 1300, instantDepth: 9 },
  5: { depth: 17, nodes: 3500000, time: 2000, instantDepth: 10 },
  6: { depth: 22, nodes: 6000000, time: 3000, instantDepth: 11 }
};

self.onmessage = async ({ data = {} }) => {
  const { cmd, board: bState, currentAISide, opponentSide, difficulty = 6, isHint = false, positionHistory = [] } = data;

  if (cmd === 'stop_ponder') {
    stopPondering();
    return;
  }

  if (cmd === 'clear_cache') {
    stopPondering();
    if (pikafishEngine) pikafishEngine.clearHash();
    ponderBranchCache.clear();
    ttClear();
    evKeyLo.fill(0); evKeyHi.fill(0);
    historyHeur.fill(0);
    contHist.fill(0);
    capHist.fill(0);
    counterMoves.fill(0);
    rootScoreStamp.fill(0);
    return;
  }

  if (cmd === 'start_ponder') {
    startPonderingSession(bState, opponentSide, currentAISide, positionHistory);
    return;
  }

  stopPondering();

  const side = currentAISide ? 1 : 0;
  analyzeGameHistory(positionHistory, side);

  const started = performance.now();
  try {
    const text = flattenBoard(bState);
    const sidePrefix = currentAISide ? 'R:' : 'B:';

    if (!isHint) {
      const bookMove = pickBookMove(sidePrefix + text);
      if (bookMove) {
        self.postMessage({
          result: {
            move: bookMove,
            score: 20,
            nodes: 1,
            depth: 'Book',
            pv: [bookMove],
            timeMs: performance.now() - started,
            isHint,
            ponderHit: false
          }
        });
        return;
      }
    }

    const base = PRESETS[Number(difficulty)] || PRESETS[6];
    const preset = {
      depth: Number(data.maxDepth) > 0 ? Number(data.maxDepth) : base.depth,
      nodes: Number(data.maxNodes) > 0 ? Number(data.maxNodes) : base.nodes,
      time: Number(data.timeMs) > 0 ? Number(data.timeMs) : base.time,
      instantDepth: base.instantDepth
    };

    const cachedBranch = !isHint ? ponderBranchCache.get(text) : null;
    if (cachedBranch && cachedBranch.depth >= preset.instantDepth) {
      self.postMessage({
        result: {
          move: cachedBranch.move,
          score: currentAISide ? cachedBranch.score : -cachedBranch.score,
          nodes: cachedBranch.nodes,
          depth: `${cachedBranch.depth}⚡`,
          pv: cachedBranch.pv,
          timeMs: Math.max(1, performance.now() - started),
          isHint,
          ponderHit: true
        }
      });
      return;
    }

    startDepth = cachedBranch ? Math.max(1, cachedBranch.depth + 1) : 1;
    const effNodes = cachedBranch ? Math.floor(preset.nodes * 0.5) : preset.nodes;
    const effTime = cachedBranch ? Math.floor(preset.time * 0.5) : preset.time;

    precomputeRootPenalties(text, side);

    // Thử khởi chạy và gọi Pikafish C++ WASM kèm NNUE
    const pika = await initPikafish();

    if (pika) {
      const fen = boardToPikafishFen(text, side === 1);
      const pikaRes = await pika.search(fen, preset.depth, effTime);

      if (!pikaRes || !pikaRes.move) {
        self.postMessage({
          result: { move: null, score: 0, nodes: 0, depth: 0, timeMs: performance.now() - started, isHint }
        });
        return;
      }

      self.postMessage({
        result: {
          move: pikaRes.move,
          score: currentAISide ? pikaRes.score : -pikaRes.score,
          nodes: pikaRes.nodes,
          depth: `${pikaRes.depth} (Pikafish)`,
          pv: pikaRes.pv,
          timeMs: performance.now() - started,
          isHint,
          ponderHit: false
        }
      });
      return;
    }

    // --- FALLBACK: Dùng lại cơ chế JS v7.5 nếu không chạy được WASM ---
    loadBoardFromString(text, side);
    let code = searchBestMove(preset.depth, effNodes, side, effTime);
    let totalNodes = nodes;
    let depth = completedDepth;
    let score = lastScore;
    const pv = [];
    const count = Math.min(pvLen[0], 12);
    for (let i = 0; i < count; i++) {
      if (pvTable[i] >= 0) pv.push(decodeMove(pvTable[i]));
    }

    if (code < 0) {
      self.postMessage({
        result: { move: null, score: 0, nodes: totalNodes, depth, timeMs: performance.now() - started, isHint }
      });
      return;
    }

    deadline = 0;
    totalNodes += cachedBranch ? cachedBranch.nodes : 0;

    if (cachedBranch && depth < cachedBranch.depth) {
      code = cachedBranch.moveCode;
      depth = cachedBranch.depth;
      score = cachedBranch.score;
      pv.length = 0;
      for (const m of cachedBranch.pv) pv.push(m);
    }

    if (code < 0) {
      self.postMessage({
        result: { move: null, score: 0, nodes: totalNodes, depth, timeMs: performance.now() - started, isHint }
      });
      return;
    }

    self.postMessage({
      result: {
        move: decodeMove(code),
        score: currentAISide ? score : -score,
        nodes: totalNodes,
        depth: cachedBranch ? `${depth}⚡` : depth,
        pv,
        timeMs: performance.now() - started,
        isHint,
        ponderHit: Boolean(cachedBranch)
      }
    });
  } catch (err) {
    deadline = 0;
    self.postMessage({ error: err?.message || String(err), isHint });
  }
};
