# Demo 6 bước (toàn bộ là mock)

Chạy các lệnh trong PowerShell tại thư mục `app/`, sau khi `docker compose --profile full up -d --build` (hoặc Nest chạy trên host), `db:migrate` và `db:seed`. **Trước khi demo mock, xác nhận ứng dụng đang chạy với `BITRIX_SYNC_ENABLED=false` rồi khởi động lại nếu vừa đổi cấu hình.** Script `mock:webhook` sẽ từ chối gửi nếu file `.env` đang bật đồng bộ Bitrix24 thật; chỉ dùng `--allow-live-bitrix-sync` khi chủ ý tạo bản ghi thử nghiệm trên CRM thật. Các bước dưới đây không cần gửi dữ liệu tới TikTok/Bitrix24 thật.

```powershell
$eventId = 'demo-' + [guid]::NewGuid().ToString('N')
$leadId = 'lead-' + $eventId
$email = "$eventId@example.com"
$key = (Get-Content .env | Where-Object { $_ -like 'ADMIN_API_KEY=*' } | Select-Object -First 1).Split('=', 2)[1]
$headers = @{ 'x-admin-key' = $key }
```

1. Nhận webhook: `npm run mock:webhook -- --event-id $eventId --lead-id $leadId --email $email --campaign-id spring-sale`. Chờ vài giây rồi `npm run mock:inspect -- --event-id $eventId`; cần thấy `queue_status: processed`.
2. Tạo Lead mock: `(Invoke-RestMethod http://localhost:3000/api/v1/leads?limit=100 -Headers $headers).data | Where-Object { $_.external_lead_id -eq $leadId }`. Có thể xem trực tiếp ID trong kết quả `mock:inspect`.
3. Chuyển Deal theo rule: campaign `spring-sale` chứa `sale`, nên Deal tự tạo. `Invoke-RestMethod http://localhost:3000/api/v1/deals -Headers $headers` cho thấy Deal; gọi lại `POST /api/v1/leads/:id/convert-to-deal` sẽ không nhân đôi.
4. Analytics: `Invoke-RestMethod http://localhost:3000/api/v1/analytics/conversion-rates -Headers $headers` và `Invoke-RestMethod http://localhost:3000/api/v1/analytics/campaign-performance -Headers $headers`.
5. Xuất báo cáo: `Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/api/v1/reports/export?format=xlsx&date_range=30d' -Headers $headers -OutFile 'leads-demo.xlsx'`. CSV/JSON cũng hỗ trợ bằng cách đổi `format`.
6. Health: `Invoke-RestMethod http://localhost:3000/health`; `status`, `postgres`, `redis` đều phải là `ok`. Xem `/openapi.json` để duyệt contract.

Để demo conversion mock: dùng ID Deal ở bước 3 gửi `POST /webhooks/bitrix24/deals` với status `won` và amount. Sau đó `GET /api/v1/outbound-events` và `/api/v1/outbound-receipts` cho thấy giao nhận trong mock sink, **không phải xác nhận TikTok thật**. Tránh dùng ID/địa chỉ email đã có từ lần demo trước; script ở trên tạo ID mới mỗi lần.
