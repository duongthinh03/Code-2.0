# Code 2.0 — Bitrix24 Technical Assessment

**Người thực hiện:** Dương Quang Thịnh

Repository gồm ba bài thực hành về workflow và tích hợp dữ liệu với Bitrix24. Mỗi bài là một sản phẩm độc lập, có hướng dẫn đánh giá, bằng chứng kiểm thử và phần giới hạn riêng.

> Đây là hồ sơ bài kiểm tra và bản demo kỹ thuật, không phải hệ thống production. Những phần dùng mock hoặc chưa được kiểm chứng với API thật đều được ghi rõ trong tài liệu từng bài.

## Tổng quan

| Bài | Nội dung chính | Công nghệ / sản phẩm bàn giao | Trạng thái |
|---|---|---|---|
| [01 — Workflow Bitrix24](./01_Workflow_Bitrix24/) | Quy trình nghỉ phép 3 cấp và công tác 4 cấp | Bitrix24 Lists, Business Process, file export `.bpt`, ảnh minh chứng | Đã chạy trên portal demo; chưa kiểm chứng import sang portal khác và phân quyền nhiều tài khoản |
| [02 — Google Sheets → Bitrix24](./02_Google_Sheets_Bitrix24/) | Đồng bộ một chiều dữ liệu Sheet sang CRM Leads | TypeScript, Google Sheets API, Bitrix24 REST API, Docker, Node test/c8 | Đã kiểm chứng với Google Sheet và Bitrix24 demo trên tập dữ liệu nhỏ; bài test 120 dòng là giả lập |
| [03 — TikTok Lead Generation → Bitrix24](./03_TikTok_Bitrix24/) | Backend nhận webhook, xử lý hàng đợi, Lead/Deal, analytics và xuất báo cáo | NestJS, PostgreSQL, Redis, BullMQ, TypeORM, Docker, Jest/Supertest | Mock end-to-end đã được kiểm thử; chưa tích hợp TikTok API thật |

## 01 — Workflow Bitrix24

Hai Business Process tuần tự đã được xây dựng trên Bitrix24 Lists:

- Nghỉ phép: kiểm tra số ngày phép, duyệt qua 3 cấp, xử lý từ chối, gửi thông báo và cập nhật trạng thái.
- Công tác: kiểm tra ngân sách, duyệt qua 4 cấp, xử lý từ chối, gửi thông báo chi tiết và cập nhật trạng thái.
- Hồ sơ bàn giao gồm hai file export `.bpt` và tám ảnh minh chứng về sơ đồ, lịch sử chạy, trạng thái và thông báo.

Tài liệu và bằng chứng:

- [README và hướng dẫn đánh giá](./01_Workflow_Bitrix24/README.md)
- [Báo cáo thực hành đầy đủ](./01_Workflow_Bitrix24/HO_SO_NOP/BAO_CAO.md)
- [File export workflow](./01_Workflow_Bitrix24/HO_SO_NOP/exports/)
- [Ảnh minh chứng](./01_Workflow_Bitrix24/HO_SO_NOP/minh-chung/)
- [Kết quả kiểm tra file export](./01_Workflow_Bitrix24/HO_SO_NOP/KIEM_TRA_FILE.md)

Bài này không có mã nguồn để chạy bằng dòng lệnh. Cách đánh giá nhanh là đọc báo cáo, xem ảnh minh chứng và kiểm tra hai file `.bpt`. Khi import sang portal khác, cần tạo đúng Lists/trường dữ liệu, gán lại người duyệt, quyền truy cập và giá trị trạng thái trước khi chạy thử.

## 02 — Google Sheets → Bitrix24 Leads

Ứng dụng TypeScript đồng bộ một chiều từ Google Sheets sang Bitrix24 Leads:

- Hỗ trợ Google Service Account và OAuth 2.0 Desktop.
- Tạo hoặc cập nhật Lead; không tự xóa Lead, tạo Deal hoặc đồng bộ ngược CRM về Sheet.
- Mapping trường bằng JSON; chuẩn hóa email, số điện thoại và ngân sách.
- Chống trùng theo email/điện thoại, lưu journal phục hồi, khóa chống chạy chồng và kiểm tra Sheet trước khi ghi kết quả.
- Có dry-run, retry/backoff, lịch chạy tuần tự và Docker.
- Ghi ID Lead, trạng thái, thời gian, lỗi và hash trở lại Sheet.

Tài liệu và bằng chứng:

- [Hướng dẫn cài đặt, cấu hình và vận hành](./02_Google_Sheets_Bitrix24/README.md)
- [Báo cáo kiểm thử](./02_Google_Sheets_Bitrix24/docs/TEST_REPORT.md)
- [Kịch bản demo](./02_Google_Sheets_Bitrix24/docs/DEMO.md)
- [Video demo 2 phút 31 giây](./02_Google_Sheets_Bitrix24/Demo_Google_Sheets_Bitrix24.mp4)
- [Dữ liệu CSV mẫu](./02_Google_Sheets_Bitrix24/examples/leads.csv)

Kiểm tra phần mã nguồn cục bộ, không cần credential:

