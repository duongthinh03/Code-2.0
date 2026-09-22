# Báo cáo kiểm thử — cập nhật 2026-09-23

## Kết quả đo tại máy

| Kiểm tra | Kết quả |
|---|---|
| `npm run check` | PASS, TypeScript không lỗi |
| `npm run test:coverage` | 10 nhóm test PASS, không gọi API ngoài |
| Coverage phần lõi | Lines/statements 99,47%; branches 92,57%; functions 100% ở lượt đo ngày 2026-09-23 |
| 120 dòng giả lập | Tạo 120; khôi phục liên kết 120; chạy lại skip 120; đổi ghi chú update 120; vẫn 120 bản ghi |
| Thời gian luồng 120 dòng giả lập | 205ms ở lượt đo đầu; không gồm network, quota hay OAuth thật |
| Dry-run API thật | 3 dòng: tạo 0, cập nhật 0, bỏ qua 3, lỗi 0; 3650ms |
| OAuth Desktop thật | PASS: tài khoản test đã cấp quyền, token lưu trong `secrets/oauth-token.json`; dry-run dùng `GOOGLE_AUTH_MODE=oauth` đọc Sheet và CRM: bỏ qua 3, lỗi 0; 3286ms |
| OAuth ghi thật trên Sheet demo | PASS theo ảnh terminal/Sheet người dùng: hàng 5 tạo Lead ID 9, ghi `Đã đồng bộ`, ID 9, timestamp và hash; lượt dry-run sau đó đọc 4 hàng, bỏ qua cả 4, lỗi 0 |
| OAuth cập nhật thật | PASS: đổi riêng ghi chú I5 thành `Kiểm tra cập nhật OAuth`; dry-run dự báo cập nhật ID 9; sync thật cập nhật 1, bỏ qua 3, lỗi 0; đọc lại Sheet và CRM cùng ID 9, cùng ghi chú, cột lỗi trống; lượt kế tiếp bỏ qua 4/4 |
| OAuth refresh token | PASS: chỉ nạp refresh token, gọi Google Sheets API lấy access token mới và đọc được hàng 5 |
| Chống trùng qua CRM thật | PASS read-only: tra email hoặc điện thoại hàng 5 trả đúng một Lead đang mở, ID 9; chưa chạy ghi thật dòng trùng trên Sheet |
| Demo tạo/cập nhật/không đổi | PASS theo ảnh terminal, Sheet và Bitrix24: dòng `Khách Demo Video` liên kết Lead ID 13; sửa ghi chú thành `Demo cập nhật Lead` cập nhật đúng ID 13; lượt dry-run cuối bỏ qua 5/5 dòng, lỗi 0 |
| Video demo | PASS: `Demo_Google_Sheets_Bitrix24.mp4`, thời lượng 150,9 giây (2 phút 31 giây), dưới giới hạn 5 phút |
| Lead thật kiểm tra read-only | ID 3, 5, 7 đọc được; hash khớp |
| `docker compose config --quiet` | PASS cú pháp cấu hình, không in secrets |
| Docker build/runtime | PASS: `docker compose build` và `docker compose run --rm sync` đều exit 0; dry-run tạo 0, cập nhật 0, bỏ qua 3, lỗi 0; 3637ms |
| npm audit qua install | 0 vulnerabilities tại thời điểm cài |
| Git ignore | `.env`, `secrets/service-account.json`, `.state`, `coverage` được bỏ qua |

Coverage do c8 đo trên `config`, `google-auth`, `normalizers`, `mapper`, `reliability`, `bitrix-client`, `sheets-client`, `state`, `sync-engine`. Không tính các CLI entrypoints, lịch chạy, tương tác trình duyệt OAuth và types. Báo cáo mới mỗi lần chạy nằm trong `coverage/` (không commit). Test dùng fake clients và thư mục tạm riêng, không chỉnh credential thật.

## Bằng chứng E2E từ ảnh người dùng cung cấp trước đợt bổ sung

- Tạo 3 Lead mới ID 3/5/7; ghi trạng thái, ID, timestamp và hash vào Sheet.
- Sửa ghi chú Nguyễn Minh An; Lead ID 3 hiển thị “Khách muốn tư vấn gói nâng cao”.
- Chạy lại không thay đổi: bỏ qua 3 dòng, không tạo thêm.
- Đổi email thành `email-sai`: dry-run báo lỗi hàng 3, hai hàng khác vẫn xử lý; email đã được khôi phục sau đó.
- Dòng video mới được tạo và liên kết với Lead ID 13. Sau khi sửa ghi chú, sync thật cập nhật 1 và bỏ qua 4, lỗi 0; Sheet ghi `Đã đồng bộ`, ID 13, timestamp và hash.
- Bitrix24 Lead ID 13 hiển thị đúng tên, email và ghi chú `Demo cập nhật Lead`. Dry-run kế tiếp bỏ qua cả 5 dòng, lỗi 0.

Trong lúc chuẩn bị demo, một danh tính thử cũ đã được journal liên kết với Lead ID 11 nhưng CRM trả `Not found`. Hệ thống dừng an toàn ở hàng đó, không tự tạo bản ghi thay thế. Đây là tình huống liên kết duplicate/state cũ, không phải lỗi còn tồn tại của dòng demo ID 13. Không xóa toàn bộ journal; cần đối chiếu CRM trước khi xử lý riêng mục liên kết cũ.

## Cần kiểm chứng trước khi tuyên bố đủ đề

1. OAuth Desktop consent, đọc, ghi và ép làm mới access token đã đạt. Cần theo dõi thêm token khi chế độ Testing hết hạn sau khoảng 7 ngày. Không chia sẻ token.
2. TC3 tra trùng bằng CRM thật đã trả ID 9. Còn kiểm chứng qua một dòng Sheet test không có ID nhưng khớp Lead đang mở → cập nhật đúng một Lead; xung đột hai ID → lỗi, không ghi đè.
3. 100+ dòng bằng API thật trên Sheet/CRM thử riêng; ghi số lượng, thời gian, lỗi và so khớp ID. Cần người dùng đồng ý trước vì tạo nhiều bản ghi.
4. Kiểm tra mapping custom fields/người phụ trách theo ID thật, ẩn cột ID trong Sheet.
5. Docker build + dry-run đã đạt; còn thử scheduler trên môi trường test và kiểm tra dừng/crash/lock.
6. Fault-injection API thật chỉ trong môi trường kiểm soát; không gây rate-limit cố ý trên portal dùng chung. Unit test đã mô phỏng timeout/quota/lỗi API và kiểm tra chống trùng trực tiếp cho hàng chỉ có email.
7. Video dưới 5 phút đã hoàn thành. Còn chạy lại toàn bộ README trên môi trường sạch trước khi tuyên bố khả năng tái lập hoàn chỉnh.

Tại thời điểm cập nhật báo cáo, thay đổi chưa được commit/push.
