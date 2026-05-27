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

const jobSchema = new mongoose.Schema({
    type: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' },
    progress: { type: Number, default: 0 },
    message: { type: String, default: '' },
    error: { type: String, default: null },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', default: null },
    examName: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });
const Job = mongoose.model('Job', jobSchema);

// --- CLOUDINARY ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- GEMINI AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
const GEMINI_EXTRACT_MODEL = process.env.GEMINI_EXTRACT_MODEL || "gemini-2.0-flash";   // Dùng cho đề thi (nhiều trang, cần limit cao)
const GEMINI_KEY_MODEL     = process.env.GEMINI_KEY_MODEL     || "gemini-2.5-flash";   // Dùng cho file đáp án (ít trang, cần đọc chính xác)
const GEMINI_CLEANUP_MODEL = process.env.GEMINI_CLEANUP_MODEL || "gemini-2.0-flash-lite"; // Dùng để clean JSON lỗi

const upload = multer({ dest: 'uploads/' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Sleep thông minh: chỉ sleep 60s khi bị rate limit 429, còn lại chỉ nghỉ 3s giữa các chunk
const RATE_LIMIT_SLEEP = 60000;
const POLITE_DELAY = 3000;
const isRateLimitError = (error) => {
    const msg = (error?.message || "").toLowerCase();
    const status = error?.status || error?.code || 0;
    return status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource_exhausted");
};
const smartSleep = async (error, label = "") => {
    if (isRateLimitError(error)) {
        console.log(`[${label}] ⏳ Rate limit! Ngủ 60s để hồi phục...`);
        await sleep(RATE_LIMIT_SLEEP);
    } else {
        console.log(`[${label}] ↻ Thử lại sau 3s...`);
        await sleep(3000);
    }
};

const getJsonModel = (modelName) => genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" }
});

const updateJob = async (jobId, patch) => {
    if (!jobId) return null;
    try {
        return await Job.findByIdAndUpdate(jobId, patch, { new: true });
    } catch (error) {
        console.error("[Job] Cannot update job:", error.message);
        return null;
    }
};

const parseJsonObject = (rawText) => {
    if (!rawText || typeof rawText !== "string") return null;
    try {
        return JSON.parse(rawText);
    } catch {}

    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

    try {
        return JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
    } catch {
        return null;
    }
};

const parseAiJson = async (rawText, schemaDescription, emptyFallback) => {
    const localParsed = parseJsonObject(rawText);
    if (localParsed) return localParsed;

    const cleanupModel = getJsonModel(GEMINI_CLEANUP_MODEL);
    const cleanupPrompt = `Clean and repair this AI output into one valid JSON object.
Schema:
${schemaDescription}
Rules:
- Return JSON only.
- Do not add markdown.
- If the source has no usable data, return this exact empty object: ${JSON.stringify(emptyFallback)}

AI output:
${rawText || ""}`;

    const cleanupResult = await cleanupModel.generateContent([{ text: cleanupPrompt }]);
    return parseJsonObject(cleanupResult.response.text()) || emptyFallback;
};

const cleanString = (value) => typeof value === "string" ? value.trim() : "";
const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const normalizeAnswer = (value) => {
    const match = String(value || "").trim().toUpperCase().match(/[A-D]/);
    return match ? match[0] : "";
};
const inferPartFromQuestionNo = (questionNo) => {
    if (questionNo >= 1 && questionNo <= 6) return 1;
    if (questionNo >= 7 && questionNo <= 31) return 2;
    if (questionNo >= 32 && questionNo <= 70) return 3;
    if (questionNo >= 71 && questionNo <= 100) return 4;
    if (questionNo >= 101 && questionNo <= 130) return 5;
    if (questionNo >= 131 && questionNo <= 146) return 6;
    if (questionNo >= 147 && questionNo <= 200) return 7;
    return null;
};
const normalizeKeyItem = (item) => {
    const questionNo = toNumber(item?.QuestionNo);
    if (!questionNo || questionNo < 1 || questionNo > 200) return null;
    return {
        QuestionNo: questionNo,
        CorrectAnswer: normalizeAnswer(item?.CorrectAnswer),
        Explanation: cleanString(item?.Explanation)
    };
};
const normalizeQuestionItem = (item) => {
    const questionNo = toNumber(item?.QuestionNo);
    if (!questionNo || questionNo < 1 || questionNo > 200) return null;

    const part = toNumber(item?.Part) || inferPartFromQuestionNo(questionNo);
    if (!part) return null;

    return {
        Part: part,
        QuestionNo: questionNo,
        QuestionText: cleanString(item?.QuestionText),
        OptionA: cleanString(item?.OptionA),
        OptionB: cleanString(item?.OptionB),
        OptionC: cleanString(item?.OptionC),
        OptionD: cleanString(item?.OptionD),
        PassageText: cleanString(item?.PassageText)
    };
};

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: "Bạn cần đăng nhập để thực hiện thao tác này." });
    }

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Bạn không có quyền quản trị." });
    }
    next();
};

