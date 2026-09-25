# NestJS app — TikTok → Bitrix24 mock demo

Hướng dẫn cài đặt, chạy thử, giới hạn mock và troubleshooting nằm ở [README của bài 03](../README.md). API contract nằm ở [OpenAPI JSON](docs/openapi.json); kiến trúc và ERD ở [ARCHITECTURE.md](../docs/ARCHITECTURE.md).

Chạy từ thư mục `app/`: `npm ci`, `npm run db:migrate`, `npm run db:seed`, `npm run start:dev`. Cần PostgreSQL/Redis theo `../compose.yaml` và `.env` sao chép từ `.env.example`. Không đưa `.env` lên Git.

Kiểm tra kết nối Bitrix24 bằng `npm run bitrix:check` sau khi đặt URL gốc của inbound webhook mới vào `BITRIX_WEBHOOK_URL` trong `.env`. Lệnh này chỉ đọc pipeline và stage Deal, không tạo dữ liệu CRM và không bật đồng bộ thật. Không chia sẻ URL webhook hoặc ảnh chứa URL.

Đồng bộ Bitrix24 thật là tùy chọn: chạy `npm run db:migrate`, kiểm tra `npm run bitrix:check`, rồi đặt `BITRIX_SYNC_ENABLED=true` trong `.env` và khởi động lại ứng dụng. Khi bật, Lead mới qua webhook mock TikTok được tìm/tạo trên Bitrix24; Deal mock được tìm/tạo hoặc cập nhật tương ứng trong pipeline mặc định (`BITRIX_DEAL_CATEGORY_ID=0`, stage `NEW`/`WON`/`LOSE`). Giữ dữ liệu mock cho báo cáo hiện tại. Không tự đẩy toàn bộ Lead cũ. Không dùng `pipelineId=1` hay `assignedTo=sales-demo-1` của demo làm ID Bitrix24 thật.

Các bản ghi mới được đối chiếu bằng `originatorId`/`originId` và theo dõi trong `bitrix_sync_state`. Khi lỗi, xem `GET /api/v1/leads/:id/bitrix-sync` rồi thử lại đúng Lead bằng `POST /api/v1/leads/:id/bitrix-sync` (cả hai yêu cầu khóa quản trị). Lệnh POST cũng có thể chủ động đồng bộ một Lead cũ khi chế độ ghi thật đã bật. Không xóa bản ghi CRM thật khi xóa/ẩn dữ liệu mock. Webhook TikTok hiện vẫn là bản mô phỏng có chữ ký `X-Mock-TikTok-*`; chưa phải TikTok Marketing API thật.

Có thể thử/chạy lại chính xác một bản ghi từ terminal bằng `npm run build` rồi `npm run bitrix:sync -- --mock-lead-id 123`. Lệnh này ghi vào CRM thật khi `BITRIX_SYNC_ENABLED=true`; không tự quét hoặc đồng bộ hàng loạt.

Kiểm tra lại bản ghi thật mà không ghi CRM: `npm run bitrix:verify -- --mock-lead-id 123`. Nếu chạy qua Docker Compose, sau khi sửa mã hoặc `.env` cần dựng lại service app: `docker compose --profile full up -d --build --no-deps app` từ thư mục `03_TikTok_Bitrix24`.
