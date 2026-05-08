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

    // --- GIẢI NÉN FILE ZIP ---
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
    
    // NÂNG CẤP: Ép AI trả về chuẩn JSON 100%
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      }
    }); 
    
    const prompt = `
    Bạn là một chuyên gia phân tích dữ liệu. Hãy đọc nội dung đề thi TOEIC trong file PDF này và trích xuất TOÀN BỘ các câu hỏi trắc nghiệm.
    
    YÊU CẦU BẮT BUỘC:
    1. Trả về kết quả là MỘT MẢNG JSON hợp lệ. Không có text ở ngoài.
    2. Nếu trong văn bản câu hỏi/đáp án có dấu ngoặc kép, hãy escape nó cẩn thận.
    3. Cấu trúc của mỗi object trong mảng phải chính xác như sau:
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
    let questionsArray = [];
    
    // BẮT LỖI PARSE ĐỂ DỄ DEBUG
    try {
        questionsArray = JSON.parse(rawText);
    } catch (parseError) {
        console.error("Lỗi cú pháp JSON từ AI trả về. Dữ liệu thô:", rawText);
        throw new Error("AI trả về định dạng dữ liệu không chuẩn. Vui lòng thử lại!");
    }

    // --- LOGIC MỚI: GHÉP AUDIO VÀO ĐÚNG CÂU HỎI (CÓ RADAR XUYÊN THƯ MỤC) ---
    if (zipFile && fs.existsSync(extractedPath)) {
        
        // 1. Hàm đệ quy "Radar" quét mọi ngóc ngách để tìm file mp3
        const getAllAudioFiles = (dir, fileList = []) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                if (fs.statSync(filePath).isDirectory()) {
                    getAllAudioFiles(filePath, fileList); // Quét tiếp nếu là thư mục
                } else if (file.toLowerCase().endsWith('.mp3') || file.toLowerCase().endsWith('.wav')) {
                    // Lưu đường dẫn chuẩn để làm link URL sau này
                    const relativePath = path.relative(extractedPath, filePath).replace(/\\/g, '/');
                    fileList.push({ name: file, relativePath: relativePath });
                }
            }
            return fileList;
        };

        const audioFiles = getAllAudioFiles(extractedPath);
        console.log(`[+] Tìm thấy ${audioFiles.length} file audio trong ZIP.`);

        // 2. Thuật toán phân tích tên file và gắn vào câu hỏi
        questionsArray = questionsArray.map(q => {
            const matchedFileObj = audioFiles.find(fileObj => {
                const nameWithoutExt = path.basename(fileObj.name, path.extname(fileObj.name)).trim();
                
                // Trường hợp 1: Nhóm câu hỏi (VD: E26-T01-32-34)
                const rangeMatch = nameWithoutExt.match(/-(\d+)\s*-\s*(\d+)$/);
                if (rangeMatch) {
                    return q.QuestionNo >= parseInt(rangeMatch[1]) && q.QuestionNo <= parseInt(rangeMatch[2]);
                }
                
                // Trường hợp 2: Câu lẻ (VD: E26-T01-01)
                const singleMatch = nameWithoutExt.match(/-(\d+)$/);
                if (singleMatch) {
                    return q.QuestionNo === parseInt(singleMatch[1]);
                }
                return false;
            });

            if (matchedFileObj) {
                const nameWithoutExt = path.basename(matchedFileObj.name, path.extname(matchedFileObj.name)).trim();
                let isFirst = false;

                const rangeMatch = nameWithoutExt.match(/-(\d+)\s*-\s*(\d+)$/);
                if (rangeMatch) {
                    isFirst = q.QuestionNo === parseInt(rangeMatch[1]); // Chỉ gắn audio vào câu đầu của nhóm
                } else {
                    isFirst = true; // Câu lẻ thì luôn gắn
                }

                if (isFirst) {
                    q.AudioUrl = `http://localhost:5000/audio/${folderName}/${encodeURI(matchedFileObj.relativePath)}`;
                }
            }
            return q;
        });
    }

    // Dọn dẹp file tạm để tiết kiệm dung lượng
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

// Trả về thông báo để nếu vô tình mở localhost:5000 sẽ không hiện lỗi Cannot GET /
app.get('/', (req, res) => {
  res.send('Backend AI đang chạy ngon lành và đã sẵn sàng giải nén ZIP!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server Backend chạy tại http://localhost:${PORT}`);
});