const requireSameUserOrAdmin = (req, res, next) => {
    if (req.user?.role === "admin" || String(req.user?.id) === String(req.params.userId)) {
        return next();
    }
    return res.status(403).json({ message: "Bạn không có quyền xem dữ liệu này." });
};

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

                const model = getJsonModel(GEMINI_KEY_MODEL);

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

                const rawText = result.response.text();
                const parsedData = await parseAiJson(
                    rawText,
                    '{ "keys": [ { "QuestionNo": number, "CorrectAnswer": "A|B|C|D", "Explanation": string } ] }',
                    { keys: [] }
                );

                if (parsedData.keys && Array.isArray(parsedData.keys)) {
                    const normalizedKeys = parsedData.keys.map(normalizeKeyItem).filter(Boolean);
                    normalizedKeys.forEach(k => {
                        extractedKeys[k.QuestionNo] = {
                            CorrectAnswer: k.CorrectAnswer,
                            Explanation: k.Explanation
                        };
                    });
                    chunkSuccess = true;
                    console.log(`[Key Parser] [V] Đã lấy thành công đáp án của ${normalizedKeys.length} câu.`);
                }
            } catch (error) {
                console.error(`[Key Parser] [!] Lỗi đọc đáp án (Lần thử ${attempt}):`, error.message);
                if (attempt < 3) await smartSleep(error, "Key Parser");
            } finally {
                if (uploadResponse) try { await fileManager.deleteFile(uploadResponse.file.name); } catch(e){}
            }
        }
        try { fs.unlinkSync(tempPdfPath); } catch(e){}
        // Nghỉ nhỏ giữa các chunk để không spam API
        if (j + pagesPerChunk < totalPages) await sleep(POLITE_DELAY);
    }
    try { fs.unlinkSync(filePath); } catch(e){}
    return extractedKeys;
}

