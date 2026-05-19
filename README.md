# TOEIC Practice AI

Website luyện thi TOEIC Listening & Reading, có công cụ AI hỗ trợ tạo đề từ tài liệu PDF.

## Website Làm Gì?

- Học viên đăng nhập, chọn đề TOEIC, chọn part muốn làm và làm bài trên trình duyệt.
- Bài thi có audio, ảnh minh họa, passage reading, đồng hồ đếm ngược, bảng câu hỏi và chấm điểm sau khi nộp.
- Sau khi nộp bài, học viên xem lại đáp án đúng, đáp án đã chọn, điểm Listening/Reading, tổng điểm và giải thích chi tiết.
- Học viên có trang lịch sử để xem lại các lần luyện thi.
- Admin có dashboard để tạo đề, quản lý đề, quản lý user và cập nhật thêm file cho đề đã có.
- Trang từ vựng cho phép tạo flashcard, gợi ý từ tiếng Anh và gợi ý nghĩa tiếng Việt.

## Điểm AI Quan Trọng

Admin không cần nhập tay toàn bộ đề TOEIC. Luồng tạo đề hiện tại:

1. Upload PDF đề thi.
2. Upload PDF đáp án Listening và Reading.
3. Upload ZIP audio.
4. Cắt ảnh trực tiếp từ PDF cho Part 1, Part 3/4, Part 6/7.
5. Backend dùng Gemini để đọc PDF, bóc câu hỏi, đáp án đúng, transcript và giải thích.
6. Ảnh/audio được lưu lên Cloudinary.
7. Đề hoàn chỉnh được lưu vào MongoDB để học viên làm bài.

## Công Nghệ

- Frontend: React, Vite, React Router, React PDF, React Image Crop.
- Backend: Express, MongoDB/Mongoose, Multer, PDF Lib, AdmZip.
- AI: Google Generative AI/Gemini 2.5 Flash.
- Lưu media: Cloudinary.
- Auth: JWT và bcrypt.
- Từ vựng: Datamuse API và Google Translate public endpoint.

## Tài Khoản Test

Hai tài khoản demo vẫn được giữ để test local:

- Admin: `admin@toeic.com` / `admin123`
- User: `user@toeic.com` / `user123`

## Biến Môi Trường Backend

Tạo file `backend/.env`:

```env
MONGODB_URI=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
GEMINI_API_KEY=...
JWT_SECRET=...
```

Frontend mặc định gọi backend ở `http://localhost:5000`. Khi deploy, có thể tạo biến:

```env
VITE_API_URL=https://your-backend-domain.com
```

## Chạy Local

Backend:

```bash
cd backend
npm install
node index.js
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Kiểm Tra

```bash
cd frontend
npm run lint
npm run build
```

```bash
cd backend
node --check index.js
```
