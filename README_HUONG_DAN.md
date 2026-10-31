# Cờ Tướng AI — bản sửa lỗi tích hợp Pikafish (31/10/2026)

## Chẩn đoán
- Tệp `pikafish(1).js` (5,332 bytes) mà bạn cung cấp là **mã tích hợp**, không phải factory WebAssembly. Nó khai báo `let pikafishEngine` và bị xung đột với tên biến trong `engine-worker.js`.
- `engine-worker.js` hiện tại gọi `boardToPikafishFen()` và `handlePikafishOutput()` nhưng hai hàm này không được định nghĩa trong chính file đó.
- Bản AI JS cũ xuất `result` hai lần khi fallback.
- Website không truyền đầy đủ lịch sử UCI vào Pikafish.

## Bản sửa
- `index.html`: chỉ thay thế kết nối Worker, thêm trạng thái engine và gửi lịch sử nước đi; toàn bộ CSS/bàn cờ/điều khiển vẫn theo bản bạn gửi.
- `pikafish-bridge.js`: Worker chuyển đổi giao thức của web sang Pikafish UCI; có fallback sang JS khi lỗi.
- `engine-worker.js`: giữ AI JS dự phòng (USE_EXTERNAL_WASM=false) và sửa lỗi gửi hai kết quả.
- `pikafish/pikafish-runtime-v2.js`: Emscripten runtime 80,121 bytes đúng loại (factory Pikafish), **không** sử dụng bản 5.3KB.
- `pikafish/loader-v2.js`: tạo engine WebAssembly trong Worker riêng.
- `.wasm` và `.nnue` lấy từ bạn (không đổi).

## Cách chạy
1. Xóa hoặc di chuyển các file cũ sang nơi khác để tránh trộn bản.
2. Giải nén thư mục dự án này vào XAMPP `htdocs` hoặc hosting hỗ trợ pthread WASM.
3. Với XAMPP: mở `http://localhost/CoTuong_Pikafish_Corrected/kiem-tra-pikafish.html`, rồi `index.html`.
4. Mở F12 Console: `crossOriginIsolated` cần là `true` để chạy multi-thread. Nếu `false`, trang sẽ chuyển về AI JS dự phòng.
5. Tên file và đường dẫn phân biệt hoa thường. Không đổi tên file từ nội dung ZIP.
6. Làm mới cache bằng Ctrl+Shift+R, gỡ Service Worker cũ trong Application → Service Workers nếu cần.

## Bản quyền
Pikafish: GPLv3, https://github.com/official-pikafish/Pikafish. Runtime WASM từ dự án brianhliou/pikafish-wasm, theo giấy phép đi kèm. NNUE-License.md được giữ nguyên; mạng NNUE có điều khoản sử dụng riêng.

## Giới hạn kiểm thử
Đã kiểm tra cú pháp và đối chiếu dữ liệu file, cần thử thực tế trên trình duyệt và hosting của bạn.