// ==========================================
// HÀM CHẠY NGẦM BÓC TÁCH ĐỀ THI (TẠO MỚI)
// ==========================================
async function processExamInBackground(pdfFiles, examName, duration, partsArray, cropFiles, zipFilePath, listeningKeyPath, readingKeyPath, jobId = null) {
    try {
        console.log(`\n======================================================`);
        console.log(`[Worker] Bắt đầu xử lý ĐỀ THI: ${examName}`);
        await updateJob(jobId, { status: 'processing', progress: 5, message: 'Đang đọc file đáp án bằng AI...' });
        
        // Chạy song song 2 file key để tiết kiệm thời gian
        console.log(`[Worker] ⚡ Chạy song song 2 file đáp án...`);
        const [listeningKeys, readingKeys] = await Promise.all([
            processKeyPdf(listeningKeyPath, "Listening"),
            processKeyPdf(readingKeyPath, "Reading"),
        ]);
        const allKeys = { ...listeningKeys, ...readingKeys };
        await updateJob(jobId, { progress: 25, message: 'Đã đọc đáp án, đang xử lý ảnh và audio...' });

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

        await updateJob(jobId, { progress: 40, message: 'Đã xử lý media, đang bóc câu hỏi từ PDF...' });

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
                    const chunkProgress = Math.min(90, 40 + Math.round(((i + (j / totalPages)) / pdfFiles.length) * 50));
                    await updateJob(jobId, { progress: chunkProgress, message: `Đang quét PDF ${i + 1}/${pdfFiles.length}, trang ${j + 1}-${endIndex}...` });

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
                            
                            const model = getJsonModel(GEMINI_EXTRACT_MODEL);

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

                            const rawText = result.response.text();
                            const parsedData = await parseAiJson(
                                rawText,
                                '{ "questions": [ { "Part": number, "QuestionNo": number, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "PassageText": "" } ] }',
                                { questions: [] }
                            );
                            
                            // 💡 SỬA LỖI LOGIC: Chỉ cần AI trả về mảng hợp lệ (kể cả 0 câu) là cho qua luôn, không ép loop lại
                            if (parsedData.questions && Array.isArray(parsedData.questions)) {
                                const normalizedQuestions = parsedData.questions.map(normalizeQuestionItem).filter(Boolean);
                                if (normalizedQuestions.length > 0) {
                                    const processedQuestions = normalizedQuestions.map(q => {
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
                                console.log(`[Exam Parser] [V] Đã đọc xong Trang ${j+1}-${endIndex}. Ghi nhận thêm ${normalizedQuestions.length} câu mới.`);
                            }
                        } catch (error) {
                            console.error(`[Exam Parser] ❌ Lỗi quét nội dung (Lần thử ${attempt}):`, error.message);
                            if (attempt < 3) await smartSleep(error, "Exam Parser");
                        } finally {
                            if (uploadResponse) try { await fileManager.deleteFile(uploadResponse.file.name); } catch(e){}
                        }
                    } 
                    try { fs.unlinkSync(tempPdfPath); } catch(e){}
                    // Nghỉ nhỏ giữa các chunk để không spam API
                    if (j + pagesPerChunk < totalPages || i < pdfFiles.length - 1) {
                        await sleep(POLITE_DELAY);
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
            await updateJob(jobId, { status: 'done', progress: 100, message: `Đã tạo đề thi với ${finalQuestionsArray.length} câu.`, examId: newExam._id });
            console.log(`[Worker] 💾 ĐÃ LƯU THÀNH CÔNG ĐỀ THI KÈM ĐÁP ÁN & GIẢI THÍCH VÀO DATABASE!`);
        } else {
            await updateJob(jobId, { status: 'failed', progress: 100, message: 'AI không bóc được câu hỏi nào từ file đã upload.', error: 'No questions extracted' });
        }

    } catch (error) {
        console.error(`[Worker] ❌ Lỗi xử lý ngầm:`, error.message);
        await updateJob(jobId, { status: 'failed', message: 'Xử lý đề thi thất bại.', error: error.message });
    }
}

// ==========================================
// API NHẬN FILE TỪ GIAO DIỆN (CREATE)
// ==========================================
app.post('/api/upload-exam', authenticate, requireAdmin, upload.any(), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) return res.status(400).json({ message: 'Thiếu file!' });

        const examName = req.body.name || "Đề thi TOEIC Mới";
        const duration = req.body.duration || 120;
        const selectedParts = JSON.parse(req.body.parts || "[]").map(Number);

        const pdfFiles = files.filter(f => f.fieldname === 'examFiles' && f.mimetype === 'application/pdf');
        const zipFile = files.find(f => f.fieldname === 'audioZip' || f.originalname.toLowerCase().endsWith('.zip'));
        const cropFiles = files.filter(f => f.mimetype.startsWith('image/'));
        const listeningKeyFile = files.find(f => f.fieldname === 'listeningKey');
        const readingKeyFile = files.find(f => f.fieldname === 'readingKey');

        const job = await new Job({
            type: 'create_exam',
            status: 'pending',
            progress: 0,
            message: 'Đã nhận file, đang chuẩn bị xử lý AI.',
            examName,
            createdBy: req.user.id
        }).save();

        res.status(202).json({
            message: "Đã tiếp nhận toàn bộ file! Hệ thống AI đang chạy nền.",
            jobId: job._id
        });

        processExamInBackground(
            pdfFiles, examName, duration, selectedParts, cropFiles, 
            zipFile ? zipFile.path : null,
            listeningKeyFile ? listeningKeyFile.path : null,
            readingKeyFile ? readingKeyFile.path : null,
            job._id
        );

    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ' });
    }
});

