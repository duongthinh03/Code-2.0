# Bài 1 - Bắt đầu thực hành trên Bitrix24

Mục tiêu của buổi đầu là xác nhận tài khoản làm được Business Process và tạo được **một biểu mẫu nghỉ phép**. Chưa cần thiết kế toàn bộ luồng phê duyệt hay làm bài công tác.

## Kết quả phải có sau buổi đầu

- Mở được `Automation` > `Workflows` > `Workflows in Feed`.
- Thấy được `Create New` và `Settings` > `Configure workflows`.
- Tạo workflow form tên `Yeu cau nghi phep - Demo`.
- Thêm đầy đủ trường nhập liệu ở phần 1 bên dưới.
- Chụp 2 ảnh: trang workflow form và màn hình Configure workflows.

Nếu thiếu một trong các quyền trên, dừng ở đây và ghi lỗi chính xác. Không cố tạo file `.bpt` bằng tay.

## Phần 1 - Tạo biểu mẫu nghỉ phép

1. Vào `Automation` > `Workflows` > `Workflows in Feed`.
2. Chọn `Create New`.
3. Trong tab **Settings**, điền:
   - Workflow name: `Yeu cau nghi phep - Demo`
   - Description: `Nhan vien gui yeu cau nghi phep qua 3 cap phe duyet.`
   - Sort: `10`
   - Bật auto lock khi chỉnh sửa nếu giao diện có tùy chọn này.
4. Trong tab **Titles**, dùng tên dễ hiểu:
   - Element: `Yeu cau nghi phep`
   - Section: `Yeu cau nghi phep`
5. Trong tab **Access**, cấp quyền tối thiểu:
   - Nhân viên demo hoặc phòng ban demo: `Add`
   - Bạn/quản trị viên: `Full access`
   - Các người duyệt: ít nhất `Read` hoặc quyền đúng theo giao diện để nhận và xử lý yêu cầu.
6. Bấm Save, sau đó mở workflow vừa tạo.
7. Vào `Settings` > `Customize fields` > `Add field` và thêm các trường sau.

| Tên trường | Kiểu gợi ý | Bắt buộc | Giá trị / ghi chú |
|---|---|---:|---|
| Họ và tên | Text | Có | Có thể tự nhập cho bài demo |
| Phòng ban | List hoặc Text | Có | Ví dụ: Kinh doanh, Nhân sự, Tài chính |
| Loại nghỉ | List | Có | Nghỉ phép năm, Nghỉ ốm, Nghỉ không lương |
| Ngày bắt đầu | Date | Có | |
| Ngày kết thúc | Date | Có | |
| Lý do nghỉ | Text nhiều dòng | Có | |
| Số ngày xin nghỉ | Number | Có | Nhập tay ở phiên bản đầu |
| Số ngày phép còn lại | Number | Có | Dùng số nhập tay để demo; ghi đây là giả định |
| Trạng thái xử lý | List | Không | Chờ quản lý, Chờ nhân sự, Chờ giám đốc, Đã duyệt, Từ chối |
| Lý do từ chối | Text nhiều dòng | Không | Chỉ người duyệt điền khi từ chối |

## Phần 2 - Kiểm tra trước khi dựng luồng

Vào `Settings` > `Configure workflows`.

Ghi lại câu trả lời cho từng mục dưới đây trong một ghi chú hoặc gửi lại cho Codex:

1. Có chọn được `Sequential business process` không?
2. Trong danh sách action có `Approve element`, `Condition` và `Send notification` không?
3. Nút `Export` có xuất hiện khi đang sửa template không?
4. Có thể chọn ba người duyệt khác nhau không?
5. Tài khoản đang dùng gói nào, hoặc thông báo lỗi/quyền gì nếu không mở được designer?

## Phần 3 - Dữ liệu demo để dùng xuyên suốt bài

Không dùng dữ liệu nhân sự thật. Tạo sáu tài khoản thử, hoặc ít nhất sáu vai trò có thể chọn trong Bitrix24:

| Vai trò | Tên demo |
|---|---|
| Người gửi | Nguyen Van An |
| Quản lý trực tiếp | Tran Thi Binh |
| Trưởng phòng nhân sự | Le Minh Chau |
| Trưởng phòng tài chính | Pham Gia Dung |
| Phó giám đốc tài chính | Hoang Thu Em |
| Giám đốc | Vu Quang Huy |

Nếu chỉ có một tài khoản để demo, vẫn cấu hình các vai trò bằng người dùng/nhóm khác nhau nếu hệ thống cho phép, nhưng ghi rõ hạn chế này trong tài liệu nộp bài.

## Điểm dừng an toàn

Chỉ chuyển sang `PLAN.md`, Mốc 2 sau khi biểu mẫu lưu thành công, các trường hiện đúng, và bạn đã xác nhận có action duyệt + export. Khi đó lần hướng dẫn tiếp theo sẽ là ghép `Condition` và ba action `Approve element` thành luồng nghỉ phép.
