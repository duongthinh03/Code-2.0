# Bài 2 — Google Sheets → Bitrix24 CRM

## Cập nhật triển khai 2026-09-22

Đã bổ sung code OAuth Google Desktop, lịch chạy, batch chống trùng, retry hữu hạn, khóa/journal khôi phục, kiểm tra format/range, tests + coverage, CSV/Docker/README. Đã qua typecheck, 10 nhóm test và dry-run API thật (skip 3, lỗi 0). Xem `docs/TEST_REPORT.md` để phân biệt bằng chứng thật và giả lập.

Docker đã build và chạy dry-run thành công (skip 3, lỗi 0). OAuth Desktop đã cấp quyền, đọc và ghi Sheet demo thật; hàng 5 tạo Lead ID 9, sau đó cập nhật ghi chú trên chính ID 9; lượt dry-run sau bỏ qua 4/4, lỗi 0. Đã ép làm mới access token và đọc Sheet thành công; tra trùng CRM theo email/phone trả đúng ID 9. Demo video tiếp theo tạo/liên kết Lead ID 13, cập nhật ghi chú trên đúng ID và dry-run cuối bỏ qua 5/5, lỗi 0; video dài 2 phút 31 giây. Chưa hoàn tất 100+ dòng trên API thật, lịch chạy dài hạn và mapping owner/custom field thực tế. Checklist gốc bên dưới là yêu cầu nghiệm thu, không mặc định được đánh dấu xong chỉ vì đã viết code. Tại thời điểm cập nhật vẫn chưa commit/push.

Nguồn: PDF Google Sheets Version 2, trang 1–4. Mục tiêu bắt buộc: đồng bộ một chiều dữ liệu khách hàng từ Sheet sang Lead; ghi thông tin theo dõi trở lại Sheet. Việc ghi Lead ID/trạng thái về Sheet vẫn thuộc MVP, không phải bonus đồng bộ hai chiều.

## Mốc 0 — Hiểu dữ liệu và chuẩn bị kết nối

- [ ] Tạo Sheet thử với tên, email, điện thoại, công ty, UTM Source, ngân sách dự kiến, trạng thái, người phụ trách, ghi chú.
- [ ] Thêm cột hệ thống: trạng thái đồng bộ (Chờ xử lý/Đã đồng bộ/Lỗi), Lead ID Bitrix24 (ẩn), thời gian đồng bộ cuối, thông báo lỗi và sync hash.
- [ ] Phân biệt “trạng thái Lead” với “trạng thái đồng bộ”. Giữ điện thoại ở dạng văn bản để tránh mất số 0.
- [ ] Xác định trường chuẩn/custom fields, mã trạng thái và ID người phụ trách trong CRM thực tế.
- [ ] Chuẩn bị Google Sheets API v4. Làm Service Account và share Sheet trước; **bổ sung OAuth 2.0 user trước khi hoàn thành** vì đề yêu cầu cả hai.
- [ ] Bitrix24 dùng webhook URL hoặc OAuth 2.0; chọn một cho bản đầu.
- [ ] Chọn ngôn ngữ. Đề cho linh hoạt; TypeScript/NestJS thuận lợi nếu học tiếp bài TikTok, PHP phù hợp nếu đã quen.

**Xong mốc khi:** đọc được vài dòng Sheet và gọi được API Lead trên môi trường thử. Mock dùng để test logic; đề không xác nhận được thay toàn bộ kết nối thật bằng mock khi nộp.

## Mốc 1 — Thiết kế nhỏ, tách trách nhiệm

Tách phần cấu hình, đọc/ghi Sheets, gọi Bitrix24, mapping/validation, xử lý đồng bộ, lịch chạy và logging. Chưa cần admin panel.

Chuẩn bị `mapping.json`, `.env.example`, CSV mẫu và nơi lưu cấu hình lịch chạy/sync direction. Mapping phải cấu hình được cho cả custom fields, không gắn cố định tên cột trong code xử lý.

## Mốc 2 — Làm chạy được một dòng

1. Đọc range được cấu hình và xác định header/format dữ liệu.
2. Kiểm tra trường cần thiết, chuyển dữ liệu theo mapping.
3. Nếu có Lead ID: kiểm tra thay đổi bằng hash; không đổi thì bỏ qua, đổi thì cập nhật.
4. Nếu chưa có Lead ID: tìm trùng bằng email hoặc điện thoại. Có bản ghi phù hợp thì cập nhật; không có thì tạo mới.
5. Chỉ sau khi CRM thành công mới ghi Lead ID, hash, thời gian và “Đã đồng bộ” về Sheet.
6. Nếu lỗi: ghi “Lỗi” và thông báo hữu ích; tiếp tục xử lý dòng khác.

**Xong mốc khi:** thêm một dòng tạo đúng một Lead, sửa dòng cập nhật Lead đó, chạy lại không tạo thêm.