app.get('/api/exams', async (req, res) => {
    try {
        // Chỉ trả về thông tin cơ bản, KHÔNG kèm mảng questions để giảm tải
        const exams = await Exam.find().select('-questions').sort({ createdAt: -1 });
        // Thêm questionCount bằng cách query riêng (aggregate)
        const counts = await Exam.aggregate([
            { $project: { questionCount: { $size: { $ifNull: ['$questions', []] } } } }
        ]);
        const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.questionCount]));
        const result = exams.map(e => ({ ...e.toObject(), questionCount: countMap[String(e._id)] || 0 }));
        res.json(result);
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});
app.get('/api/exams/:id', async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: "Không tìm thấy đề thi." });
        res.json(exam);
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});
app.delete('/api/exams/:id', authenticate, requireAdmin, async (req, res) => {
    try { await Exam.findByIdAndDelete(req.params.id); res.json({ message: "Đã xóa!" }); } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.get('/api/jobs/:id', authenticate, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ message: "Không tìm thấy job." });
        if (req.user.role !== "admin" && String(job.createdBy || "") !== String(req.user.id)) {
            return res.status(403).json({ message: "Bạn không có quyền xem tiến độ này." });
        }
        res.json(job);
    } catch (error) {
        res.status(500).json({ message: "Lỗi lấy tiến độ xử lý." });
    }
});

