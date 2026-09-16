# Báo cáo thực hành Workflow Bitrix24

Người thực hiện: Dương Quang Thịnh. Ngày tổng hợp: 16/09/2026.

## 1. Kết quả thực hiện

Đã xây dựng hai mẫu Business Process tuần tự trên Lists: NghiPhep_3Cap và CongTac_4Cap. Hai mẫu có điều kiện đầu vào, duyệt tuần tự, nhánh từ chối, thông báo cho người tạo đơn và cập nhật trạng thái cuối. Các lần chạy thử đã chứng minh trạng thái Đã duyệt và Từ chối trên cả hai danh sách. Đây là bản demo, chưa phải hệ thống nhân sự hoặc ngân sách vận hành thực tế.

## 2. Hồ sơ bàn giao

- exports/bp-22.bpt: mẫu nghỉ phép 3 cấp, bản xuất ngày 16/09/2026.
- exports/bp-24.bpt: mẫu công tác 4 cấp, bản xuất ngày 16/09/2026.
- minh-chung/: tám ảnh gốc chụp giao diện trong quá trình thực hiện.
- KIEM_TRA_FILE.md: kết quả kiểm tra tĩnh hai file xuất.
- HUONG_DAN_NOP_GIT.md: đóng gói và đưa hồ sơ lên GitHub.

Không tự đổi đuôi file .bpt thành .bpx. Giữ định dạng thực tế do Bitrix24 xuất.

## 3. Quy trình nghỉ phép

Các trường biểu mẫu gồm họ tên, phòng ban, loại nghỉ, ngày bắt đầu, ngày kết thúc, lý do, số ngày xin nghỉ, số ngày phép còn lại, trạng thái và lý do từ chối.

Nếu số ngày xin nghỉ không lớn hơn số ngày phép còn lại, đơn đi qua Quản lý trực tiếp, Trưởng phòng nhân sự rồi Giám đốc. Cấp tiếp theo nằm trong nhánh đồng ý của cấp trước. Từ chối ở một cấp sẽ bỏ qua các cấp còn lại, gửi thông báo và cập nhật Từ chối. Nếu cả ba cấp đồng ý, hệ thống gửi thông báo và cập nhật Đã duyệt. Không đủ số ngày phép sẽ chuyển thẳng sang nhánh thông báo và cập nhật Từ chối.

Biến người dùng: QuanLyTrucTiep, TruongPhongNhanSu, GiamDoc. Các bước phê duyệt yêu cầu nhập ghi chú.

## 4. Quy trình công tác

Biểu mẫu gồm tiêu đề, họ tên, phòng ban, địa điểm, ngày bắt đầu, ngày kết thúc dự kiến, mục đích, danh sách chi phí, chi phí dự trù, đơn vị tiền tệ, ngân sách khả dụng, tài liệu đính kèm, trạng thái và lý do từ chối.

Nếu chi phí dự trù không lớn hơn ngân sách khả dụng, đơn đi qua Quản lý trực tiếp, Trưởng phòng tài chính, Phó giám đốc tài chính và Giám đốc. Các nhánh từ chối gửi thông báo, cập nhật Từ chối và bỏ qua cấp tiếp theo. Vượt ngân sách được từ chối tự động. Đồng ý ở cả bốn cấp gửi thông báo chi tiết rồi cập nhật Đã duyệt.

Biến người dùng: QuanLyTrucTiep, TruongPhongTaiChinh, PhoGiamDocTaiChinh, GiamDoc. Thông báo thành công lấy dữ liệu động từ đơn: tiêu đề, họ tên, địa điểm, thời gian, tổng tiền, đơn vị tiền tệ và danh sách chi phí. Số tiền được duyệt trong demo bằng chi phí dự trù; chưa có bước duyệt một số tiền khác.

## 5. Hướng dẫn sử dụng

1. Mở danh sách NghiPhep_3Cap hoặc CongTac_4Cap rồi bấm Add.
2. Nhập đủ các trường bắt buộc và dữ liệu điều kiện. Không tự đặt trạng thái kết quả khi thử nghiệm.
3. Bấm Save để tạo đơn. Trên môi trường demo, mẫu được cấu hình tự chạy khi tạo mới.
4. Người duyệt vào Workflows, mở nhiệm vụ và kiểm tra Workflow element để xác nhận đúng đơn.
5. Nhập ghi chú rồi chọn Duyệt hoặc Từ chối. Tiếp tục qua các cấp nếu đồng ý.
6. Xem Notifications để nhận kết quả. Về danh sách và tải lại để kiểm tra trạng thái cuối.
7. Mở Journal của lần chạy, mở rộng các nhiệm vụ nếu cần, để xem lịch sử từng cấp.

## 6. Kiểm thử và bằng chứng

