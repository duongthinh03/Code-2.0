# Kiểm tra file xuất ngày 16 tháng 9 năm 2026

Hai file được giải nén zlib và phân tích dữ liệu tuần tự theo độ dài byte, không thực thi nội dung. Cả hai đọc hết thành công, cấu trúc VERSION bằng 2 và gốc SequentialWorkflowActivity. Đây là kiểm tra tĩnh, không phải thử import hay chạy lại trên server.

| Hạng mục | bp-22.bpt | bp-24.bpt |
|---|---:|---:|
| Kích thước byte | 3676 | 4259 |
| ApproveActivity | 3 | 4 |
| IMNotifyActivity | 5 | 6 |
| SetFieldActivity | 5 | 6 |
| Điều kiện | Số ngày xin nghỉ <= số ngày còn lại | Chi phí dự trù <= ngân sách khả dụng |
| Người nhận thông báo | Document CREATED_BY | Document CREATED_BY |
| Ghi chú phê duyệt | Bắt buộc cả 3 cấp | Bắt buộc cả 4 cấp |

Các cấp tiếp theo nằm trong nhánh đồng ý. Mỗi nhánh từ chối có thông báo và SetFieldActivity riêng trước điểm nhập nhánh. Nhánh thành công có thông báo và SetFieldActivity riêng. Tất cả nhánh từ chối trong cùng mẫu dùng cùng mã giá trị trạng thái; nhánh duyệt dùng một mã khác. Ý nghĩa Đã duyệt/Từ chối được đối chiếu với ảnh chạy thử của người thực hiện.

Thông báo thành công công tác có các tham chiếu động NAME, PROPERTY_H_V_T_N, PROPERTY_I_C_NG_T_C_T_I, PROPERTY_NG_Y_B_T_U, PROPERTY_NG_Y_K_T_TH_C_D_KI_N, PROPERTY_CHI_PH_D_TR, PROPERTY__N_V_TI_N_T và PROPERTY_DANH_S_CH_CHI_PH_D_KI_N.

Không có bước cập nhật Lý do từ chối riêng, trừ số dư, kiểm tra loại nghỉ hay xác thực thời gian trong cây hoạt động đã kiểm tra. Các biến người dùng đều mặc định user_1. Xem phần giới hạn trong BAO_CAO.md trước khi đánh giá tính sẵn sàng triển khai.
