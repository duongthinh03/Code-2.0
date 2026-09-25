# TikTok Lead Generation → Bitrix24 (demo mock)

Giai đoạn hiện tại dùng **webhook TikTok mock**. Bitrix24 mặc định cũng là mock, nhưng có thể bật đồng bộ sang Bitrix24 thật bằng `BITRIX_SYNC_ENABLED=true` trong `.env` (xem `app/README.md`). Header `X-Mock-TikTok-*`, cấu trúc payload và thuật toán ký bên dưới là hợp đồng nội bộ để thử nghiệm, **không phải đặc tả webhook chính thức của TikTok**.

## Chạy cục bộ

1. Mở Docker Desktop. Tại thư mục bài 03 chạy `docker compose up -d` và `docker compose ps`. PostgreSQL dùng cổng localhost `15432`, Redis dùng `6380`.
2. Trong `app/`, sao chép `.env.example` thành `.env`, đổi `MOCK_TIKTOK_WEBHOOK_SECRET` và `ADMIN_API_KEY` thành hai chuỗi ngẫu nhiên riêng, dài tối thiểu 16 ký tự. `.env` được Git bỏ qua.
3. Trong `app/`, chạy `npm ci`, `npm run db:migrate`, `npm run db:seed`, rồi `npm run start:dev`.
4. Kiểm tra `http://localhost:3000/health`: cả `postgres` và `redis` phải là `ok`.

Cách chạy toàn bộ bằng Docker (không chạy thêm `start:dev` cùng lúc): tại thư mục bài 03, chạy `docker compose --profile full up -d --build`, rồi `docker compose --profile full exec app npm run db:seed`. Service app tự chạy migration; `docker compose --profile full ps` cần báo app, PostgreSQL và Redis healthy. Nếu cổng 3000 đang được dùng, dừng app cục bộ trước. Dữ liệu PostgreSQL/Redis ở volume, không tự xóa khi dừng container.

## Thử webhook mock

Trước khi thử, xác nhận app đang chạy với `BITRIX_SYNC_ENABLED=false`; nếu vừa sửa `.env`, khởi động lại app. Script `mock:webhook` từ chối gửi khi `.env` bật đồng bộ thật, trừ khi truyền `--allow-live-bitrix-sync` để chủ ý tạo bản ghi trên CRM thật. Trong terminal khác, tại `app/` chạy `npm run mock:webhook`. Kết quả mong đợi: HTTP 202, `duplicate: false`, `queued: true`. Chạy lại với `npm run mock:webhook -- --event-id demo-1` hai lần: lần thứ hai trả `duplicate: true`. Chữ ký sai: `npm run mock:webhook -- --bad-signature` trả HTTP 401. Xem kết quả worker bằng `npm run mock:inspect -- --event-id demo-1`: `queue_status` phải là `processed` và có `mock_lead_id`.

Mock nhận `POST /webhooks/tiktok/leads` với JSON gồm `event_id`, `event_type: "lead.generate"` và `data.lead_id`. Hai header là `X-Mock-TikTok-Timestamp` (Unix giây, lệch tối đa 5 phút) và `X-Mock-TikTok-Signature` (hex HMAC-SHA256 của `<timestamp>.<raw JSON bytes>`). `event_id` duy nhất trong PostgreSQL; cùng ID nhưng nội dung khác trả HTTP 409. Sự kiện được lưu trước khi đưa job vào BullMQ. Nếu đưa vào queue lỗi, server trả HTTP 503 và có thể gửi lại cùng sự kiện để thử tiếp.

Worker BullMQ nhận job và tạo/cập nhật Lead **trong bảng mock** `mock_bitrix_leads`; mỗi lệnh upsert được ghi vào `mock_bitrix_api_calls`. Lặp cùng event ID không gọi mock lần hai. Các event khác ID được đối chiếu theo TikTok `lead_id`, email viết thường và số điện thoại E.164 (`+84…` tương đương số Việt Nam bắt đầu `0…`). Có một kết quả khớp thì dùng lại Lead đó; thông tin mới chỉ lấp chỗ trống, không ghi đè trường đã có bằng chuỗi rỗng. Nếu email và điện thoại trỏ đến các Lead khác nhau, worker báo xung đột để xử lý thủ công. Các Lead demo cũ trùng cả email lẫn số điện thoại được giữ nguyên; ID TikTok mới sẽ nối vào Lead cũ nhất, không xóa hoặc gộp dữ liệu cũ.

Để tự thử hai event khác ID nhưng cùng liên hệ, dùng `npm run mock:webhook -- --event-id contact-a --email unique@example.com --phone 0912345678`, rồi đổi `contact-a` thành `contact-b` và giữ nguyên email/số điện thoại. Chạy `npm run mock:inspect -- --event-id contact-b` để xem `linked_external_ids` và `mock_lead_id`. Dùng email/số điện thoại riêng của demo, tránh trùng dữ liệu cũ.

