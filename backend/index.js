import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// CẤU HÌNH MỚI: Mở thư mục tĩnh để Frontend có thể vào lấy file Audio
app.use('/audio', express.static(path.join(process.cwd(), 'uploads/audio')));

app.get('/', (req, res) => {
  res.send('Backend AI đang chạy ngon lành và đã sẵn sàng giải nén ZIP!');
});


const upload = multer({ dest: 'uploads/' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// Chấp nhận upload 2 file cùng lúc: examFile (PDF) và audioZip (.zip)
const cpUpload = upload.fields([{ name: 'examFile', maxCount: 1 }, { name: 'audioZip', maxCount: 1 }]);

app.post('/api/upload-exam', cpUpload, async (req, res) => {
  try {
    const pdfFile = req.files['examFile'] ? req.files['examFile'][0] : null;
    const zipFile = req.files['audioZip'] ? req.files['audioZip'][0] : null;

    if (!pdfFile) return res.status(400).json({ message: 'Vui lòng tải lên một file PDF!' });

    console.log(`[1] Đang tải PDF lên máy chủ Gemini...`);
    const uploadResponse = await fileManager.uploadFile(pdfFile.path, {
      mimeType: "application/pdf",
      displayName: pdfFile.originalname,
    });

    // --- LOGIC MỚI: GIẢI NÉN FILE ZIP ---
    let folderName = Date.now().toString(); // Tạo thư mục riêng cho đề này
    let extractedPath = path.join(process.cwd(), `uploads/audio/${folderName}`);
    
    if (zipFile) {
        console.log(`[+] Đang giải nén file Audio ZIP...`);
        if (!fs.existsSync(extractedPath)) fs.mkdirSync(extractedPath, { recursive: true });
        const zip = new AdmZip(zipFile.path);
        zip.extractAllTo(extractedPath, true);
        console.log(`[+] Giải nén hoàn tất!`);
    }

    console.log(`[2] Đang nhờ AI phân tích dữ liệu câu hỏi...`);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Hoặc 2.0-flash tùy bạn đang dùng
    
    const prompt = `
    Bạn là một chuyên gia phân tích dữ liệu. Hãy đọc nội dung đề thi TOEIC trong file PDF này và trích xuất TOÀN BỘ các câu hỏi trắc nghiệm.
    
    YÊU CẦU BẮT BUỘC:
    1. Trả về kết quả DƯỚI DẠNG MỘT MẢNG JSON hợp lệ. KHÔNG thêm bất kỳ văn bản nào khác.
    2. Cấu trúc của mỗi object trong mảng phải chính xác như sau:
    {
      "Part": (kiểu số nguyên từ 1 đến 7),
      "QuestionNo": (kiểu số nguyên, số thứ tự câu),
      "QuestionText": (nội dung câu hỏi, đối với part 1 hoặc 2 không có text thì ghi "(Mời xem hình ảnh / nghe Audio)"),
      "ImageUrl": "",
      "OptionA": (nội dung đáp án A),
      "OptionB": (nội dung đáp án B),
      "OptionC": (nội dung đáp án C),
      "OptionD": (nội dung đáp án D),
      "CorrectAnswer": ""
    }
    `;

    const result = await model.generateContent([
      { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
      { text: prompt }
    ]);

    let rawText = result.response.text();
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    let questionsArray = JSON.parse(rawText);

    // --- LOGIC MỚI: GHÉP AUDIO VÀO ĐÚNG CÂU HỎI ---
    if (zipFile && fs.existsSync(extractedPath)) {
        const audioFiles = fs.readdirSync(extractedPath);
        
        questionsArray = questionsArray.map(q => {
            // Tìm file mp3/wav phù hợp (vd: "1.mp3" khớp câu 1, "32-34.mp3" khớp câu 32,33,34)
            const matchedFile = audioFiles.find(file => {
                const name = path.basename(file, path.extname(file)); 
                if (name.includes('-')) {
                    const [start, end] = name.split('-');
                    return q.QuestionNo >= parseInt(start) && q.QuestionNo <= parseInt(end);
                }
                return parseInt(name) === q.QuestionNo;
            });

            if (matchedFile) {
                const name = path.basename(matchedFile, path.extname(matchedFile));
                // Nếu là một nhóm (vd 32-34), CHỈ gắn máy phát nhạc vào câu đầu tiên (câu 32)
                let isFirst = name.includes('-') ? q.QuestionNo === parseInt(name.split('-')[0]) : true;

                if (isFirst) {
                    q.AudioUrl = `http://localhost:5000/audio/${folderName}/${matchedFile}`;
                }
            }
            return q;
        });
    }

    // Dọn dẹp file tạm
    fs.unlinkSync(pdfFile.path);
    if (zipFile) fs.unlinkSync(zipFile.path);
    await fileManager.deleteFile(uploadResponse.file.name);

    console.log(`[3] Thành công! Đã trích xuất ${questionsArray.length} câu hỏi.`);
    res.json({ message: 'Trích xuất thành công!', examData: questionsArray });

  } catch (error) {
    console.error('Lỗi khi xử lý bằng AI:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server Backend chạy tại http://localhost:${PORT}`);
});