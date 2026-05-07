import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
// THÊM THƯ VIỆN QUẢN LÝ FILE CỦA GOOGLE
import { GoogleAIFileManager } from '@google/generative-ai/server';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Khởi tạo bộ não AI và Trình quản lý file bằng API Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => {
  res.send('Backend AI đang chạy ngon lành!');
});

app.post('/api/upload-exam', upload.single('examFile'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'Vui lòng tải lên một file PDF!' });
    }

    console.log(`[1] Đang tải file lên máy chủ Gemini: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // 1. Tải thẳng file PDF nguyên bản lên Google Gemini Server
    const uploadResponse = await fileManager.uploadFile(file.path, {
      mimeType: "application/pdf",
      displayName: file.originalname,
    });

    console.log(`[2] Đã tải xong lên AI. Đang phân tích dữ liệu (File nặng có thể mất 30s - 1 phút)...`);

    // 2. Gọi AI xử lý nội dung file vừa tải lên
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `
    Bạn là một chuyên gia phân tích dữ liệu. Hãy đọc nội dung đề thi TOEIC trong file PDF này và trích xuất TOÀN BỘ các câu hỏi trắc nghiệm.
    
    YÊU CẦU BẮT BUỘC:
    1. Trả về kết quả DƯỚI DẠNG MỘT MẢNG JSON hợp lệ. 
    2. KHÔNG thêm bất kỳ văn bản, lời chào, hay ký tự markdown (\`\`\`json) nào khác xung quanh mảng JSON.
    3. Cấu trúc của mỗi object trong mảng phải chính xác như sau:
    {
      "Part": (kiểu số nguyên từ 1 đến 7, bạn tự phân tích xem câu đó thuộc part nào),
      "QuestionNo": (kiểu số nguyên, số thứ tự câu),
      "QuestionText": (nội dung câu hỏi, đối với part 1 hoặc 2 không có text thì ghi "(Nghe Audio)"),
      "OptionA": (nội dung đáp án A),
      "OptionB": (nội dung đáp án B),
      "OptionC": (nội dung đáp án C),
      "OptionD": (nội dung đáp án D, riêng part 2 chỉ có 3 đáp án thì để trống ""),
      "CorrectAnswer": (để trống "")
    }
    `;

    // Truyền trực tiếp đường dẫn file của Google vào cho AI đọc
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: uploadResponse.file.uri
        }
      },
      { text: prompt }
    ]);

    let rawText = result.response.text();
    
    // 3. Làm sạch dữ liệu JSON
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const questionsArray = JSON.parse(rawText);

    // 4. Xóa file trên máy tính của bạn và dọn dẹp file trên máy chủ Google
    fs.unlinkSync(file.path);
    await fileManager.deleteFile(uploadResponse.file.name);

    console.log(`[3] Thành công! Đã trích xuất được ${questionsArray.length} câu hỏi.`);

    res.json({ 
      message: 'Trích xuất thành công!',
      fileName: file.originalname,
      examData: questionsArray
    });

  } catch (error) {
    console.error('Lỗi khi xử lý bằng AI:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Lỗi server khi AI xử lý tài liệu', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server Backend tích hợp AI đang chạy tại http://localhost:${PORT}`);
});