Payload `lead.generate` hỗ trợ cả dạng mock `data.*` lẫn ví dụ trong PDF (`event`, `lead_data.*`, `campaign.*`, `form.*`). Lead cần email hoặc điện thoại hợp lệ. `form.complete` và `user.interaction` là hai tên sự kiện **mock nội bộ**; chúng cập nhật timeline của Lead đã có qua `data.lead_id`. Tên/header/chữ ký này chưa được xác nhận với TikTok thật.

Import lịch sử mock từ file JSONL: `npm run mock:import -- --file examples/historical-leads.jsonl`. Script gửi lần lượt qua cùng webhook, không chèn thẳng vào DB; chạy lại cùng file trả `duplicate` thay vì nhân đôi Lead. File mẫu chỉ chứa dữ liệu giả. Mỗi dòng là một JSON event; thiếu `event_id` thì script tạo ID ổn định từ nội dung dòng. Với Docker, chạy script trên máy host ở thư mục `app/` vì endpoint được publish tại localhost:3000.

## Demo Lead → Deal → báo cáo

Tại `app/`, gửi Lead có campaign chứa `sale`:

```powershell
npm run mock:webhook -- --event-id sale-demo-1 --lead-id sale-lead-1 --email sale-demo-1@example.com --phone 0912345678 --campaign-id spring-sale --campaign-name "Spring Sale 2024"
npm run mock:inspect -- --event-id sale-demo-1
```

Sau vài giây, `queue_status` là `processed`. Rule mặc định sẽ tạo một Deal mock duy nhất cho Lead. Các API quản trị cần header `x-admin-key` lấy từ `app/.env`. Ví dụ trong PowerShell:

```powershell
$key = (Get-Content .env | Where-Object { $_ -like 'ADMIN_API_KEY=*' } | Select-Object -First 1).Split('=',2)[1]
$headers = @{ 'x-admin-key' = $key }
Invoke-RestMethod http://localhost:3000/api/v1/leads -Headers $headers
Invoke-RestMethod http://localhost:3000/api/v1/deals -Headers $headers
Invoke-RestMethod http://localhost:3000/api/v1/analytics/conversion-rates -Headers $headers
Invoke-RestMethod http://localhost:3000/api/v1/analytics/campaign-performance -Headers $headers
Invoke-WebRequest 'http://localhost:3000/api/v1/reports/export?format=csv&date_range=30d' -Headers $headers -OutFile 'leads-demo.csv'
```

Đổi rule bằng `PUT /api/v1/config/rules` với JSON `{ "campaignContains": "sale", "pipelineId": "1", "stageId": "NEW", "probability": 30, "assignedTo": null, "assignmentCriteria": [{ "campaignContains": "sale", "salesPersonId": "sales-demo-1" }], "formCompletionBonus": 15, "interactionBonus": 5 }`. Có thể dùng `cityEquals` trong tiêu chí phân công. Rule được áp dụng khi tạo Deal mới; sự kiện `form.complete` và `user.interaction` cập nhật xác suất của Deal đã có. `PUT /api/v1/config/mappings` hỗ trợ đường dẫn trường và `customFields`, ví dụ `{ "customFields": { "UF_CRM_UTM_SOURCE": "data.utm_source" } }`; giá trị được lưu trong `custom_fields` JSONB của Lead mock. Rule/mapping không tự chạy lại toàn bộ Lead cũ. `POST /api/v1/leads/:id/convert-to-deal` cho phép chuyển thủ công và không tạo Deal thứ hai khi gọi lại. `POST /webhooks/bitrix24/deals` dùng header quản trị và body `{ "deal_id": "1", "status": "won", "amount": 1000000 }` để giả lập callback cập nhật Deal. Đây **không phải** webhook Bitrix24 thật.

CRUD quản trị mock: `POST /api/v1/leads` nhận `externalLeadId` cùng email/phone; `GET/PATCH/DELETE /api/v1/leads/:id`; `GET/PATCH/DELETE /api/v1/deals/:id`. PATCH Lead chỉ sửa `fullName`, `city`, `customFields` để không phá khóa chống trùng email/phone; PATCH Deal sửa `title`, `pipelineId`, `stageId`, `probability`, `assignedTo`. DELETE là **xóa mềm/archived**: bản ghi ẩn khỏi danh sách/analytics nhưng audit vẫn còn; event mới có cùng external ID có thể kích hoạt lại Lead. Không gửi thao tác xóa đến Bitrix24 thật.

Nếu worker thất bại, xem `GET /api/v1/jobs/failed`; sửa nguyên nhân rồi `POST /api/v1/jobs/:eventId/replay`. Email/điện thoại sai và xung đột danh tính là lỗi không retry tự động; lỗi tạm thời retry tối đa 3 lần với exponential backoff. HTTP 202 chỉ có nghĩa sự kiện đã được lưu và xếp hàng; dùng `mock:inspect` để xác nhận xử lý hoàn tất.

