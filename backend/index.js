import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { PDFDocument } from 'pdf-lib';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "toeic_secret_key_2026_sieu_bao_mat";

app.use(cors());
app.use(express.json());

// --- MONGODB ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Đã mở khóa Két sắt MongoDB thành công!'))
  .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

const examSchema = new mongoose.Schema({
    name: String,
    duration: Number,
    createdAt: { type: Date, default: Date.now },
    questions: Array 
});
const Exam = mongoose.model('Exam', examSchema);

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true }, 
    password: { type: String, required: true },
    role: { type: String, default: 'user' } 
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

// --- CLOUDINARY ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- GEMINI AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

const upload = multer({ dest: 'uploads/' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getAllAudioFiles = (dirPath, arrayOfFiles = []) => {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllAudioFiles(fullPath, arrayOfFiles);
        } else if (file.match(/\.(mp3|wav)$/i)) {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
};

// ==========================================
// HÀM AI ĐỌC FILE ĐÁP ÁN (KEY)
// ==========================================
async function processKeyPdf(filePath, keyName) {
    let extractedKeys = {};
    if (!filePath || !fs.existsSync(filePath)) return extractedKeys;

    console.log(`\n[Key Parser] 🧠 Bắt đầu đọc file Đáp án ${keyName}...`);
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();
    const pagesPerChunk = 5; 

    for (let j = 0; j < totalPages; j += pagesPerChunk) {
        const endIndex = Math.min(j + pagesPerChunk, totalPages);
        console.log(`[Key Parser] Đang quét đáp án ${keyName} (Trang ${j + 1} - ${endIndex})...`);

        const subDocument = await PDFDocument.create();
        const indices = Array.from({length: endIndex - j}, (_, index) => j + index);
        const copiedPages = await subDocument.copyPages(pdfDoc, indices);
        copiedPages.forEach((page) => subDocument.addPage(page));
        const subPdfBytes = await subDocument.save();
        
        const tempPdfPath = path.join(process.cwd(), `uploads/key_temp_${Date.now()}_${j}.pdf`);
        fs.writeFileSync(tempPdfPath, subPdfBytes);

        let attempt = 0;
        let chunkSuccess = false;

        while (attempt < 3 && !chunkSuccess) {
            attempt++;
            let uploadResponse;
            try {
                uploadResponse = await fileManager.uploadFile(tempPdfPath, {
                    mimeType: "application/pdf", displayName: `Đáp án ${keyName} Trang ${j+1}-${endIndex}`,
                });

                const model = genAI.getGenerativeModel({ 
                    model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" }
                });

                const PROMPT_KEY = `Bạn là chuyên gia chấm thi TOEIC. Hãy bóc tách ĐÁP ÁN ĐÚNG và LỜI GIẢI THÍCH từ tài liệu sau.
                - YÊU CẦU QUAN TRỌNG: Phần "Explanation" BẮT BUỘC phải lấy toàn bộ Transcript (Lời thoại), Giải thích chi tiết và DỊCH NGHĨA TIẾNG VIỆT.
                - Trình bày rõ ràng: Đảm bảo các đáp án (A), (B), (C), (D) được ngắt dòng rành mạch.
                - Định dạng JSON trả về bắt buộc:
                { "keys": [ { "QuestionNo": 101, "CorrectAnswer": "A", "Explanation": "Nội dung lời thoại, giải thích và bản dịch tiếng Việt chi tiết..." } ] }
                - Nếu phần tài liệu này không chứa đáp án câu nào, hãy trả về { "keys": [] }`;

                const result = await model.generateContent([
                    { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                    { text: PROMPT_KEY },
                ]);

                let rawText = result.response.text();
                const firstBrace = rawText.indexOf('{');
                const lastBrace = rawText.lastIndexOf('}');

                if (firstBrace !== -1 && lastBrace !== -1) {
                    const parsedData = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
                    if (parsedData.keys && Array.isArray(parsedData.keys)) {
                        parsedData.keys.forEach(k => {
                            if (k.QuestionNo) {
                                extractedKeys[k.QuestionNo] = {
                                    CorrectAnswer: k.CorrectAnswer || "",
                                    Explanation: k.Explanation || ""
                                };
                            }
                        });
                        chunkSuccess = true;
                        console.log(`[Key Parser] [V] Đã lấy thành công đáp án của ${parsedData.keys.length} câu.`);
                    }
                }
            } catch (error) {
                console.error(`[Key Parser] [!] Lỗi đọc đáp án (Lần thử ${attempt}):`, error.message);
                if (attempt < 3) await sleep(60000); 
            } finally {
                if (uploadResponse) try { await fileManager.deleteFile(uploadResponse.file.name); } catch(e){}
            }
        }
        try { fs.unlinkSync(tempPdfPath); } catch(e){}
        if (j + pagesPerChunk < totalPages) {
            console.log(`[Key Parser] ⏳ Ngủ 60s chờ hồi Token...`);
            await sleep(60000);
        }
    }
    try { fs.unlinkSync(filePath); } catch(e){}
    return extractedKeys;
}

// ==========================================
// HÀM CHẠY NGẦM BÓC TÁCH ĐỀ THI (TẠO MỚI)
// ==========================================
async function processExamInBackground(pdfFiles, examName, duration, partsArray, cropFiles, zipFilePath, listeningKeyPath, readingKeyPath) {
    try {
        console.log(`\n======================================================`);
        console.log(`[Worker] Bắt đầu xử lý ĐỀ THI: ${examName}`);
        
        const listeningKeys = await processKeyPdf(listeningKeyPath, "Listening");
        const readingKeys = await processKeyPdf(readingKeyPath, "Reading");
        const allKeys = { ...listeningKeys, ...readingKeys }; 

        let finalQuestionsArray = [];
        let audioUrlMap = {}; 
        let taskImageMap = {}; 

        if (cropFiles && cropFiles.length > 0) {
            console.log(`\n[+] Đang đẩy ${cropFiles.length} bức ảnh scan lên Cloudinary...`);
            for (const file of cropFiles) {
                try {
                    const taskId = file.fieldname; 
                    const result = await cloudinary.uploader.upload(file.path, { folder: "toeic_crops" });
                    if (!taskImageMap[taskId]) taskImageMap[taskId] = [];
                    taskImageMap[taskId].push(result.secure_url);
                    fs.unlinkSync(file.path); 
                } catch (e) {}
            }
        }

        if (zipFilePath && fs.existsSync(zipFilePath)) {
            console.log(`\n[+] Đang giải nén và phân loại Audio...`);
            const extractedPath = path.join(process.cwd(), `uploads/audio_${Date.now()}`);
            fs.mkdirSync(extractedPath, { recursive: true });
            const zip = new AdmZip(zipFilePath);
            zip.extractAllTo(extractedPath, true);

            const audioFiles = getAllAudioFiles(extractedPath);
            for (const filePath of audioFiles) {
                try {
                    const result = await cloudinary.uploader.upload(filePath, { resource_type: "video", folder: "toeic_audio" });
                    const fileUrl = result.secure_url;
                    const baseName = path.basename(filePath).split('.')[0]; 
                    const match = baseName.match(/(?:^|-)(\d+)(?:-(\d+))?$/); 
                    if (match) {
                        let start = parseInt(match[1], 10);
                        let end = match[2] ? parseInt(match[2], 10) : start;
                        if (end - start > 5) start = end; 
                        for (let k = start; k <= end; k++) { audioUrlMap[k] = fileUrl; }
                    }
                } catch (e) { }
            }
            fs.rmSync(extractedPath, { recursive: true, force: true });
            fs.unlinkSync(zipFilePath);
        }

        if (partsArray.includes(1)) {
            for (let i = 1; i <= 6; i++) {
                const images = taskImageMap[`part1_image_${i}`] || [];
                finalQuestionsArray.push({
                    Part: 1, QuestionNo: i, QuestionText: "(Nghe Audio và chọn đáp án mô tả đúng nhất bức tranh)",
                    OptionA: "A", OptionB: "B", OptionC: "C", OptionD: "D", ImageUrl: images.length > 0 ? images[0] : "", 
                    AudioUrl: audioUrlMap[i] || "", CorrectAnswer: allKeys[i]?.CorrectAnswer || "", Explanation: allKeys[i]?.Explanation || ""
                });
            }
        }

        if (partsArray.includes(2)) {
            for (let i = 7; i <= 31; i++) {
                finalQuestionsArray.push({
                    Part: 2, QuestionNo: i, QuestionText: "(Nghe Audio và chọn câu phản hồi đúng nhất)",
                    OptionA: "A", OptionB: "B", OptionC: "C", OptionD: "", ImageUrl: "",
                    AudioUrl: audioUrlMap[i] || "", CorrectAnswer: allKeys[i]?.CorrectAnswer || "", Explanation: allKeys[i]?.Explanation || ""
                });
            }
        }

        if (pdfFiles && pdfFiles.length > 0) {
            console.log(`\n[+] Bắt đầu quét nội dung File Đề Thi...`);
            for (let i = 0; i < pdfFiles.length; i++) {
                const pdfFile = pdfFiles[i];
                const pdfBytes = fs.readFileSync(pdfFile.path);
                const pdfDoc = await PDFDocument.load(pdfBytes);
                const totalPages = pdfDoc.getPageCount();
                const pagesPerChunk = 3; 

                for (let j = 0; j < totalPages; j += pagesPerChunk) {
                    const endIndex = Math.min(j + pagesPerChunk, totalPages);
                    
                    // 💡 THÊM MỚI LOG TIẾN ĐỘ: Giúp bạn biết hệ thống đang chạy đến trang mấy
                    console.log(`[Exam Parser] 🧠 Đang quét Đề thi (Trang ${j + 1} - ${endIndex} / Tổng ${totalPages} trang)...`);

                    const subDocument = await PDFDocument.create();
                    const indices = Array.from({length: endIndex - j}, (_, index) => j + index);
                    const copiedPages = await subDocument.copyPages(pdfDoc, indices);
                    copiedPages.forEach((page) => subDocument.addPage(page));
                    const subPdfBytes = await subDocument.save();
                    const tempPdfPath = path.join(process.cwd(), `uploads/temp_${Date.now()}_${j}.pdf`);
                    fs.writeFileSync(tempPdfPath, subPdfBytes);

                    let attempt = 0;
                    let chunkSuccess = false;

                    while (attempt < 3 && !chunkSuccess) {
                        attempt++;
                        let uploadResponse;
                        try {
                            uploadResponse = await fileManager.uploadFile(tempPdfPath, {
                                mimeType: "application/pdf", displayName: `Đề thi Trang ${j + 1}-${endIndex}`,
                            });
                            
                            const model = genAI.getGenerativeModel({ 
                                model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" }
                            });

                            const PROMPT_TOEIC = `Bạn là chuyên gia TOEIC. Hãy bóc tách các câu hỏi trắc nghiệm từ văn bản.
                            - Lấy CHUẨN XÁC số thứ tự câu hỏi (QuestionNo).
                            - Bỏ qua Part 1, 2. Chỉ tập trung Part 3, 4, 5, 6, 7.
                            - TUYỆT ĐỐI KHÔNG CẦN đọc và trích xuất đoạn văn (PassageText). Hãy để "PassageText": "".
                            - Bắt buộc trả về định dạng JSON:
                            { "questions": [ { "Part": int, "QuestionNo": int, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "PassageText": "" } ] }`;

                            const result = await model.generateContent([
                                { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                                { text: PROMPT_TOEIC },
                            ]);

                            let rawText = result.response.text();
                            const firstBrace = rawText.indexOf('{');
                            const lastBrace = rawText.lastIndexOf('}');

                            if (firstBrace !== -1 && lastBrace !== -1) {
                                const parsedData = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
                                
                                // 💡 SỬA LỖI LOGIC: Chỉ cần AI trả về mảng hợp lệ (kể cả 0 câu) là cho qua luôn, không ép loop lại
                                if (parsedData.questions && Array.isArray(parsedData.questions)) {
                                    if (parsedData.questions.length > 0) {
                                        const processedQuestions = parsedData.questions.map(q => {
                                            let pImages = [];
                                            let graphicUrl = ""; 

                                            for (const taskId in taskImageMap) {
                                                const parts = taskId.split('_'); 
                                                if (parts.length === 3) {
                                                    const start = parseInt(parts[1], 10);
                                                    const end = parseInt(parts[2], 10);
                                                    if (q.QuestionNo >= start && q.QuestionNo <= end) {
                                                        if (taskId.startsWith('part6_') || taskId.startsWith('part7_')) {
                                                            pImages = taskImageMap[taskId];
                                                        }
                                                        if (taskId.startsWith('part3_') || taskId.startsWith('part4_')) {
                                                            graphicUrl = taskImageMap[taskId][0] || "";
                                                        }
                                                        break; 
                                                    }
                                                }
                                            }

                                            return {
                                                ...q,
                                                AudioUrl: audioUrlMap[q.QuestionNo] || "",
                                                PassageImages: pImages,
                                                ImageUrl: graphicUrl || "", 
                                                CorrectAnswer: allKeys[q.QuestionNo]?.CorrectAnswer || "", 
                                                Explanation: allKeys[q.QuestionNo]?.Explanation || ""      
                                            };
                                        });

                                        finalQuestionsArray = [...finalQuestionsArray, ...processedQuestions];
                                    }
                                    chunkSuccess = true; 
                                    console.log(`[Exam Parser] [V] Đã đọc xong Trang ${j+1}-${endIndex}. Ghi nhận thêm ${parsedData.questions.length} câu mới.`);
                                }
                            }
                        } catch (error) {
                            console.error(`[Exam Parser] ❌ Lỗi quét nội dung (Lần thử ${attempt}):`, error.message);
                            if (attempt < 3) await sleep(60000);
                        } finally {
                            if (uploadResponse) try { await fileManager.deleteFile(uploadResponse.file.name); } catch(e){}
                        }
                    } 
                    try { fs.unlinkSync(tempPdfPath); } catch(e){}
                    if (j + pagesPerChunk < totalPages || i < pdfFiles.length - 1) {
                        console.log(`[Exam Parser] ⏳ Nghỉ 60 giây chống sập nghẽn Token...`);
                        await sleep(60000);
                    }
                }
                try { fs.unlinkSync(pdfFile.path); } catch(e){}
            }
        }

        // SẮP XẾP LẠI CÂU HỎI TRƯỚC KHI LƯU
        finalQuestionsArray.sort((a, b) => a.QuestionNo - b.QuestionNo);

        console.log(`\n[Worker] 🎉 HOÀN TẤT ĐỀ THI: ${examName}! Tổng số câu: ${finalQuestionsArray.length}`);
        
        if (finalQuestionsArray.length > 0) {
            const newExam = new Exam({ name: examName, duration: duration, questions: finalQuestionsArray });
            await newExam.save();
            console.log(`[Worker] 💾 ĐÃ LƯU THÀNH CÔNG ĐỀ THI KÈM ĐÁP ÁN & GIẢI THÍCH VÀO DATABASE!`);
        }

    } catch (error) {
        console.error(`[Worker] ❌ Lỗi xử lý ngầm:`, error.message);
    }
}

// ==========================================
// API NHẬN FILE TỪ GIAO DIỆN (CREATE)
// ==========================================
app.post('/api/upload-exam', upload.any(), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) return res.status(400).json({ message: 'Thiếu file!' });

        const examName = req.body.name || "Đề thi TOEIC Mới";
        const duration = req.body.duration || 120;
        const selectedParts = JSON.parse(req.body.parts || "[]");

        const pdfFiles = files.filter(f => f.fieldname === 'examFiles' && f.mimetype === 'application/pdf');
        const zipFile = files.find(f => f.fieldname === 'audioZip' || f.originalname.toLowerCase().endsWith('.zip'));
        const cropFiles = files.filter(f => f.mimetype.startsWith('image/'));
        const listeningKeyFile = files.find(f => f.fieldname === 'listeningKey');
        const readingKeyFile = files.find(f => f.fieldname === 'readingKey');

        res.json({ message: "Đã tiếp nhận toàn bộ file! Hệ thống AI đang bắt đầu chấm và đọc đề..." });

        processExamInBackground(
            pdfFiles, examName, duration, selectedParts, cropFiles, 
            zipFile ? zipFile.path : null,
            listeningKeyFile ? listeningKeyFile.path : null,
            readingKeyFile ? readingKeyFile.path : null
        );

    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ' });
    }
});

app.get('/api/exams', async (req, res) => {
    try { res.json(await Exam.find().sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});
app.delete('/api/exams/:id', async (req, res) => {
    try { await Exam.findByIdAndDelete(req.params.id); res.json({ message: "Đã xóa!" }); } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

// ==========================================
// API MỚI: CẬP NHẬT & BỔ SUNG FILE CHO ĐỀ THI ĐÃ CÓ
// ==========================================
app.put('/api/exams/:id/append-files', upload.any(), async (req, res) => {
    try {
        const examId = req.params.id;
        const files = req.files;
        
        const updateData = {};
        if (req.body.name) updateData.name = req.body.name;
        if (req.body.duration) updateData.duration = req.body.duration;
        await Exam.findByIdAndUpdate(examId, updateData);

        if (!files || files.length === 0) {
            return res.json({ message: "Đã cập nhật thông tin cơ bản (Không có file mới)." });
        }

        res.json({ message: "Đã lưu thông tin! Hệ thống AI đang chạy ngầm để gộp và sắp xếp file mới..." });

        setTimeout(async () => {
            try {
                console.log(`\n[Worker Update] Đang bóc tách file bổ sung cho đề thi ID: ${examId}`);
                const exam = await Exam.findById(examId);
                if (!exam) return;

                let updatedQuestions = [...exam.questions];
                let allKeys = {};
                let taskImageMap = {}; 

                const existingQuestionNumbers = updatedQuestions.map(q => q.QuestionNo);
                const existingQsText = existingQuestionNumbers.length > 0 ? existingQuestionNumbers.join(', ') : "Chưa có câu nào";

                const examPdfFiles = files.filter(f => f.fieldname === 'examFiles' && f.mimetype === 'application/pdf');
                const listeningKeyFile = files.find(f => f.fieldname === 'listeningKey');
                const readingKeyFile = files.find(f => f.fieldname === 'readingKey');
                const zipFile = files.find(f => f.fieldname === 'audioZip' || f.originalname.toLowerCase().endsWith('.zip'));
                const cropFiles = files.filter(f => f.mimetype.startsWith('image/')); 

                if (cropFiles && cropFiles.length > 0) {
                    console.log(`\n[+] Đang đẩy ${cropFiles.length} bức ảnh scan bổ sung lên Cloudinary...`);
                    for (const file of cropFiles) {
                        try {
                            const taskId = file.fieldname; 
                            const result = await cloudinary.uploader.upload(file.path, { folder: "toeic_crops" });
                            if (!taskImageMap[taskId]) taskImageMap[taskId] = [];
                            taskImageMap[taskId].push(result.secure_url);
                            fs.unlinkSync(file.path); 
                        } catch (e) {}
                    }
                }

                if (examPdfFiles && examPdfFiles.length > 0) {
                    console.log(`\n[+] Bắt đầu quét nội dung ${examPdfFiles.length} File ĐỀ THI bổ sung...`);
                    for (let i = 0; i < examPdfFiles.length; i++) {
                        const examPdfFile = examPdfFiles[i];
                        const pdfBytes = fs.readFileSync(examPdfFile.path);
                        const pdfDoc = await PDFDocument.load(pdfBytes);
                        const totalPages = pdfDoc.getPageCount();
                        const pagesPerChunk = 3;

                        for (let j = 0; j < totalPages; j += pagesPerChunk) {
                            const endIndex = Math.min(j + pagesPerChunk, totalPages);
                            console.log(`[Worker Update] 🧠 Đang quét bổ sung (Trang ${j + 1} - ${endIndex} / Tổng ${totalPages} trang)...`);

                            const subDocument = await PDFDocument.create();
                            const indices = Array.from({length: endIndex - j}, (_, index) => j + index);
                            const copiedPages = await subDocument.copyPages(pdfDoc, indices);
                            copiedPages.forEach((page) => subDocument.addPage(page));
                            const subPdfBytes = await subDocument.save();
                            const tempPdfPath = path.join(process.cwd(), `uploads/temp_upd_${Date.now()}_${j}.pdf`);
                            fs.writeFileSync(tempPdfPath, subPdfBytes);

                            let attempt = 0;
                            let chunkSuccess = false;

                            while (attempt < 3 && !chunkSuccess) {
                                attempt++;
                                let uploadResponse;
                                try {
                                    uploadResponse = await fileManager.uploadFile(tempPdfPath, {
                                        mimeType: "application/pdf", displayName: `Đề thi bổ sung Trang ${j + 1}-${endIndex}`,
                                    });

                                    const model = genAI.getGenerativeModel({
                                        model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" }
                                    });

                                    const PROMPT_TOEIC = `Bạn là chuyên gia TOEIC. Hãy bóc tách các câu hỏi trắc nghiệm từ văn bản.
                                    - Lấy CHUẨN XÁC số thứ tự câu hỏi (QuestionNo).
                                    - Bỏ qua Part 1, 2. Chỉ tập trung Part 3, 4, 5, 6, 7.
                                    - 🛑 QUAN TRỌNG: Hệ thống ĐÃ CÓ SẴN các câu hỏi số: [${existingQsText}]. 
                                      Hãy BỎ QUA HOÀN TOÀN các câu hỏi này, KHÔNG phân tích và KHÔNG trích xuất chúng. Tốc độ là ưu tiên hàng đầu, CHỈ tìm và trích xuất những câu hỏi mới.
                                    - Bắt buộc trả về định dạng JSON:
                                    { "questions": [ { "Part": int, "QuestionNo": int, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "PassageText": "" } ] }
                                    - Nếu trong văn bản này KHÔNG CÓ câu hỏi nào mới, hãy trả về mảng rỗng: { "questions": [] }`;

                                    const result = await model.generateContent([
                                        { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                                        { text: PROMPT_TOEIC },
                                    ]);

                                    let rawText = result.response.text();
                                    const firstBrace = rawText.indexOf('{');
                                    const lastBrace = rawText.lastIndexOf('}');

                                    if (firstBrace !== -1 && lastBrace !== -1) {
                                        const parsedData = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
                                        
                                        // 💡 ĐỒNG BỘ SỬA LỖI LOGIC TẠI ĐÂY CHO ĐƯỜNG UPDATE
                                        if (parsedData.questions && Array.isArray(parsedData.questions)) {
                                            if (parsedData.questions.length > 0) {
                                                parsedData.questions.forEach(newQ => {
                                                    const existingQIndex = updatedQuestions.findIndex(q => q.QuestionNo === newQ.QuestionNo);
                                                    if (existingQIndex !== -1) {
                                                        updatedQuestions[existingQIndex] = { ...updatedQuestions[existingQIndex], ...newQ };
                                                    } else {
                                                        updatedQuestions.push({
                                                            ...newQ, AudioUrl: "", PassageImages: [], ImageUrl: "", CorrectAnswer: "", Explanation: ""
                                                        });
                                                    }
                                                });
                                            }
                                            chunkSuccess = true;
                                            console.log(`[Worker Update] [V] Đã xử lý xong Trang ${j+1}-${endIndex}. Nhận thêm ${parsedData.questions.length} câu.`);
                                        }
                                    }
                                } catch (error) {
                                    console.error(`[Worker Update] ❌ Lỗi quét bổ sung (Lần thử ${attempt}):`, error.message);
                                    if (attempt < 3) await sleep(60000);
                                } finally {
                                    if (uploadResponse) try { await fileManager.deleteFile(uploadResponse.file.name); } catch(e){}
                                }
                            }
                            try { fs.unlinkSync(tempPdfPath); } catch(e){}
                            if (j + pagesPerChunk < totalPages || i < examPdfFiles.length - 1) {
                                console.log(`[Worker Update] ⏳ Nghỉ 60 giây chống sập nghẽn Token...`);
                                await sleep(60000);
                            }
                        }
                        try { fs.unlinkSync(examPdfFile.path); } catch(e){} 
                    }
                }

                if (listeningKeyFile) {
                    const keys = await processKeyPdf(listeningKeyFile.path, "Listening (Bổ sung)");
                    allKeys = { ...allKeys, ...keys };
                }
                if (readingKeyFile) {
                    const keys = await processKeyPdf(readingKeyFile.path, "Reading (Bổ sung)");
                    allKeys = { ...allKeys, ...keys };
                }

                if (Object.keys(allKeys).length > 0) {
                    updatedQuestions = updatedQuestions.map(q => {
                        if (allKeys[q.QuestionNo]) {
                            return {
                                ...q,
                                CorrectAnswer: allKeys[q.QuestionNo].CorrectAnswer || q.CorrectAnswer,
                                Explanation: allKeys[q.QuestionNo].Explanation || q.Explanation
                            };
                        }
                        return q;
                    });
                }

                if (zipFile && fs.existsSync(zipFile.path)) {
                    console.log(`\n[+] Đang giải nén và up Audio bổ sung...`);
                    const extractedPath = path.join(process.cwd(), `uploads/audio_update_${Date.now()}`);
                    fs.mkdirSync(extractedPath, { recursive: true });
                    const zip = new AdmZip(zipFile.path);
                    zip.extractAllTo(extractedPath, true);

                    const audioFiles = getAllAudioFiles(extractedPath);
                    let audioUrlMap = {};
                    for (const filePath of audioFiles) {
                        try {
                            const result = await cloudinary.uploader.upload(filePath, { resource_type: "video", folder: "toeic_audio" });
                            const baseName = path.basename(filePath).split('.')[0]; 
                            const match = baseName.match(/(?:^|-)(\d+)(?:-(\d+))?$/); 
                            if (match) {
                                let start = parseInt(match[1], 10);
                                let end = match[2] ? parseInt(match[2], 10) : start;
                                if (end - start > 5) start = end; 
                                for (let k = start; k <= end; k++) { audioUrlMap[k] = result.secure_url; }
                            }
                        } catch (e) { }
                    }
                    fs.rmSync(extractedPath, { recursive: true, force: true });
                    fs.unlinkSync(zipFile.path);

                    updatedQuestions = updatedQuestions.map(q => {
                        if (audioUrlMap[q.QuestionNo]) {
                            return { ...q, AudioUrl: audioUrlMap[q.QuestionNo] };
                        }
                        return q;
                    });
                }

                for (let k = 1; k <= 31; k++) {
                    if (!updatedQuestions.find(q => q.QuestionNo === k)) {
                        if (allKeys[k] || taskImageMap[`part1_image_${k}`]) {
                            const isPart1 = k <= 6;
                            updatedQuestions.push({
                                Part: isPart1 ? 1 : 2, QuestionNo: k, 
                                QuestionText: isPart1 ? "(Nghe Audio và chọn đáp án mô tả đúng nhất bức tranh)" : "(Nghe Audio và chọn câu phản hồi đúng nhất)",
                                OptionA: "A", OptionB: "B", OptionC: "C", OptionD: isPart1 ? "D" : "",
                                ImageUrl: isPart1 && taskImageMap[`part1_image_${k}`] ? taskImageMap[`part1_image_${k}`][0] : "",
                                AudioUrl: "", 
                                CorrectAnswer: allKeys[k]?.CorrectAnswer || "",
                                Explanation: allKeys[k]?.Explanation || ""
                            });
                        }
                    }
                }

                updatedQuestions = updatedQuestions.map(q => {
                    let pImages = q.PassageImages || [];
                    let graphicUrl = q.ImageUrl || "";
                    
                    for (const taskId in taskImageMap) {
                        const parts = taskId.split('_'); 
                        if (parts.length === 3) {
                            const start = parseInt(parts[1], 10);
                            const end = parseInt(parts[2], 10);
                            if (q.QuestionNo >= start && q.QuestionNo <= end) {
                                if (taskId.startsWith('part6_') || taskId.startsWith('part7_')) {
                                    pImages = taskImageMap[taskId];
                                }
                                if (taskId.startsWith('part3_') || taskId.startsWith('part4_')) {
                                    graphicUrl = taskImageMap[taskId][0] || "";
                                }
                            }
                        }
                    }
                    return { ...q, PassageImages: pImages, ImageUrl: graphicUrl };
                });

                updatedQuestions.sort((a, b) => a.QuestionNo - b.QuestionNo);

                exam.questions = updatedQuestions;
                await exam.save();
                console.log(`[Worker Update] 🎉 Đã gộp và sắp xếp thành công! Tổng số câu hiện tại: ${updatedQuestions.length}`);

            } catch (error) {
                console.error(`[Worker Update] Lỗi:`, error.message);
            }
        }, 1000); 

    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ' });
    }
});

// ==========================================
// KẾT QUẢ THI (GIỮ NGUYÊN)
// ==========================================
const resultSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
    examName: String,
    correctListening: Number,
    correctReading: Number,
    scoreListening: Number,
    scoreReading: Number,
    totalScore: Number,
    timeSpent: Number,
    userAnswers: Object, 
    createdAt: { type: Date, default: Date.now }
});
const Result = mongoose.model('Result', resultSchema);

app.post('/api/results', async (req, res) => {
    try {
        const newResult = new Result(req.body);
        await newResult.save();
        res.status(201).json({ message: "Lưu lịch sử thành công!", result: newResult });
    } catch (error) { 
        res.status(500).json({ message: "Lỗi lưu kết quả" }); 
    }
});

app.get('/api/results/user/:userId', async (req, res) => {
    try {
        const results = await Result.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(results);
    } catch (error) { 
        res.status(500).json({ message: "Lỗi lấy lịch sử" }); 
    }
});

// ==========================================
// CÁC API AUTH VÀ USER CŨ (GIỮ NGUYÊN)
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "Email đã dùng!" });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = new User({ name, email, password: hashedPassword, role: role || 'user' });
        await newUser.save();
        res.status(201).json({ message: "Thành công!" });
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "Không tìm thấy!" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Sai mật khẩu!" });
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        res.status(200).json({ message: "Thành công!", token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.get('/api/users', async (req, res) => {
    try { res.status(200).json(await User.find().select('-password')); } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.listen(PORT, () => console.log(`🚀 Backend TOEIC Siêu AI chạy tại http://localhost:${PORT}`));