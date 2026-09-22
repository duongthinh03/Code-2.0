# Kịch bản video dưới 5 phút

Chuẩn bị Sheet/CRM test, terminal đã vào đúng thư mục, che URL webhook/credentials/token. Không mở `.env`, JSON credentials hoặc trang Cloud có bí mật khi quay. Chỉ quay thao tác ghi thật sau khi đã đồng ý dùng dữ liệu thử.

1. **0:00–0:35**: giải thích một chiều; Sheet input và 5 cột tracking; mapping cấu hình, không hardcode header vào thuật toán.
2. **0:35–1:25**: thêm một khách demo có email/phone riêng; dry-run báo tạo 1; chạy sync; xem Lead mới và ID ghi về Sheet.
3. **1:25–2:10**: sửa ghi chú; chạy sync; mở đúng ID, xác nhận nội dung đổi. Chạy lại: skip, không tạo thêm.
4. **2:10–3:00**: trên Sheet test riêng thêm dòng khớp email một Lead đang mở nhưng chưa có ID; chạy sync; xác nhận dùng lại ID. Không xóa ID các dòng đang dùng để minh họa.
5. **3:00–3:40**: nhập email sai ở một dòng; dry-run báo validation; giải thích chạy thật mới ghi cột Lỗi. Khôi phục email đúng.
6. **3:40–4:30**: trình bày kết quả test retry/timeout giả lập, coverage và log tổng kết. Gắn nhãn rõ “giả lập” cho test 120 dòng; chỉ trình bày benchmark API thật nếu đã thực hiện.
7. **4:30–4:50**: cho thấy README, Docker, cấu hình lịch; nhắc giới hạn một runner, state bền vững, không chỉnh Sheet khi chạy.

Không cần triển khai bonus hai chiều/admin panel trước khi hoàn tất các mục bắt buộc. Không push repository trước khi người dùng yêu cầu.
