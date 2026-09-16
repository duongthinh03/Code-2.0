# Bài 1 — Workflow Bitrix24

Nguồn: PDF Workflow, trang 1–2, bản sao trong thư mục này. Mục tiêu: làm **hai workflow bằng Business Process của Bitrix24**, xuất file và viết hướng dẫn. Không cần viết backend riêng theo đề.

## Mốc 0 — Kiểm tra điều kiện làm bài

- [ ] Vào tài khoản Bitrix24 và kiểm tra có thể tạo/sửa/chạy/xuất Business Process.
- [ ] Xác định nơi lưu biểu mẫu và yêu cầu, phù hợp tính năng tài khoản đang có.
- [ ] Chuẩn bị vai trò: nhân viên, quản lý trực tiếp, trưởng phòng nhân sự, trưởng phòng tài chính, phó giám đốc tài chính, giám đốc.
- [ ] Ghi cách gán người duyệt thực tế; tránh để người nộp tự duyệt do cấu hình nhầm.
- [ ] Xác định dữ liệu số ngày phép còn lại và ngân sách lấy từ đâu. Nếu dùng số nhập tay để demo, ghi rõ giả định.

**Xong mốc khi:** tạo được workflow thử và biết cách xuất. Nếu thiếu quyền/tính năng, giải quyết trước khi thiết kế toàn bộ.

## Mốc 1 — Vẽ logic và chuẩn bị trường dữ liệu

### Nghỉ phép

Nhân viên gửi → kiểm tra dữ liệu → Quản lý trực tiếp → Trưởng phòng nhân sự → Giám đốc → thông báo kết quả.

- [ ] Trường theo đề: họ tên, phòng ban, loại nghỉ (năm/ốm/không lương...), ngày bắt đầu, ngày kết thúc, lý do.
- [ ] Bổ sung phục vụ xử lý: số ngày xin nghỉ, số ngày còn lại, trạng thái, người duyệt, lý do từ chối.
- [ ] Kiểm tra ngày kết thúc không trước ngày bắt đầu; xác định cách tính ngày làm việc/ngày lịch và xử lý loại nghỉ không trừ phép năm.
- [ ] Có bước kiểm tra số ngày phép còn lại. Quy tắc trừ phép sau duyệt là đề xuất cần thống nhất, không được trừ nhiều lần khi chạy lại.

### Công tác

Nhân viên gửi → kiểm tra dữ liệu → Quản lý trực tiếp → Trưởng phòng tài chính → Phó giám đốc tài chính → Giám đốc → thông báo kết quả và chi phí được duyệt.

- [ ] Trường theo đề: họ tên, phòng ban, mục đích, địa điểm, thời gian, danh sách chi phí dự kiến, tổng chi phí và tài liệu đính kèm.
- [ ] Bổ sung phục vụ xử lý: ngân sách khả dụng, chi phí được duyệt, trạng thái và lý do từ chối.
- [ ] Tổng chi phí khớp các khoản; số tiền hợp lệ; có kiểm tra ngân sách khả dụng.

**Lưu ý đề:** trang 2, bước 3 có lỗi diễn đạt cấp duyệt. Plan dùng tuyến tuần tự 1 → 2 → 3 → 4 như tiêu đề và các vai trò yêu cầu.

## Mốc 2 — Làm nghỉ phép trước

1. Tạo biểu mẫu với nhãn dễ hiểu, trường bắt buộc và giá trị mẫu.
2. Tạo trạng thái chờ từng cấp, đã duyệt, từ chối; có thể thêm yêu cầu bổ sung.
3. Làm đường duyệt đồng ý của cả ba cấp.
4. Thêm nhánh từ chối ở **mỗi cấp**: ghi người từ chối, thời gian, lý do; thông báo nhân viên và dừng tuyến duyệt tiếp.
5. Thêm kiểm tra điều kiện và thông báo tự động bằng tin nhắn Bitrix24 hoặc email.
6. Kiểm tra lịch sử phê duyệt lưu được ai duyệt, lúc nào, kết quả gì.
7. Cho chỉnh sửa trước duyệt cuối. Đề xuất: sửa thông tin quan trọng thì quay lại cấp cần duyệt, không giữ phê duyệt cũ cho nội dung đã thay đổi.

**Xong mốc khi:** yêu cầu hợp lệ qua đủ ba cấp; từ chối tại bất kỳ cấp nào đều kết thúc đúng và có thông báo/lý do.

## Mốc 3 — Làm công tác

Dựa trên cấu trúc đã hiểu từ nghỉ phép, tạo quy trình riêng với bốn cấp. Thêm danh sách chi phí, tổng tiền, kiểm tra ngân sách, tệp đính kèm và thông báo chi phí cuối cùng. Kiểm tra lại từng người duyệt; không sao chép nguyên vai trò nhân sự sang tài chính.

**Xong mốc khi:** cả bốn cấp hoạt động, xem được đính kèm, số tiền thông báo đúng và mọi cấp đều có nhánh từ chối.

## Mốc 4 — Kiểm thử có bằng chứng

| Tình huống | Kết quả cần thấy |
|---|---|
| Nghỉ phép hợp lệ | Duyệt đúng 3 cấp, báo thành công, lịch sử đầy đủ |
| Từ chối nghỉ phép tại từng cấp (3 lượt) | Không chuyển cấp tiếp, có lý do và thông báo |
| Không đủ phép / ngày sai | Chặn hoặc trả về bổ sung theo quy tắc đã ghi |
| Công tác hợp lệ | Duyệt đúng 4 cấp, báo số tiền được duyệt |
| Từ chối công tác tại từng cấp (4 lượt) | Không chuyển cấp tiếp, có lý do và thông báo |
| Vượt ngân sách / tổng chi phí sai | Không tự phê duyệt, có xử lý điều kiện rõ ràng |
| Chỉnh sửa trước duyệt cuối | Nội dung mới được xét duyệt đúng quy tắc |
| Tệp đính kèm và audit trail | Người có quyền xem được tệp và lịch sử |

Lưu ảnh và kết quả thực tế sau mỗi tình huống; không chỉ đánh dấu “đã test”.

## Mốc 5 — Xuất và đóng gói

- [ ] Export **hai** workflow từ Bitrix24, ví dụ `NghiPhep_3Cap` và `ChiPhiCongTac_4Cap` với đuôi hệ thống thực sự xuất.
- [ ] Đề có `.bpx` và ví dụ `.bpt` không thống nhất; xác nhận định dạng tương thích được chấp nhận. Không tự tạo file giả hoặc chỉ đổi đuôi.
- [ ] Thử import vào bản thử nghiệm nếu có thể; ghi các trường/người dùng cần cấu hình lại.
- [ ] Viết tài liệu **Word hoặc PDF**: điều kiện tài khoản, thiết lập trường, gán người duyệt, import, chạy, kiểm tra kết quả, giả định và lỗi thường gặp.
- [ ] Đối chiếu cả hai workflow với đề trước khi nộp qua kênh được chỉ định.

## Lần tới hỏi thế nào?

“Mình làm bài Workflow, mốc 0. Hãy hướng dẫn kiểm tra quyền Business Process và export trên tài khoản của mình.” Khi bắt đầu thao tác, cần biết tài khoản/giao diện thực tế; plan chưa giả định tên nút hay khả năng theo gói hiện hành.
