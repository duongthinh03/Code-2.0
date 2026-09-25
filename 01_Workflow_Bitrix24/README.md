# Bài 01 — Xây dựng Workflow trên Bitrix24

Bài thực hành xây dựng hai Business Process tuần tự trên **Bitrix24 Lists**, gồm quy trình nghỉ phép 3 cấp và quy trình công tác 4 cấp.

**Người thực hiện:** Dương Quang Thịnh

## Mục tiêu

- Kiểm tra dữ liệu đầu vào trước khi đưa đơn vào luồng duyệt.
- Duyệt tuần tự qua đúng các cấp có trách nhiệm.
- Dừng các cấp còn lại khi một cấp từ chối.
- Thông báo kết quả cho người tạo đơn.
- Cập nhật trạng thái cuối thành `Đã duyệt` hoặc `Từ chối`.
- Xuất mẫu workflow dưới định dạng `.bpt` để bàn giao.

## Hai workflow đã xây dựng

| Workflow | Điều kiện đầu vào | Luồng phê duyệt |
|---|---|---|
| `NghiPhep_3Cap` | Số ngày xin nghỉ không lớn hơn số ngày phép còn lại | Quản lý trực tiếp → Trưởng phòng nhân sự → Giám đốc |
| `CongTac_4Cap` | Chi phí dự trù không lớn hơn ngân sách khả dụng | Quản lý trực tiếp → Trưởng phòng tài chính → Phó giám đốc tài chính → Giám đốc |

Nếu điều kiện đầu vào không đạt, đơn được từ chối tự động. Nếu một người duyệt từ chối, workflow bỏ qua các cấp còn lại, gửi thông báo và cập nhật trạng thái `Từ chối`.

Khi toàn bộ các cấp đồng ý, workflow gửi thông báo và cập nhật trạng thái `Đã duyệt`. Thông báo thành công của quy trình công tác có dữ liệu động về người đề nghị, địa điểm, thời gian và chi phí.

## Hồ sơ bàn giao

- [Báo cáo chi tiết](HO_SO_NOP/BAO_CAO.md)
- [Kết quả kiểm tra tĩnh file xuất](HO_SO_NOP/KIEM_TRA_FILE.md)
- [Mẫu nghỉ phép 3 cấp — bp-22.bpt](HO_SO_NOP/exports/bp-22.bpt)
- [Mẫu công tác 4 cấp — bp-24.bpt](HO_SO_NOP/exports/bp-24.bpt)
- [Thư mục ảnh minh chứng](HO_SO_NOP/minh-chung/)
- [Đề bài](<V2 - Bai Kiem tra Xay dung Workflow tren Bitrix24 - Version 1.pdf>)

> Giữ nguyên phần mở rộng `.bpt` do Bitrix24 xuất, không tự đổi thành `.bpx`.

## Cách xem kết quả

1. Đọc [báo cáo thực hành](HO_SO_NOP/BAO_CAO.md) để xem cấu trúc biểu mẫu, logic từng nhánh, dữ liệu kiểm thử và các giới hạn.
2. Xem [kết quả kiểm tra file](HO_SO_NOP/KIEM_TRA_FILE.md) để đối chiếu cấu trúc tĩnh của hai mẫu xuất.
3. Mở các ảnh minh chứng:

| Nội dung | Minh chứng |
|---|---|
| Sơ đồ workflow nghỉ phép | [Ảnh 01](HO_SO_NOP/minh-chung/01-so-do-nghi-phep.png) |
| Sơ đồ workflow công tác | [Ảnh 02](HO_SO_NOP/minh-chung/02-so-do-cong-tac.png) |
| Lịch sử duyệt nghỉ phép | [Ảnh 03](HO_SO_NOP/minh-chung/03-lich-su-nghi-phep.png) |
| Lịch sử duyệt công tác | [Ảnh 04](HO_SO_NOP/minh-chung/04-lich-su-cong-tac.png) |
| Trạng thái nghỉ phép | [Ảnh 05](HO_SO_NOP/minh-chung/05-trang-thai-nghi-phep.png) |
| Trạng thái công tác | [Ảnh 06](HO_SO_NOP/minh-chung/06-trang-thai-cong-tac.png) |
| Thông báo chi phí công tác | [Ảnh 07](HO_SO_NOP/minh-chung/07-thong-bao-chi-phi.png) |
| Thông báo kết quả nghỉ phép | [Ảnh 08](HO_SO_NOP/minh-chung/08-thong-bao-nghi-phep.png) |

Ảnh 03–04 và ảnh 05–06 ghi nhận các lần chạy khác nhau. Trạng thái `Completed` chỉ cho biết workflow đã kết thúc, không tự đồng nghĩa với đơn đã được duyệt.

## Import và chạy thử

File `.bpt` chỉ chứa **mẫu workflow**, không phải bản sao lưu toàn bộ Lists, trường dữ liệu hoặc dữ liệu đã nhập.

1. Tạo hai Lists tương ứng với `NghiPhep_3Cap` và `CongTac_4Cap`.
2. Tạo đúng các trường và kiểu dữ liệu được mô tả trong [báo cáo](HO_SO_NOP/BAO_CAO.md).
3. Mở phần cấu hình workflow của List và dùng chức năng **Import**:
   - Dùng `bp-22.bpt` cho quy trình nghỉ phép.
   - Dùng `bp-24.bpt` cho quy trình công tác.
4. Kiểm tra và gán lại:
   - Tham chiếu các trường của List.
   - Giá trị trong trường danh sách `Trạng thái`.
   - Các biến người duyệt.
   - Người nhận và dữ liệu động trong thông báo.
   - Quyền tạo, xem và phê duyệt đơn.
5. Bật cấu hình tự chạy workflow khi tạo phần tử mới nếu cần.
6. Tạo đơn thử, bấm **Save**, sau đó xử lý lần lượt các nhiệm vụ trong **Workflows**.
7. Kiểm tra kết quả trong **Notifications**, trường trạng thái của List và **Journal** của lần chạy.

Do mã trường, mã giá trị danh sách và tài khoản người dùng phụ thuộc từng portal, cần rà soát toàn bộ tham chiếu sau khi import.

## Kịch bản đã kiểm thử

- Nghỉ phép đủ số dư và được duyệt qua 3 cấp.
- Nghỉ phép không đủ số dư.
- Nghỉ phép bị từ chối ở cấp 1.
- Công tác trong ngân sách và được duyệt qua 4 cấp.
- Công tác vượt ngân sách.
- Công tác bị từ chối ở cấp 1.
- Thông báo công tác hiển thị tổng tiền và danh sách chi phí.

Chi tiết dữ liệu và kết quả quan sát nằm trong [BAO_CAO.md](HO_SO_NOP/BAO_CAO.md).

## Giới hạn

- Các biến người duyệt đang mặc định là `user_1` để thử nghiệm bằng một tài khoản.
- Số ngày phép và ngân sách được nhập tay; chưa kết nối hệ thống nhân sự hoặc tài chính.
- Chưa tự trừ số dư phép hoặc ngân sách sau khi duyệt.
- Chưa kiểm thử riêng tất cả các nhánh từ chối ở cấp 2 trở lên.
- Chưa thử import và chạy lại trên một portal Bitrix24 khác.
- Thông báo đã được kiểm thử trong Bitrix24, chưa kiểm chứng gửi qua email.

Đây là bản demo phục vụ bài đánh giá chuyên môn, chưa phải hệ thống sẵn sàng triển khai thực tế.
