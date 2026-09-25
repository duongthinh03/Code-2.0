# Triển khai bản demo mock

## Điều kiện

Node.js 24, npm, Docker Desktop/Compose, cổng `3000`, `15432`, `6380` còn trống. Bản này chỉ dành cho localhost; không mở cổng công khai. Không dùng key mẫu hoặc dữ liệu khách hàng thật.

## Chạy và kiểm tra

Từ thư mục bài 03, chạy `docker compose --profile full up -d --build`, rồi `docker compose --profile full ps`. App khởi động sau PostgreSQL/Redis và tự chạy migration. Trong `app/`, tạo `.env` từ `.env.example`, thay hai key mẫu bằng chuỗi ngẫu nhiên riêng; lưu `.env` ngoài Git. Nếu chỉ chạy DB/Redis bằng Compose, tại `app/` chạy `npm ci`, `npm run db:migrate`, `npm run db:seed`, `npm run start:dev`. Không chạy app container và app trên host cùng lúc.

Kiểm tra `GET http://localhost:3000/health` trả `status`, `postgres`, `redis` đều `ok`; `GET /openapi.json` trả contract. Gửi webhook mẫu bằng `npm run mock:webhook -- --event-id deploy-check-1`, rồi `npm run mock:inspect -- --event-id deploy-check-1`; chỉ `queue_status=processed` mới xác nhận Lead được đồng bộ. Dùng admin key trong `.env` để xem `/api/v1/leads`, `/api/v1/outbound-events`, `/api/v1/outbound-receipts` và `/api/v1/automation/reports`.

## Vận hành và an toàn dữ liệu

PostgreSQL/Redis dùng named volumes; `docker compose down` không xóa volume, nhưng `down -v` sẽ xóa dữ liệu và **không nên dùng** nếu chưa chủ động sao lưu. Migration là additive; có thể chạy lại `npm run db:migrate`. Không dùng `db:revert` trên dữ liệu cần giữ. Redis giữ queue và session; snapshot báo cáo và biên nhận outbound nằm trong PostgreSQL. Cần sao lưu PostgreSQL trước khi nâng cấp bản demo có dữ liệu quan trọng.

Webhook nhận HTTP 202 khi đã lưu và xếp job, không phải khi đã tạo Lead. Xem `/api/v1/jobs/failed` để tìm lỗi xử lý, sửa dữ liệu/nguồn rồi gọi `/api/v1/jobs/:eventId/replay`. Outbound mock có trạng thái `pending`, `delivered`, `failed`, tối đa 3 lần thử; xem `/api/v1/outbound-events` và replay riêng qua `/api/v1/outbound-events/:id/replay`. Biên nhận trong `/api/v1/outbound-receipts` chứng minh đích mock đã nhận, **không chứng minh TikTok/Bitrix24 thật**.

## Troubleshooting

- `health` 503: kiểm tra `docker compose ps`, cổng DB/Redis và `.env` đúng với cách chạy host/container.
- Cổng `15432`, `6380` hoặc `3000` bị chiếm: đổi mapping cổng và `.env` tương ứng; cổng `3000` thường do app Nest host khác đang chạy.
- Webhook 401: kiểm tra bí mật HMAC mock, timestamp lệch không quá 5 phút và ký raw JSON bytes đúng hệt body gửi.
- Webhook 202 nhưng chưa có Lead: chờ worker, chạy `mock:inspect`, kiểm tra `jobs/failed` và log app; email/phone sai hoặc engagement đến trước Lead sẽ vào dead-letter.
- API admin 401: kiểm tra `x-admin-key` hoặc Bearer token; token hết hạn sau 8 giờ hoặc Redis restart sẽ cần đăng nhập lại. 503 có thể do key chưa cấu hình hoặc Redis không dùng được khi tạo session.
- XLSX không tải được: xác minh `format=xlsx`, response `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` và dung lượng file; dùng CSV/JSON để kiểm tra dữ liệu trước.
- Báo cáo chưa phản ánh Lead mới: snapshot theo giờ không đổi trong cùng giờ; analytics API trực tiếp dùng cache tối đa 5 giây.

## Trước production

Cần adapter TikTok/Bitrix24 thật dựa trên tài liệu chính thức và credential do chủ tài khoản cấp; xác minh scope, webhook signature, refresh token, rate limits, replay protection và custom field IDs. Thêm HTTPS, secret manager, RBAC, audit/retention, giám sát queue và DB, backup/restore đã thử, outbound HTTP retry/idempotency thực, test lỗi mạng và xác nhận chính sách quyền riêng tư. Demo hiện không gửi dữ liệu ra ngoài.
