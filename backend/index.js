import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { v2 as cloudinary } from 'cloudinary';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { PDFDocument } from 'pdf-lib';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- CẤU HÌNH CLOUDINARY ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- CẤU HÌNH GEMINI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

const upload = multer({ dest: 'uploads/' });
const uploadMany = upload.array('files', 5);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const PROMPT_TOEIC = `Bạn là chuyên gia TOEIC. Trích xuất CÂU HỎI TRẮC NGHIỆM từ file PDF đính kèm.
BẮT BUỘC TRẢ VỀ DUY NHẤT 1 MẢNG JSON, KHÔNG CÓ BẤT KỲ VĂN BẢN NÀO BÊN NGOÀI.
Cấu trúc: { "Part": int, "QuestionNo": int, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "CorrectAnswer": "", "ImageUrl": "" }`;

// --- HÀM 1: CẮT NHỎ PDF ---
async function splitPdfIntoChunks(pdfPath) {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();
    const chunkPaths = [];
    
    // Cắt 3 trang thành 1 file mini để đảm bảo an toàn Token
    const pagesPerChunk = 3; 
    
    for (let i = 0; i < totalPages; i += pagesPerChunk) {
        const miniPdf = await PDFDocument.create();
        const endPage = Math.min(i + pagesPerChunk, totalPages);
        const pagesToCopy = Array.from({length: endPage - i}, (_, index) => i + index);
        
        const copiedPages = await miniPdf.copyPages(pdfDoc, pagesToCopy);
        copiedPages.forEach(page => miniPdf.addPage(page));
        
        const miniPdfBytes = await miniPdf.save();
        const chunkPath = `uploads/chunk_${Date.now()}_${i}.pdf`;
        fs.writeFileSync(chunkPath, miniPdfBytes);
        chunkPaths.push(chunkPath);
    }
    return chunkPaths;
}

// --- HÀM 2: CÔNG NHÂN CHẠY NGẦM ---
async function processExamInBackground(pdfChunks, audioUrlMap, examName) {
    let finalQuestionsArray = [];

    console.log(`\n[Worker] Bắt đầu xử lý ngầm đề thi: ${examName}. Tổng số mảnh PDF: ${pdfChunks.length}`);

    for (let i = 0; i < pdfChunks.length; i++) {
        try {
            console.log(`[Worker] Đang tải mảnh ${i + 1}/${pdfChunks.length} lên Gemini...`);
            const chunkPath = pdfChunks[i];
            
            const uploadResponse = await fileManager.uploadFile(chunkPath, { 
                mimeType: "application/pdf", 
                displayName: `chunk_${i}.pdf` 
            });
            
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent([
                { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                { text: PROMPT_TOEIC }
            ]);
            
            let rawText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            finalQuestionsArray = [...finalQuestionsArray, ...JSON.parse(rawText)];
            
            await fileManager.deleteFile(uploadResponse.file.name);
            fs.unlinkSync(chunkPath); // Xóa mảnh PDF nội bộ sau khi xong
            
            console.log(`[Worker] [V] Mảnh ${i + 1} thành công!`);

            // BẮT BUỘC NGỦ ĐÔNG NẾU CHƯA PHẢI MẢNH CUỐI
            if (i < pdfChunks.length - 1) {
                console.log(`[Worker] ⏳ Đang ngủ 60 giây để né lỗi Token Limit của Google...`);
                await sleep(60000); 
            }

        } catch (error) {
            console.log(`[Worker] [!] Lỗi ở mảnh ${i + 1}: ${error.message}`);
        }
    }

    console.log(`\n[Worker] 🎉 HOÀN TẤT BÓC TÁCH ĐỀ THI: ${examName}! Tổng số câu: ${finalQuestionsArray.length}`);
    // Ở ĐÂY SẼ LÀ CODE LƯU VÀO MONGODB SAU NÀY
    // Tạm thời log ra để bạn biết nó đã ráp nối thành công
}


// --- API XỬ LÝ CHÍNH ---
app.post('/api/upload-exam', uploadMany, async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) return res.status(400).json({ message: 'Thiếu file!' });

        const pdfFile = files.find(f => f.mimetype === 'application/pdf');
        const zipFile = files.find(f => f.originalname.toLowerCase().endsWith('.zip'));
        let audioUrlMap = {}; 

        // 1. TRẢ LỜI NGAY CHO TRÌNH DUYỆT ĐỂ CHỐNG TIMEOUT
        res.json({ message: "Đã tiếp nhận file! Hệ thống đang xử lý ngầm, vui lòng chờ khoảng 10-15 phút để hoàn tất." });

        // 2. XỬ LÝ AUDIO (Nếu có)
        if (zipFile) {
            console.log(`[+] Đang giải nén và đẩy Audio lên Cloudinary...`);
            const extractedPath = path.join(process.cwd(), `uploads/audio_${Date.now()}`);
            fs.mkdirSync(extractedPath, { recursive: true });
            const zip = new AdmZip(zipFile.path);
            zip.extractAllTo(extractedPath, true);

            const audioFiles = fs.readdirSync(extractedPath).filter(f => f.match(/\.(mp3|wav)$/i));
            for (const file of audioFiles) {
                try {
                    const result = await cloudinary.uploader.upload(path.join(extractedPath, file), { resource_type: "video", folder: "toeic_audio" });
                    audioUrlMap[file.split('.')[0]] = result.secure_url;
                } catch (e) { console.error(`Lỗi Cloudinary:`, e.message); }
            }
            fs.rmSync(extractedPath, { recursive: true, force: true });
            fs.unlinkSync(zipFile.path);
            console.log(`[+] Đã tải xong Audio lên mây!`);
        }

        // 3. BĂM NHỎ PDF VÀ ĐƯA VÀO HÀNG ĐỢI CHẠY NGẦM
        if (pdfFile) {
            console.log(`[+] Đang băm nhỏ file PDF gốc...`);
            const pdfChunks = await splitPdfIntoChunks(pdfFile.path);
            fs.unlinkSync(pdfFile.path); // Xóa file gốc cho nhẹ máy

            // Kích hoạt công nhân chạy ngầm
            processExamInBackground(pdfChunks, audioUrlMap, pdfFile.originalname);
        }

    } catch (error) {
        console.error('Lỗi hệ thống Backend:', error);
    }
});

app.listen(PORT, () => console.log(`🚀 Backend Ultimate Free chạy tại http://localhost:${PORT}`));