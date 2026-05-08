import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { PDFDocument } from 'pdf-lib'; 
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/audio', express.static(path.join(process.cwd(), 'uploads/audio')));

const upload = multer({ dest: 'uploads/' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

const uploadMany = upload.array('files', 5);

// --- CÁC HÀM BỔ TRỢ TỐI ƯU ---

// 1. Hàm chờ (để tránh spam API quá nhanh)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 2. Hàm gọi AI có cơ chế TỰ ĐỘNG THỬ LẠI (Retry)
async function generateContentWithRetry(model, content, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await model.generateContent(content);
            return result.response.text();
        } catch (error) {
            if ((error.status === 503 || error.status === 429) && i < retries - 1) {
                console.log(`[!] Máy chủ bận (Lỗi ${error.status}). Đang thử lại lần ${i + 1} sau 15 giây...`);
                await sleep(15000);
                continue;
            }
            throw error;
        }
    }
}

// 3. Hàm "Thái nhỏ" PDF: Cứ 5 trang cắt thành 1 file riêng
async function splitPdf(inputPath, pagesPerChunk = 5) {
    const existingPdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const totalPages = pdfDoc.getPageCount();
    const chunks = [];

    for (let i = 0; i < totalPages; i += pagesPerChunk) {
        const newPdf = await PDFDocument.create();
        const end = Math.min(i + pagesPerChunk, totalPages);
        const pagesToCopy = Array.from({ length: end - i }, (_, k) => i + k);
        
        const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
        copiedPages.forEach(page => newPdf.addPage(page));
        
        const pdfBytes = await newPdf.save();
        const chunkPath = path.join(process.cwd(), `uploads/chunk_${Date.now()}_${i}.pdf`);
        fs.writeFileSync(chunkPath, pdfBytes);
        chunks.push(chunkPath);
    }
    return chunks;
}

// --- ENDPOINT CHÍNH ---

app.post('/api/upload-exam', uploadMany, async (req, res) => {
    let allCreatedFiles = []; // Theo dõi để xóa file tạm
    try {
        const files = req.files;
        if (!files || files.length === 0) return res.status(400).json({ message: 'Thiếu file!' });

        const pdfFiles = files.filter(f => f.mimetype === 'application/pdf');
        const zipFile = files.find(f => f.originalname.toLowerCase().endsWith('.zip'));

        // [1] Giải nén Audio
        let folderName = Date.now().toString();
        let extractedPath = path.join(process.cwd(), `uploads/audio/${folderName}`);
        if (zipFile) {
            console.log(`[+] Đang giải nén file Audio ZIP...`);
            if (!fs.existsSync(extractedPath)) fs.mkdirSync(extractedPath, { recursive: true });
            const zip = new AdmZip(zipFile.path);
            zip.extractAllTo(extractedPath, true);
        }

        // [2] Xử lý từng file PDF (Listening & Reading)
        let finalQuestionsArray = [];
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        for (const pdf of pdfFiles) {
            console.log(`[+] Đang xử lý file: ${pdf.originalname}`);
            
            // Cắt nhỏ file PDF này thành nhiều mảnh
            const pdfChunks = await splitPdf(pdf.path, 5);
            allCreatedFiles.push(...pdfChunks);

            for (let j = 0; j < pdfChunks.length; j++) {
                console.log(`    -> Đang phân tích mảnh ${j + 1}/${pdfChunks.length}...`);
                
                // Tải mảnh nhỏ lên Gemini
                const uploadRes = await fileManager.uploadFile(pdfChunks[j], {
                    mimeType: "application/pdf",
                    displayName: `chunk_${j}.pdf`
                });

                const prompt = `Trích xuất câu hỏi TOEIC từ PDF này thành mảng JSON. Cấu trúc: { "Part": int, "QuestionNo": int, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "CorrectAnswer": "" }`;

                const rawText = await generateContentWithRetry(model, [
                    { fileData: { mimeType: uploadRes.file.mimeType, fileUri: uploadRes.file.uri } },
                    { text: prompt }
                ]);

                try {
                    const chunkQuestions = JSON.parse(rawText);
                    finalQuestionsArray = [...finalQuestionsArray, ...chunkQuestions];
                } catch (parseError) {
                    console.log(`    [!] Lỗi trích xuất JSON ở mảnh ${j + 1}, đang bỏ qua mảnh này.`);
                }

                // Xóa mảnh trên Gemini ngay lập tức
                await fileManager.deleteFile(uploadRes.file.name);
                
                // Chờ 15 giây trước khi gửi mảnh tiếp theo để tránh bị giới hạn API
                await sleep(15000);
            }
        }

        // [3] RADAR KHỚP NỐI AUDIO
        if (zipFile && fs.existsSync(extractedPath)) {
            const getAllAudioFiles = (dir, fileList = []) => {
                const currentFiles = fs.readdirSync(dir);
                for (const file of currentFiles) {
                    const filePath = path.join(dir, file);
                    if (fs.statSync(filePath).isDirectory()) {
                        getAllAudioFiles(filePath, fileList);
                    } else if (file.toLowerCase().endsWith('.mp3') || file.toLowerCase().endsWith('.wav')) {
                        const relativePath = path.relative(extractedPath, filePath).replace(/\\/g, '/');
                        fileList.push({ name: file, relativePath: relativePath });
                    }
                }
                return fileList;
            };

            const audioFiles = getAllAudioFiles(extractedPath);
            finalQuestionsArray = finalQuestionsArray.map(q => {
                const matchedFile = audioFiles.find(f => {
                    const name = path.basename(f.name, path.extname(f.name)).trim();
                    const rangeMatch = name.match(/-(\d+)\s*-\s*(\d+)$/);
                    if (rangeMatch) return q.QuestionNo >= parseInt(rangeMatch[1]) && q.QuestionNo <= parseInt(rangeMatch[2]);
                    const singleMatch = name.match(/-(\d+)$/);
                    if (singleMatch) return q.QuestionNo === parseInt(singleMatch[1]);
                    return false;
                });

                if (matchedFile) {
                    const name = path.basename(matchedFile.name, path.extname(matchedFile.name)).trim();
                    const rangeMatch = name.match(/-(\d+)\s*-\s*(\d+)$/);
                    if (!rangeMatch || q.QuestionNo === parseInt(rangeMatch[1])) {
                        q.AudioUrl = `http://localhost:5000/audio/${folderName}/${encodeURI(matchedFile.relativePath)}`;
                    }
                }
                return q;
            });
        }

        // Dọn dẹp tất cả file tạm
        files.forEach(f => { if(fs.existsSync(f.path)) fs.unlinkSync(f.path); });
        allCreatedFiles.forEach(f => { if(fs.existsSync(f)) fs.unlinkSync(f); });

        console.log(`[!] Hoàn tất! Tổng cộng ${finalQuestionsArray.length} câu hỏi.`);
        res.json({ message: 'Thành công!', examData: finalQuestionsArray });

    } catch (error) {
        console.error('Lỗi hệ thống:', error);
        allCreatedFiles.forEach(f => { if(fs.existsSync(f)) fs.unlinkSync(f); });
        res.status(500).json({ message: error.message });
    }
});

// --- ROUTE TRANG CHỦ ĐỂ KHÔNG BỊ LỖI CANNOT GET / ---
app.get('/', (req, res) => {
  res.send('Backend cắt PDF tự động đang chạy rất ngon lành và đã sẵn sàng nhận file!');
});

app.listen(PORT, () => console.log(`🚀 Backend tối ưu chạy tại http://localhost:${PORT}`));