Khi Deal chuyển sang `won`, bản demo ghi một conversion event và notification **mock** vào `mock_outbound_events`. Worker nội bộ xử lý hàng đợi này mỗi 5 giây và lưu biên nhận tại `mock_delivery_receipts` (đích giả lập `mock-tiktok-conversions` hoặc `mock-notification-inbox`). Không có request nào được gửi đến TikTok thật. Dùng `GET /api/v1/outbound-events` để xem `delivery_status`, `attempts`, `last_error`; `GET /api/v1/outbound-receipts` để xem biên nhận. Có thể chủ động gọi `POST /api/v1/outbound-events/deliver-pending`. Lỗi tạm thời retry tối đa 3 lần với backoff; event thất bại có thể `POST /api/v1/outbound-events/:id/replay`. Gửi lại cùng trạng thái/amount không tạo thêm conversion.

Ứng dụng tạo snapshot báo cáo mỗi giờ UTC (`scheduled_reports`) và cảnh báo mock khi có ít nhất 5 Lead nhưng tỷ lệ Lead→Deal dưới 20%. `GET /api/v1/automation/reports`, `GET /api/v1/automation/alerts` và `POST /api/v1/automation/run-report` dùng để kiểm tra/chạy thủ công. Cùng một giờ chỉ tạo một snapshot; cảnh báo được gửi vào inbox giả lập. Đây không phải email/SMS thật và snapshot có thể cũ đến 1 giờ.

Chi phí `spring-sale` do `npm run db:seed` tạo chỉ là **dữ liệu mock**. CPL = chi phí / số Lead; ROI = (doanh thu Deal won − chi phí) / chi phí. Thiếu chi phí hoặc chi phí bằng 0 thì API trả `null`, không bịa số. Tỷ lệ Lead→Deal tính Deal/Lead; tỷ lệ Deal won tính Deal won/Deal. CSV có bảo vệ ô bắt đầu bằng ký tự công thức.

Điểm chất lượng mock trong danh sách Lead = 20 điểm cơ sở +25 cho mỗi `form.complete` +5 cho mỗi `user.interaction`, tối đa 100. Xuất `format=csv`, `format=xlsx` hoặc `format=json`; CSV/XLSX thêm dấu nháy đầu cho giá trị bắt đầu bằng ký tự công thức. Báo cáo có cache Redis tối đa 5 giây và được xóa cache khi Lead/Deal đổi. Guard giới hạn 120 request/phút/IP cho webhook và 240 request/phút/IP cho các API còn lại; interceptor chỉ log method/path/status/thời gian, không log key hay body.

Admin API nhận `x-admin-key` hoặc Bearer session 8 giờ lưu trong Redis. Để lấy session, gửi `POST /api/v1/auth/session` với `x-admin-key`; dùng `Authorization: Bearer <accessToken>` cho những lần sau, rồi `POST /api/v1/auth/logout` để thu hồi. Không chia sẻ token hoặc `.env`.

## Kiểm thử và tài liệu

Trong `app/`, chạy `npm run build`, `npm run lint`, `npm run test -- --runInBand`, `npm run test:e2e -- --runInBand`, `npm run test:cov -- --runInBand`. E2E cần PostgreSQL và Redis đang chạy; test tự tạo database `<DB_NAME>_jest` (tài khoản DB cần quyền `CREATE DATABASE`), chạy migration, dùng BullMQ prefix riêng và **ép tắt đồng bộ Bitrix24 thật**. Không chạy test với database production. OpenAPI JSON: `app/docs/openapi.json` hoặc `http://localhost:3000/openapi.json`. Sơ đồ kiến trúc/ERD ở `docs/ARCHITECTURE.md`; triển khai và khắc phục lỗi ở `docs/DEPLOYMENT.md`; 6 bước trình diễn ở `docs/DEMO_STEPS.md`; đối chiếu PDF ở `docs/REQUIREMENTS_MATRIX.md`; kết quả kiểm thử ở `docs/TEST_REPORT.md`.

## Giới hạn và hướng production

Demo này chưa gọi TikTok Business API; đồng bộ Bitrix24 thật là tùy chọn và chỉ bật khi cấu hình rõ ràng. Conversion/notification chỉ được giao vào **đích mock trong PostgreSQL**. Batch import mới hỗ trợ JSONL qua webhook mock, chưa có pipeline ETL quy mô lớn. Session Redis là cho admin demo, không phải OAuth/RBAC production. Trước khi dùng TikTok API thật phải xác minh payload, chữ ký webhook, quyền scope và giới hạn tốc độ từ tài liệu chính thức; thêm TLS, bảo vệ callback Bitrix24, phân quyền quản trị, metrics/alerts và kiểm thử lỗi mạng/thao tác lặp. Không dùng các key mẫu trong `.env.example` cho triển khai thật.

Nếu khởi động lỗi: `docker compose ps` để xem PostgreSQL/Redis; cổng 15432/6380/3000 phải rảnh; chạy lại `npm run db:migrate` sau khi DB healthy. Nếu webhook trả 401, kiểm tra bí mật mock và thời gian máy. Nếu nhận 202 nhưng không thấy Lead, xem `mock:inspect`/`jobs/failed` và log worker. Nếu API quản trị trả 503, `ADMIN_API_KEY` chưa được đặt hoặc quá ngắn.
