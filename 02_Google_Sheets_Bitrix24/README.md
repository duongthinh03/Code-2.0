# Google Sheets → Bitrix24 Leads

[Đề bài gốc (PDF)](<V2 - De bai Tich hop Google Sheet voi Bitrix24 CRM - Version 2.pdf>)

MVP TypeScript đồng bộ một chiều. Chạy thủ công hoặc định kỳ; ghi ID, trạng thái, thời gian, lỗi và hash về Sheet. Không phải đồng bộ hai chiều. Không tự xóa Lead hoặc tạo Deal.

## Bắt đầu

Cần Node.js 24+, npm, Google Sheet thử nghiệm và Bitrix24 có quyền CRM Leads. Chạy các lệnh trong thư mục `02_Google_Sheets_Bitrix24`.

1. `npm ci`.
2. Sao chép `.env.example` thành `.env`, điền các giá trị thật tại máy. Không đưa bí mật vào Git, ảnh chụp hay video.
3. Chuẩn bị Sheet theo `examples/leads.csv`. Khi nhập CSV, tắt tự chuyển văn bản sang số/ngày để giữ số 0 đầu điện thoại; đặt cột Điện thoại là Plain text trước khi nhập. Header phải duy nhất. Các cột hệ thống vẫn phải tồn tại dù chưa có giá trị.
4. Chọn một cách xác thực Google ở phần dưới; điền webhook Bitrix24 và mapping.
5. `npm run check`, `npm run test:coverage`, `npm run read-sheet`, `npm run test-bitrix`.
6. `npm run sync:dry`: xem trước, có đọc API thật nhưng không sửa CRM/Sheet. Có tạo/xóa khóa tạm trên máy.
7. Kiểm tra đúng dữ liệu và portal, rồi mới chạy `npm run sync` để ghi thật.

Không sửa, sắp xếp hay chèn hàng trong lúc đồng bộ. Chỉ vận hành một runner cho cùng nguồn dữ liệu. Không xóa ID/hash để ép chạy lại.

## Xác thực Google

### Service account

Bật Google Sheets API trong Google Cloud project. Tạo service account, lưu khóa JSON tại `secrets/service-account.json`, chia sẻ Sheet quyền Editor cho email service account. Đặt `GOOGLE_AUTH_MODE=service_account` và đường dẫn `GOOGLE_APPLICATION_CREDENTIALS`. Không cần quyền chủ sở hữu project để đọc Sheet được chia sẻ. Nếu tổ chức cấm tạo key, dùng OAuth hoặc liên hệ quản trị viên; không vô hiệu hóa chính sách bảo mật chỉ để chạy demo.

### OAuth người dùng

Cấu hình OAuth consent screen; nếu ứng dụng đang Testing, thêm tài khoản vào test users. Tạo OAuth client loại **Desktop app**, tải JSON vào `secrets/oauth-client.json`.

Chạy `npm run auth:google` trên máy có trình duyệt. Mở URL được in và cấp scope Google Sheets. Callback chỉ lắng nghe `127.0.0.1`, có state ngẫu nhiên và PKCE; hết hạn chờ sau 5 phút. Token được lưu tại `secrets/oauth-token.json`. Đặt `GOOGLE_AUTH_MODE=oauth`, chạy read-sheet rồi dry-run. Thư viện tự dùng refresh token để lấy access token; nếu token bị thu hồi/hết hạn, đăng nhập lại. Token OAuth của ứng dụng Testing có thể hết hạn theo chính sách Google. Không chạy CLI cấp quyền trong container; cấp trên máy rồi mount secrets read-only.

Hai cách đã có mã hỗ trợ. OAuth Desktop đã được kiểm chứng trên Sheet demo thật: cấp quyền, đọc/ghi, làm mới access token, tạo/cập nhật Lead và ghi tracking về Sheet. Service account cũng đã đọc/ghi Sheet demo sau khi Sheet được chia sẻ đúng quyền. Không coi unit test là bằng chứng thay cho các kiểm tra E2E này.

## Bitrix24 và mapping

Tạo incoming webhook có quyền CRM phù hợp; lưu URL đầy đủ `/rest/<user>/<token>/` trong `.env`. Chọn CRM có Lead, không dùng chế độ tự chuyển mọi Lead thành Deal. Webhook mang quyền người tạo; chỉ cấp quyền cần thiết.

`mapping.json` chứa tên cột, `fieldMap` trường chuẩn, `customFieldMap` từ header Sheet sang mã `UF_CRM_...`, `assigneeIdMap` từ tên người phụ trách sang ID số của người dùng thật. Phải tra mã trường/trạng thái/ID trên portal thử nghiệm, không đoán. Nếu tên không có trong assigneeIdMap thì không gửi ASSIGNED_BY_ID; chủ sở hữu mặc định của CRM có thể được dùng. Chưa xác nhận mapping owner bằng ID thật trong bộ demo.