// ==========================================
// API MỚI: CẬP NHẬT & BỔ SUNG FILE CHO ĐỀ THI ĐÃ CÓ
// ==========================================
app.put('/api/exams/:id/append-files', authenticate, requireAdmin, upload.any(), async (req, res) => {
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

        const job = await new Job({
            type: 'update_exam',
            status: 'pending',
            progress: 0,
            message: 'Đã nhận file bổ sung, đang chuẩn bị xử lý AI.',
            examId,
            examName: req.body.name,
            createdBy: req.user.id
        }).save();

        res.status(202).json({
            message: "Đã lưu thông tin! Hệ thống AI đang chạy nền để gộp file mới.",
            jobId: job._id
        });

        setTimeout(async () => {
            try {
                await updateJob(job._id, { status: 'processing', progress: 5, message: 'Đang đọc dữ liệu đề hiện tại...' });
                console.log(`\n[Worker Update] Đang bóc tách file bổ sung cho đề thi ID: ${examId}`);
                const exam = await Exam.findById(examId);
                if (!exam) {
                    await updateJob(job._id, { status: 'failed', error: 'Exam not found', message: 'Không tìm thấy đề thi cần cập nhật.' });
                    return;
                }

                let updatedQuestions = [...(exam.questions || [])];
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
                    await updateJob(job._id, { progress: 15, message: 'Đang upload ảnh crop bổ sung...' });
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
                    await updateJob(job._id, { progress: 25, message: 'Đang bóc câu hỏi bổ sung từ PDF...' });
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
                            const chunkProgress = Math.min(65, 25 + Math.round(((i + (j / totalPages)) / examPdfFiles.length) * 40));
                            await updateJob(job._id, { progress: chunkProgress, message: `Đang quét file bổ sung ${i + 1}/${examPdfFiles.length}, trang ${j + 1}-${endIndex}...` });

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

                                    const model = getJsonModel(GEMINI_EXTRACT_MODEL);

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

                                    const rawText = result.response.text();
                                    const parsedData = await parseAiJson(
                                        rawText,
                                        '{ "questions": [ { "Part": number, "QuestionNo": number, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "PassageText": "" } ] }',
                                        { questions: [] }
                                    );
                                    
                                    // 💡 ĐỒNG BỘ SỬA LỖI LOGIC TẠI ĐÂY CHO ĐƯỜNG UPDATE
                                    if (parsedData.questions && Array.isArray(parsedData.questions)) {
                                        const normalizedQuestions = parsedData.questions.map(normalizeQuestionItem).filter(Boolean);
                                        if (normalizedQuestions.length > 0) {
                                            normalizedQuestions.forEach(newQ => {
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
                                        console.log(`[Worker Update] [V] Đã xử lý xong Trang ${j+1}-${endIndex}. Nhận thêm ${normalizedQuestions.length} câu.`);
                                    }
                                } catch (error) {
                                    console.error(`[Worker Update] ❌ Lỗi quét bổ sung (Lần thử ${attempt}):`, error.message);
                                    if (attempt < 3) await smartSleep(error, "Worker Update");
                                } finally {
                                    if (uploadResponse) try { await fileManager.deleteFile(uploadResponse.file.name); } catch(e){}
                                }
                            }
                            try { fs.unlinkSync(tempPdfPath); } catch(e){}
                            if (j + pagesPerChunk < totalPages || i < examPdfFiles.length - 1) {
                                await sleep(POLITE_DELAY);
                            }
                        }
                        try { fs.unlinkSync(examPdfFile.path); } catch(e){} 
                    }
                }

                if (listeningKeyFile) {
                    await updateJob(job._id, { progress: 70, message: 'Đang đọc đáp án Listening bổ sung...' });
                    const keys = await processKeyPdf(listeningKeyFile.path, "Listening (Bổ sung)");
                    allKeys = { ...allKeys, ...keys };
                }
                if (readingKeyFile) {
                    await updateJob(job._id, { progress: 75, message: 'Đang đọc đáp án Reading bổ sung...' });
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
                    await updateJob(job._id, { progress: 82, message: 'Đang xử lý audio bổ sung...' });
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
                await updateJob(job._id, { status: 'done', progress: 100, message: `Đã cập nhật đề thi. Tổng hiện tại ${updatedQuestions.length} câu.`, examId: exam._id, examName: exam.name });
                console.log(`[Worker Update] 🎉 Đã gộp và sắp xếp thành công! Tổng số câu hiện tại: ${updatedQuestions.length}`);

            } catch (error) {
                console.error(`[Worker Update] Lỗi:`, error.message);
                await updateJob(job._id, { status: 'failed', message: 'Cập nhật đề thi thất bại.', error: error.message });
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
    wrongListening: Number,
    totalListening: Number,
    correctReading: Number,
    wrongReading: Number,
    totalReading: Number,
    scoreListening: Number,
    scoreReading: Number,
    totalScore: Number,
    timeSpent: Number,
    userAnswers: Object, 
    createdAt: { type: Date, default: Date.now }
});
const Result = mongoose.model('Result', resultSchema);

app.post('/api/results', authenticate, async (req, res) => {
    try {
        const resultPayload = { ...req.body };
        resultPayload.userId = req.user.id;

        const newResult = new Result(resultPayload);
        await newResult.save();
        res.status(201).json({ message: "Lưu lịch sử thành công!", result: newResult });
    } catch (error) { 
        res.status(500).json({ message: "Lỗi lưu kết quả" }); 
    }
});

app.get('/api/results/me', authenticate, async (req, res) => {
    try {
        const results = await Result.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(results);
    } catch (error) {
        res.status(500).json({ message: "Lỗi lấy lịch sử" });
    }
});

app.get('/api/results/user/:userId', authenticate, requireSameUserOrAdmin, async (req, res) => {
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
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) return res.status(400).json({ message: "Email đã dùng!" });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const safeRole = role === "admin" && normalizedEmail === "admin@toeic.com" ? "admin" : "user";
        const newUser = new User({ name, email: normalizedEmail, password: hashedPassword, role: safeRole });
        await newUser.save();
        res.status(201).json({ message: "Thành công!" });
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(404).json({ message: "Không tìm thấy!" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Sai mật khẩu!" });
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        res.status(200).json({ message: "Thành công!", token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
    try { res.status(200).json(await User.find().select('-password')); } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.listen(PORT, () => console.log(`🚀 Backend TOEIC Siêu AI chạy tại http://localhost:${PORT}`));