| Tình huống | Dữ liệu | Kết quả quan sát |
|---|---|---|
| Nghỉ phép đủ ba cấp | Xin 2 ngày, còn 5 ngày | Có lịch sử ba cấp, thông báo; lần thử cập nhật trạng thái hiện Đã duyệt |
| Nghỉ phép thiếu số dư | Xin 2 ngày, còn 1 ngày | Thông báo không đủ phép, trạng thái Từ chối |
| Nghỉ phép từ chối cấp 1 | Xin 2 ngày, còn 5 ngày | Có thông báo từ chối cấp 1 ở lần thử trước khi thêm cập nhật trạng thái |
| Công tác đủ bốn cấp | Chi phí 3000000, ngân sách 5000000 VND | Có lịch sử bốn cấp; lần thử cập nhật trạng thái hiện Đã duyệt |
| Công tác vượt ngân sách | Chi phí 6000000, ngân sách 5000000 VND | Có thông báo và trạng thái Từ chối |
| Công tác từ chối cấp 1 | Chi phí 3000000, ngân sách 5000000 VND | Có thông báo từ chối cấp 1 ở lần thử trước khi thêm cập nhật trạng thái |
| Thông báo chi phí | Vé máy bay 2000000, khách sạn 1000000 | Hiển thị đúng tổng 3000000 VND và hai khoản chi |

Ảnh lịch sử 03 và 04 ghi nhận lần chạy trước khi bổ sung các bước cập nhật trạng thái. Ảnh 05 và 06 ghi nhận lần chạy mới sau thay đổi. Không xem các ảnh này là cùng một lần chạy. Completed chỉ cho biết quy trình kết thúc, không tự đồng nghĩa với được duyệt.

## 7. Thiết lập trên môi trường khác

File .bpt là mẫu quy trình, không được coi là bản sao lưu toàn bộ Lists và dữ liệu. Chưa thực hiện thử import trên một portal khác.

1. Chuẩn bị hai Lists cùng các trường và kiểu dữ liệu nêu trên.
2. Mở phần mẫu quy trình của danh sách phù hợp và dùng Import để chọn đúng file.
3. Kiểm tra lại các tham chiếu trường, điều kiện, người nhận và trường chèn trong thông báo.
4. Đặc biệt chọn lại các giá trị danh sách Trạng thái; file xuất lưu mã giá trị riêng của môi trường nguồn.
5. Gán lại các biến người duyệt bằng người dùng thực tế, không mặc định giữ user_1.
6. Kiểm tra quyền tạo đơn, xem đơn, phê duyệt và cấu hình tự chạy khi tạo mới.
7. Lưu rồi chạy lại các bài thử trước khi sử dụng. Nếu dùng để chấm bài, cấp quyền xem phù hợp trên portal demo, không gửi mật khẩu.

## 8. Giả định và giới hạn

- Tất cả biến người duyệt đang mặc định user_1 để thử nghiệm bằng một tài khoản. Chưa kiểm chứng phân quyền nhiều tài khoản thực.
- Số ngày xin nghỉ, số ngày phép còn lại và ngân sách được nhập tay. Chưa kết nối nguồn nhân sự/tài chính và chưa tự trừ số dư sau duyệt.
- Điều kiện nghỉ phép hiện so sánh số ngày cho mọi loại nghỉ; chưa có ngoại lệ dành cho nghỉ ốm/không lương. Các bài thử ở đây dùng nghỉ phép năm.
- Chưa có kiểm tra tự động ngày kết thúc, số âm, tổng chi tiết khớp tổng tiền hoặc sửa nội dung trong khi đang duyệt.
- Các bước SetField chỉ cập nhật Trạng thái cuối. Chưa tự cập nhật trạng thái chờ từng cấp hay sao chép ghi chú vào trường Lý do từ chối riêng. Ghi chú được nhập trong nhiệm vụ phê duyệt.
- Các nhánh từ chối cấp 2/3 của nghỉ phép và cấp 2/3/4 của công tác có trong cấu hình nhưng chưa có bằng chứng chạy thử từng nhánh. Chưa kiểm thử đính kèm và nhập lại mẫu trên portal khác.
- Thông báo đã kiểm thử qua Bitrix24, chưa kiểm chứng gửi email.

## 9. Danh mục ảnh

1. 01-so-do-nghi-phep.png: sơ đồ ba cấp và các nhánh cập nhật.
2. 02-so-do-cong-tac.png: sơ đồ bốn cấp và các nhánh cập nhật.
3. 03-lich-su-nghi-phep.png: lịch sử ba cấp.
4. 04-lich-su-cong-tac.png: lịch sử bốn cấp.
5. 05-trang-thai-nghi-phep.png: kết quả hai bài thử trạng thái.
6. 06-trang-thai-cong-tac.png: kết quả hai bài thử trạng thái.
7. 07-thong-bao-chi-phi.png: thông báo có số tiền và chi tiết.
8. 08-thong-bao-nghi-phep.png: thông báo kết quả nghỉ phép.

Ảnh giữ nguyên bản để đối chiếu; có tên tài khoản và địa chỉ portal demo. Cần xem lại quyền chia sẻ trước khi công khai.
