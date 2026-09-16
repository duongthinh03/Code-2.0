# Hướng dẫn gom ảnh và nộp bài qua GitHub

## Hồ sơ đã được gom

Thư mục HO_SO_NOP có exports chứa hai file .bpt, minh-chung chứa tám ảnh PNG đã đặt tên, BAO_CAO.md và KIEM_TRA_FILE.md. Không cần tìm lại ảnh trong Temp. File gốc ở Downloads và Temp không bị xóa hoặc sửa.

## Nếu cần thêm ảnh

1. Mở đúng màn hình kết quả trong Bitrix24. Chỉ dùng dữ liệu demo.
2. Nhấn Windows + Shift + S, chọn vùng đủ thấy tên đơn, kết quả và tiêu đề cột.
3. Mở ảnh vừa chụp trong Snipping Tool và Save As vào HO_SO_NOP/minh-chung.
4. Đặt tên rõ ràng như 09-tu-choi-cap-2.png. Không ghi đè ảnh khác và không sửa giá trị hiển thị trong ảnh.
5. Xem lại ảnh để tránh lộ mật khẩu, token, webhook, dữ liệu nhân sự thật hoặc thông báo riêng tư.

## Báo cáo Word hoặc PDF

BAO_CAO.md là bản báo cáo đọc trực tiếp trên GitHub. Nếu người chấm yêu cầu Word/PDF, mở bản xem Markdown trong VS Code hoặc GitHub, sao chép nội dung đã hiển thị vào Word. Thêm các ảnh bằng Insert Pictures, mỗi ảnh có chú thích tên và kết quả. Lưu BAO_CAO.docx rồi Export PDF nếu được yêu cầu. Kiểm tra từng trang trước khi nộp, bảo đảm ảnh và bảng không bị cắt. Không chỉ đổi đuôi .md thành .docx hoặc .pdf.

## Chuẩn bị GitHub

Repository cục bộ: F:/Users/Admin/Downloads/kiemtra/Code 2.0. Repository GitHub đã kết nối là https://github.com/duongthinh03/Code-2.0.git và đang để Public. Không chạy git init lại ở thư mục kiemtra hoặc HO_SO_NOP vì sẽ tạo repository lồng nhau.

Trong lần nộp đầu, chỉ đưa bài Workflow lên. File .gitignore ở thư mục gốc đang tạm bỏ qua bài 02, bài 03 và các PDF đề bài không liên quan. Trước khi công khai, kiểm tra lại ảnh: chúng chứa tên tài khoản và địa chỉ portal demo.

## Lệnh PowerShell

Chạy từng lệnh, dừng và đọc lỗi nếu có. Các lệnh dưới thêm toàn bộ thư mục bài 01 (gồm file xuất, báo cáo, ảnh minh chứng và PDF đề bài Workflow). Không dùng git add . nếu chưa xem lại danh sách.

```powershell
Set-Location 'F:\Users\Admin\Downloads\kiemtra\Code 2.0'
git status --short
git add -- .gitignore '01_Workflow_Bitrix24'
git diff --cached --stat
git diff --cached --name-only
git commit -m "Add Bitrix24 workflow assignment"
git branch -M main
git push -u origin main
```

Remote origin đã có sẵn. Không chạy lại git remote add origin và không dùng force push.

Nếu Git báo thiếu danh tính, cấu hình trong repository này bằng tên/email GitHub của chính bạn rồi chạy lại commit:

```powershell
git config user.name "TEN_CUA_BAN"
git config user.email "EMAIL_GITHUB_HOAC_NOREPLY_CUA_BAN"
```

Khi push yêu cầu đăng nhập, đăng nhập qua trình duyệt hoặc cơ chế xác thực GitHub của Git. Không gửi mật khẩu/token vào cuộc trò chuyện và không đặt token trong URL remote.

## Kiểm tra sau khi đẩy

1. Mở repository trên GitHub và vào 01_Workflow_Bitrix24/HO_SO_NOP.
2. Kiểm tra hai file xuất, tám ảnh, báo cáo và hướng dẫn đều có.
3. Mở thử các ảnh và báo cáo; tải thử một file .bpt nếu cần.
4. Với repository Private, cấp quyền người chấm trước khi gửi link.
5. Gửi URL repository và đường dẫn HO_SO_NOP qua đúng kênh được giao. GitHub không tự thay thế việc nộp qua email/LMS nếu đề yêu cầu.

Mẫu lời nộp: Em gửi bài thực hành hai workflow nghỉ phép 3 cấp và công tác 4 cấp. Hồ sơ gồm mẫu .bpt, báo cáo, kết quả kiểm tra và ảnh minh chứng tại thư mục 01_Workflow_Bitrix24/HO_SO_NOP. Các giả định và giới hạn demo được ghi trong báo cáo.
