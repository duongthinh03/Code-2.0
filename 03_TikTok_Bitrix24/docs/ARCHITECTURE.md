# Kiến trúc bản demo mock

```mermaid
flowchart LR
  Sender[Mock TikTok script] -->|HMAC webhook| API[NestJS API]
  API --> Events[(PostgreSQL webhook_events)]
  API --> Queue[(Redis / BullMQ)]
  Queue --> Worker[NestJS LeadProcessor]
  Worker --> Leads[(mock_bitrix_leads)]
  Worker --> Deals[(mock_bitrix_deals)]
  Worker --> Timeline[(lead_timeline)]
  Worker --> Calls[(mock_bitrix_api_calls)]
  Deals --> Outbound[(mock_outbound_events)]
  Outbound --> Dispatcher[AutomationService]
  Dispatcher --> Receipts[(mock_delivery_receipts)]
  Dispatcher --> Snapshots[(scheduled_reports)]
  Snapshots --> Alerts[(automation_alerts)]
  Admin[Admin API] --> Leads
  Admin --> Deals
  Admin --> Reports[Analytics / CSV / JSON]
```

```mermaid
erDiagram
  webhook_events }o--|| mock_bitrix_leads : mock_lead_id
  mock_bitrix_leads ||--o{ mock_bitrix_lead_external_ids : aliases
  mock_bitrix_leads ||--o{ lead_timeline : history
  mock_bitrix_leads ||--o| mock_bitrix_deals : converts_to
  mock_bitrix_deals ||--o{ mock_outbound_events : emits
  scheduled_reports ||--o{ mock_outbound_events : notification
  scheduled_reports ||--o| automation_alerts : triggers
  mock_outbound_events ||--o| mock_delivery_receipts : delivered_to_mock
  campaign_costs ||--o{ mock_bitrix_leads : campaign_id
  webhook_events ||--o| dead_letter_jobs : failure
```

Đây là mô hình **mock**, không có token TikTok/Bitrix24 thật. `event_id` chống gửi lại cùng sự kiện; alias TikTok `lead_id`, email và điện thoại chuẩn hóa chống tạo trùng khách hàng. Worker cập nhật Lead, Deal và trạng thái sự kiện trong một transaction PostgreSQL. Redis giữ queue; `dead_letter_jobs` lưu lỗi cuối cùng để kiểm tra/replay. HTTP 202 chỉ xác nhận đã lưu và xếp hàng, không khẳng định đồng bộ thành công.

Rule tự động tạo tối đa một Deal cho mỗi Lead khi tên campaign (hoặc campaign ID nếu thiếu tên) chứa chuỗi cấu hình. Rule cũng xét campaign/city để gán sales và cộng xác suất theo form/interaction. `customFields` mock được lưu JSONB, không phải field ID thực từ Bitrix24. `AutomationService` quét outbound 5 giây/lần với khóa row `SKIP LOCKED`, retry tối đa 3 lần và lưu receipt ở **đích giả lập**. Snapshot theo giờ UTC được chống lặp bằng unique `period_start`; alert low-conversion được gửi inbox mock. Admin dùng `x-admin-key` hoặc session Redis 8 giờ. Trước production cần OAuth/secret manager, xác minh webhook chính thức, TLS, phân quyền chi tiết, idempotency callback Bitrix24 và quan sát vận hành.

Admin DELETE Lead/Deal là archive mềm (`archived_at`), không xóa audit. Các danh sách/analytics bỏ qua bản ghi archived; webhook mới có thể kích hoạt lại Lead cùng danh tính. CRM production cần chính sách retention và quyền xóa riêng.