- Ngân sách: số nguyên VND không âm; chấp nhận `5000000`, `5,000,000`, `5.000.000`, `5 000 000`; không chấp nhận tiền lẻ/chuỗi lẫn chữ. Không suy đoán số điện thoại đã bị mất số 0.
- Email lowercase, điện thoại bỏ ký tự phân cách, tiền tố +84/0084 đổi về 0. Không có xác thực số điện thoại quốc tế đầy đủ.
- Ô nghiệp vụ trống: **không gửi trường đó**, giữ giá trị CRM cũ, không có chức năng xóa giá trị CRM. Trạng thái trống dùng defaultStatusId. Custom field hiện gửi chuỗi; enum/multi-value/ngày cần bổ sung bộ chuyển đổi nếu sử dụng.
- UTM Source gửi UTM_SOURCE; đây không phải SOURCE_ID. CRM hiển thị Nguồn “Cuộc gọi” không chứng minh UTM bị sai. Muốn đổi Nguồn cần cấu hình sourceId hợp lệ riêng.
- Có thể đổi thứ tự cột; đọc theo header. Range phải theo A1, bao gồm dòng header đầu tiên, ví dụ `Leads!A:N` hoặc `'Lead Demo'!C5:P`. Không hỗ trợ named range. Ẩn cột Bitrix24 Lead ID bằng UI Google Sheets sau khi kiểm tra; ẩn cột không phải phân quyền bảo mật.

## Luồng xử lý và API

`config → Sheets read/format check → mapper/validation → sync-engine → Bitrix → kiểm tra Sheet chưa đổi → Sheets batch write-back`

1. Khóa runner trên đĩa; đọc Sheet bằng `spreadsheets.values.get` với UNFORMATTED_VALUE và kiểm tra kiểu điện thoại bằng `spreadsheets.get`.
2. Validate từng hàng. Có ID: `crm.lead.get` kiểm tra tồn tại; hash không đổi thì skip, hash đổi thì `crm.lead.update`.
3. Không có ID: tra journal khôi phục; nếu chưa có, gọi trực tiếp Bitrix `crm.duplicate.findbycomm` theo email **hoặc** phone; xác minh ứng viên qua `crm.lead.list` theo ID và STATUS_SEMANTIC_ID=P. Lead đã đóng/chuyển đổi không là ứng viên dedupe mới. Hai Lead khác nhau cùng khớp gây lỗi xung đột, không tự chọn.
4. Một ứng viên thì update; không ứng viên thì `crm.lead.add`. Ghi trạng thái pending xuống journal **trước** add và ID sau thành công.
5. Batch ghi 5 cột hệ thống qua `spreadsheets.values.batchUpdate` với RAW, không sửa cột nghiệp vụ. Lỗi validation/API của một hàng không ngăn hàng tiếp theo.

Kiểm tra chống trùng gọi trực tiếp theo từng loại thông tin để xử lý cả hàng chỉ có email hoặc phone. `lead.list` chia tối đa 50 ID/lần. Create/update chạy tuần tự nhằm ghi journal từng bước và giữ tốc độ; không gom hàng loạt lệnh create vào batch mù.

## Retry, chống trùng và giới hạn

Read/update an toàn lặp lại: tối đa 3 lần, backoff 500/1000ms, tôn trọng Retry-After dạng giây tối đa 60s. Retry HTTP429/5xx, lỗi mạng tạm và mã Bitrix throttling. Không retry lỗi quyền/dữ liệu. Mỗi lệnh Bitrix giãn tối thiểu `BITRIX_REQUEST_INTERVAL_MS` (mặc định 550ms); không phải cam kết tránh mọi quota của portal.

**Không tự retry create** khi timeout vì có thể CRM đã tạo. Chạy lại tìm theo email/phone hoặc ID journal; nếu pending mà không tìm thấy, dừng hàng đó và yêu cầu kiểm tra thủ công. Không cam kết exactly-once khi mất state, đổi identity hoặc nhiều máy cùng chạy.

Journal nằm trong `STATE_DIR/<hash-nguồn>/journal.json`, chỉ lưu hash danh tính, ID/pending, không lưu email/phone thô. Giữ state bền vững, hạn chế ACL và sao lưu; ID/hash vẫn là dữ liệu nội bộ. Không tự xóa pending. Nếu pending: kiểm tra CRM với quyền đầy đủ; nếu đã tạo thì điền đúng ID vào Sheet. Chỉ gỡ mục pending khi đã xác nhận không có Lead và dừng mọi runner. Không xóa toàn bộ journal để thử lại.

Khóa `sync.lock` chặn chạy chồng trên cùng state directory. Sau crash có thể còn khóa: xem PID/thời gian trong khóa, xác nhận tiến trình cũ đã dừng rồi mới xóa **đúng file khóa đó**, giữ journal. Máy/volume khác không chia sẻ khóa: không scale nhiều replica.