## Mốc 3 — Chống trùng và chống sai khi lỗi giữa chừng

- [ ] Hash chỉ từ dữ liệu nghiệp vụ đã chuẩn hóa; không đưa cột thời gian/trạng thái đồng bộ vào hash.
- [ ] Dùng Lead ID làm liên kết chính; email/điện thoại để tìm trùng trước tạo mới.
- [ ] Nếu email khớp Lead A nhưng điện thoại khớp Lead B: ghi xung đột để xử lý, không tự cập nhật bừa.
- [ ] Quy định ô trống là xóa giá trị hay giữ giá trị cũ; ghi trong README.
- [ ] CRM tạo thành công nhưng ghi Sheet thất bại: lần chạy lại phải tìm lại Lead, không tạo trùng. Thiết kế dấu vết thao tác bền vững nếu cần.
- [ ] Chống hai lượt đồng bộ chạy chồng; không dựa duy nhất số dòng nếu Sheet có thể bị sắp xếp lúc đang chạy. Có thể bổ sung mã dòng ổn định.
- [ ] Lead ID không còn tồn tại/quyền truy cập bị lỗi: phân loại và ghi lỗi, không mặc định tạo mới trong mọi trường hợp.

## Mốc 4 — Lịch chạy, batch và độ tin cậy

- [ ] Có lịch cấu hình được (ví dụ mỗi 15 phút) và trigger thủ công qua CLI **hoặc** HTTP.
- [ ] Sheets: đọc theo range, batch update values và format detection.
- [ ] Bitrix24: dùng `crm.lead.add`, `crm.lead.update`, `crm.lead.list` và batch phù hợp.
- [ ] Retry có giới hạn với backoff cho lỗi tạm thời; không retry vô hạn lỗi dữ liệu/quyền.
- [ ] Giới hạn tốc độ gọi API theo tài liệu hiện hành và xử lý lỗi từng phần trong batch.
- [ ] Log mỗi lượt: số tạo, cập nhật, bỏ qua, lỗi; kèm nguyên nhân và định danh dòng/lượt chạy.
- [ ] Config bao gồm credentials, Sheet ID, worksheet, webhook/token, mapping, sync direction và schedule; không commit bí mật.

## Mốc 5 — Kiểm thử trước khi làm bonus

| Kiểm thử | Điều kiện đạt |
|---|---|
| TC1: thêm dòng mới | Lead mới, ID ghi về, trạng thái Đã đồng bộ |
| TC2: sửa dòng có ID | Cập nhật đúng Lead, thời gian đổi |
| TC3: email đã tồn tại | Cập nhật Lead cũ, không tạo thêm |
| TC4: rate limit/timeout | Retry/backoff hữu hạn, log rõ, dòng khác tiếp tục |
| Chạy lại dữ liệu không đổi | Không tạo trùng, bỏ qua đúng |
| CRM thành công, ghi Sheet lỗi | Chạy lại khôi phục được liên kết |
| Cả hai kiểu Google auth | Đọc và ghi được bằng từng kiểu |
| 100+ dòng | Kết quả đúng, không timeout, kiểm soát tốc độ; ghi thời gian và số lỗi thực tế |

- [ ] Unit tests coverage **ít nhất 70%**, có báo cáo đo thật.
- [ ] Test mapping, hash, lựa chọn create/update, xung đột email/phone và retry; có kiểm tra kết nối đầu-cuối bằng dữ liệu thử.

## Mốc 6 — Đủ bộ nộp

- [ ] Source trên Git repository, kiến trúc rõ và comments cần thiết.
- [ ] `mapping.json`, `.env.example`, Sheet template hoặc CSV mẫu, Docker configuration.
- [ ] Tài liệu thiết kế hệ thống, API sử dụng và triển khai.
- [ ] README từng bước: Google credentials cho cả hai kiểu, Bitrix24 webhook, mapping, lịch, chạy/deploy, theo dõi, bảo trì và lỗi thường gặp.
- [ ] Tests, coverage ≥70%, kết quả 100+ dòng.
- [ ] Video **dưới 5 phút**: tạo mới → cập nhật → chống trùng → lỗi/retry → xem trạng thái/log.
- [ ] Thử làm theo README trên môi trường sạch và kiểm tra không lộ secrets.

## Mốc 7 — Điểm cộng, chỉ làm sau phần trên

Đồng bộ CRM → Sheet kèm giải quyết xung đột; webhook realtime; xử lý nâng cao enum/multi-value/ngày tháng/normalization và validation; admin panel cấu hình mapping, xem trạng thái/log và chạy thủ công. Chuẩn hóa cơ bản phục vụ chống trùng vẫn nên có trong lõi.

## Lần tới hỏi thế nào?

“Hướng dẫn bài Google Sheets mốc 0. Mình đang biết [PHP/JavaScript/chưa biết], muốn làm từng bước đọc một dòng Sheet trước.”