```powershell
Set-Location 02_Google_Sheets_Bitrix24
npm ci
npm run check
npm run test:coverage
```

Để kiểm tra tích hợp thật, cần Node.js 24+, một Google Sheet thử nghiệm và Bitrix24 có quyền CRM Leads. Cấu hình `.env` theo `.env.example`, đọc README của bài, sau đó chạy:

```powershell
npm run read-sheet
npm run test-bitrix
npm run sync:dry
```

Chỉ chạy `npm run sync` sau khi đã kiểm tra đúng Sheet, mapping và portal vì lệnh này ghi dữ liệu thật.

Lần đo ngày 23/09/2026 đạt TypeScript check, 10 nhóm test và coverage phần lõi 99,47% lines/statements, 92,57% branches, 100% functions. OAuth Desktop, Service Account, Docker dry-run và luồng tạo/cập nhật/không đổi trên bộ demo nhỏ đã được kiểm chứng. Chưa tuyên bố hoàn tất kiểm thử 100+ dòng qua API thật, scheduler dài hạn hoặc mapping custom field/người phụ trách bằng ID thật.

## 03 — TikTok Lead Generation → Bitrix24

Backend NestJS mô phỏng luồng nhận TikTok Lead Generation webhook và xử lý dữ liệu CRM:

- Xác thực webhook mock bằng HMAC, chống lặp event và lưu sự kiện trước khi đưa vào hàng đợi.
- BullMQ worker xử lý Lead, chuẩn hóa danh tính, chống trùng và retry/dead-letter/replay.
- CRUD Lead/Deal mock, tự động hoặc thủ công chuyển Lead thành Deal.
- Rule mapping, phân công sales, pipeline/stage/probability và custom fields.
- Analytics conversion/CPL/ROI, quality score, báo cáo định kỳ và cảnh báo mock.
- Xuất CSV, XLSX và JSON; có biện pháp chống CSV formula injection.
- PostgreSQL, Redis, TypeORM migrations, admin session, rate limit, OpenAPI và Docker Compose.

Tài liệu:

- [Hướng dẫn chạy và giới hạn](./03_TikTok_Bitrix24/README.md)
- [Hướng dẫn ứng dụng chi tiết](./03_TikTok_Bitrix24/app/README.md)
- [Kiến trúc và ERD](./03_TikTok_Bitrix24/docs/ARCHITECTURE.md)
- [Các bước demo](./03_TikTok_Bitrix24/docs/DEMO_STEPS.md)
- [Báo cáo kiểm thử](./03_TikTok_Bitrix24/docs/TEST_REPORT.md)
- [Đối chiếu yêu cầu đề bài](./03_TikTok_Bitrix24/docs/REQUIREMENTS_MATRIX.md)
- [OpenAPI JSON](./03_TikTok_Bitrix24/app/docs/openapi.json)

Chạy bản demo cục bộ:

```powershell
Set-Location 03_TikTok_Bitrix24
docker compose up -d
Set-Location app
Copy-Item .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run start:dev
```

Trước khi khởi động, đổi `MOCK_TIKTOK_WEBHOOK_SECRET` và `ADMIN_API_KEY` trong `.env` thành hai chuỗi ngẫu nhiên riêng, dài tối thiểu 16 ký tự. Kiểm tra ứng dụng tại `http://localhost:3000/health`.

Kiểm tra chất lượng:

```powershell
npm run build
npm run lint
npm run test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:cov -- --runInBand
```

E2E cần PostgreSQL và Redis đang chạy. Lần đo ngày 25/09/2026 đạt 35/35 test trong 9 suite; coverage 92,54% statements/lines, 69,27% branches và 93,33% functions. Docker image đã được build và ba service `app`, `postgres`, `redis` đạt trạng thái healthy trong lần kiểm tra được ghi nhận.

Webhook, payload, chữ ký, TikTok conversion và notification của bài này là hợp đồng mock nội bộ. Mã có tùy chọn đồng bộ sang Bitrix24 thật, nhưng TikTok API thật chưa được tích hợp. Bản demo cũng chưa có OAuth/RBAC, TLS, monitoring và các lớp bảo vệ cần thiết cho production.

## Lưu ý bảo mật và dữ liệu

- Không commit `.env`, token OAuth, service-account key hoặc webhook URL thật.
- Toàn bộ dữ liệu mẫu trong repository là dữ liệu giả.
- Chỉ dùng môi trường thử nghiệm khi chạy các lệnh có khả năng ghi vào CRM.
- Không đăng ảnh terminal hoặc cấu hình có thể chứa credential.
- Đọc README riêng của từng bài trước khi chạy tích hợp thật.

## Thứ tự đánh giá đề xuất

1. Xem bảng tổng quan và phần giới hạn của từng bài.
2. Với bài 01, đọc báo cáo và đối chiếu file export cùng ảnh minh chứng.
3. Với bài 02, xem video demo, chạy type-check/unit test, sau đó đọc báo cáo E2E.
4. Với bài 03, xem kiến trúc và requirements matrix, chạy test, rồi thực hiện các bước trong tài liệu demo.