Trước ghi tracking, đọc lại Sheet và so sánh snapshot. Nếu Sheet đổi, không ghi tracking; dùng journal/dedupe để khôi phục lượt sau. Đây chỉ là kiểm tra best-effort, không phải transaction nguyên tử giữa Google và Bitrix. Vẫn phải tránh chỉnh Sheet trong lúc chạy. Liên kết ID đã xóa/không có quyền đọc sẽ báo lỗi, không tự tạo thay thế. Hash chỉ phát hiện thay đổi phía Sheet; thay đổi riêng ở CRM không tự kéo về Sheet.

## Lịch chạy và Docker

`npm run schedule`: chạy ngay một lượt ghi thật, sau khi kết thúc chờ `SYNC_INTERVAL_MINUTES` (1–1440, mặc định 15) rồi chạy tiếp. Không phải cron theo giờ cố định. Ctrl+C dừng lịch mới và chờ lượt hiện tại kết thúc. Phải giữ tiến trình/máy hoạt động; vận hành lâu dài bằng process supervisor hoặc Task Scheduler. Không bật thêm lịch chạy khác song song.

Docker mặc định chỉ dry-run:

```sh
docker compose build
docker compose run --rm sync
# Ghi thật khi đã xem trước và chấp nhận:
docker compose run --rm sync npm run sync
# Lịch ghi thật, chỉ một container:
docker compose run --rm sync npm run schedule
```

Secrets chỉ mount read-only, không copy vào image; `/state` dùng named volume. Không dùng `docker compose down -v` nếu cần giữ journal. Không đăng ảnh/log `docker compose config` vì có thể in biến bí mật. Docker chưa được coi đã kiểm chứng chỉ vì có Dockerfile; xem báo cáo kiểm thử.

## Theo dõi và xử lý lỗi

Log mỗi hàng chỉ ghi số dòng, hành động, ID/lỗi; cuối lượt có JSON `runId`, `dryRun`, `created`, `updated`, `skipped`, `error`, `durationMs`. Mã thoát 1 khi có lỗi. Theo dõi tỷ lệ lỗi, thời gian lượt, lịch không chạy, quota và stale lock; lưu log với quyền hạn chế và chính sách xoay vòng. Không dump Axios response/config vì chứa webhook/token. Mã lỗi được rút gọn và ẩn URL/Bearer; vẫn kiểm tra trước khi chia sẻ log.

| Hiện tượng | Kiểm tra |
|---|---|
| 403 Google | API đã bật, Sheet chia sẻ đúng service account/tài khoản OAuth, scope và quyền Editor |
| Email không hợp lệ | Sửa email; dry-run không ghi cột Lỗi. Chạy thật mới ghi trạng thái lỗi về Sheet |
| Điện thoại dạng số | Đặt Plain text và nhập lại đúng số gốc, không chỉ đổi format sau khi đã mất số 0 |
| Có ID nhưng CRM trống | Kiểm tra đúng portal, quyền, filter, Lead đã chuyển đổi/xóa; không xóa ID hàng loạt |
| Nhiều dòng cùng ID | Dừng; sửa liên kết sau khi đối chiếu CRM |
| 429/QUERY_LIMIT | Tăng khoảng cách gọi, giảm tần suất, kiểm tra runner khác |
| Ghi Sheet thất bại | Giữ journal và dữ liệu liên hệ, chạy lại; không tạo tay trước khi đối chiếu |
| invalid_grant OAuth | Cấp quyền lại, kiểm tra test-user, token bị thu hồi/hết hạn |

## Kiểm thử và hồ sơ nộp

`npm run test:coverage` chạy hoàn toàn cục bộ; kiểm tra ngưỡng 70% statements/branches/functions/lines cho các module nghiệp vụ/API client/state/auth/config. CLI `sync`, `schedule`, `auth-google`, công cụ chẩn đoán và type declarations được loại khỏi unit coverage; cần smoke/E2E riêng. Không coi tỷ lệ này là coverage toàn bộ triển khai.

Xem `docs/TEST_REPORT.md` và `docs/DEMO.md`. Bộ 120 dòng là **giả lập**, không thay thế yêu cầu 100+ dòng trên API thật. Docker build/dry-run và OAuth Desktop E2E đã đạt. Video demo dài 2 phút 31 giây đã hoàn thành, minh họa tạo/cập nhật Lead ID 13 và lượt chạy lại bỏ qua 5/5 dòng, lỗi 0. Chưa kiểm chứng 100+ dòng qua API thật, lịch chạy dài hạn và mapping custom field/người phụ trách bằng ID thật; không tuyên bố các mục này đã hoàn tất.

Tài liệu API chính thức: [Bitrix tìm trùng](https://apidocs.bitrix24.com/api-reference/crm/duplicates/crm-duplicate-find-by-comm.html), [Google OAuth desktop](https://developers.google.com/identity/protocols/oauth2/native-app), [OAuth security](https://developers.google.com/identity/protocols/oauth2/resources/best-practices).
