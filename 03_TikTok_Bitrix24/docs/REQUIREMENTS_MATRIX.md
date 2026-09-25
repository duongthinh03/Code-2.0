# Đối chiếu yêu cầu PDF (8 trang)

Ký hiệu: **Mock đạt** = chạy/kiểm thử được với hai hệ thống giả lập; **Một phần** = còn thiếu nhánh; **Chưa** = chưa triển khai. Điều này không phải chứng nhận kết nối API thật.

| Nhóm yêu cầu | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| Webhook TikTok, xác thực chữ ký, raw audit, lead/form/interaction | Mock đạt | `webhook.service.ts`, `lead.processor.ts`; chữ ký và tên sự kiện là **hợp đồng mock**, không phải chuẩn TikTok. |
| Validation, email/phone quốc tế, source tags, chống trùng | Mock đạt | `lead-mapping.ts`, `identity.ts`, `mock-bitrix.client.ts`; E2E trùng event và contact. |
| Mapping field và Bitrix custom fields | Mock đạt | `PUT /api/v1/config/mappings`, `UF_CRM_*` → JSONB `custom_fields`; chưa biết ID field thực tế. |
| Tạo/cập nhật Lead, timeline, Deal tự động/thủ công | Mock đạt | Worker, mock client, `convert-to-deal`; một Deal/Lead, mock API-call log. |
| Pipeline/stage/probability và gán sales theo tiêu chí | Mock đạt | Rule theo campaign/city; form/interaction tăng xác suất. Rule chỉ áp dụng Deal mới, không backfill. |
| Mock CRUD Lead/Deal | Mock đạt | Admin tạo/đọc/sửa Lead, đọc/sửa Deal và chuyển Lead→Deal; DELETE là **archive mềm** để giữ audit. Email/phone không cho sửa qua PATCH vì ảnh hưởng khóa chống trùng. |
| Notification và conversion sync TikTok | Mock đạt | Outbound worker nội bộ, retry/backoff, receipt `mock_delivery_receipts`; **không có HTTP tới TikTok/email/SMS thật**. |
| Analytics conversion, CPL, ROI, quality score, dashboard API | Mock đạt | `demo.service.ts`, Redis TTL 5 giây; chi phí và doanh thu là dữ liệu mock. |
| Export CSV/Excel/JSON | Mock đạt | `GET /api/v1/reports/export?format=csv|xlsx|json`; CSV/XLSX chống công thức đầu ô. |
| Historical batch, scheduled report, automated alert | Mock đạt | JSONL import idempotent; snapshot theo giờ UTC; alert tỷ lệ dưới 20% với ≥5 Lead, gửi inbox mock. Chưa có ETL quy mô lớn. |
| NestJS TS DI/guards/interceptors, logging/error, OpenAPI | Mock đạt | `app.module.ts`, guard/interceptor, `app/docs/openapi.json`. |
| PostgreSQL TypeORM migration/seed/indexes; Redis cache/session | Mock đạt | 10 migration, seed, cache báo cáo, Bearer session 8 giờ trong Redis. |
| BullMQ, retry, DLQ, rate limit | Mock đạt | Inbound BullMQ 3 lần; DLQ/replay; outbound poller 3 lần; guard giới hạn request/IP. |
| Docker multi-stage, health | Mock đạt | Dockerfile, Compose, `/health`. Monitoring production chưa có. |
| Jest/Supertest ≥80%, format/lint/hooks | Một phần | Coverage tổng thể >80% statements/lines; Prettier và Oxlint. Chưa có ESLint/Husky; kiểm thử lỗi API thật là không thể khi chưa có API thật. |
| README, kiến trúc/ERD, deployment, troubleshooting, OpenAPI, test data | Mock đạt | README, `docs/*`, `app/examples`, test/coverage report. |
| GitHub repo, demo video/đường dẫn nộp | Chưa | Người dùng yêu cầu **không đẩy lên Git**; không tạo PR/push. Video không được yêu cầu thành deliverable bắt buộc trong PDF. |
| Tích hợp TikTok/Bitrix24 API thật | Chưa | PDF cho phép mock. Cần credential/quyền tài khoản và xác minh contract thực trước khi làm. |

Kết luận: luồng demo mock đủ để trình diễn và kiểm thử; **không thể gọi là hoàn thành tích hợp production**. Các khoảng trống còn lại: ESLint/Husky, resilience với CRM thật, kết nối API thật và nộp GitHub theo chủ ý người dùng.
