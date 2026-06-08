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
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// GIAI ĐOẠN 3: SỬ DỤNG BỘ PARSER REGEX THÔNG MINH TRÁNH SÓT CHỮ
import { extractToeicBlocks, parsePart5ByRegex, parseAnswerKeyByRegex } from './utils/toeicOcrParser.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "toeic_secret_key_2026_sieu_bao_mat";

app.use(cors());
app.use(express.json());

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Đã mở khóa Két sắt MongoDB thành công!'))
  .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// ==========================================
// ĐỊNH NGHĨA CÁC ĐƯỜNG ỐNG DATABASE (SCHEMAS)
// ==========================================
const examSchema = new mongoose.Schema({
    name: String,
    duration: Number,
    createdAt: { type: Date, default: Date.now },
    questions: Array 
});
const Exam = mongoose.model('Exam', examSchema);

// SCHEMA DRAFT EXAM CẢI TIẾN: LƯU TRỮ THÊM CHỈ SỐ KIỂM ĐỊNH CHẤT LƯỢNG QA
const draftExamSchema = new mongoose.Schema({
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
    targetExamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', default: null },
    name: String,
    duration: Number,
    questions: Array,
    validationStats: {
        total: Number,
        valid: Number,
        accuracy: Number,
        errors: Object,
        partStats: Object
    },
    createdAt: { type: Date, default: Date.now }
});
const DraftExam = mongoose.model('DraftExam', draftExamSchema);

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

const contactSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, default: "Yêu cầu hỗ trợ" },
    message: { type: String, required: true },
    status: { type: String, enum: ['unread', 'read', 'resolved'], default: 'unread' },
    adminReply: { type: String, default: null },
    repliedAt: { type: Date, default: null },
    messages: [{ sender: { type: String, enum: ['user','admin'] }, text: String, createdAt: { type: Date, default: Date.now } }],
    createdAt: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', contactSchema);

// --- CLOUDINARY CONFIG ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- GEMINI AI - MULTI KEY ROTATION ---
const _rawKeys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
].filter(Boolean);
if (!_rawKeys.length && process.env.GEMINI_API_KEY) _rawKeys.push(process.env.GEMINI_API_KEY);
if (!_rawKeys.length) throw new Error("Không tìm thấy GEMINI_API_KEY nào trong .env!");

const geminiKeys = _rawKeys.map((key, i) => ({
    index: i + 1,
    key,
    client: null, 
    dailyExhausted: false,
}));
const keyState = { current: 0 };

const getActiveKey = () => {
    const active = geminiKeys[keyState.current];
    if (!active.client) {
        active.client = new GoogleGenerativeAI(active.key);
    }
    return active;
};

const rotateKey = (reason = "") => {
    const prevIdx = keyState.current;
    geminiKeys[prevIdx].dailyExhausted = true;
    const nextIdx = geminiKeys.findIndex((k, i) => i > prevIdx && !k.dailyExhausted);
    if (nextIdx !== -1) {
        keyState.current = nextIdx;
        console.log(`[Key Rotator] 🔄 Chuyển sang Key #${nextIdx+1}. Lý do: ${reason}`);
        return true;
    }
    const fromStart = geminiKeys.findIndex(k => !k.dailyExhausted);
    if (fromStart !== -1 && fromStart !== prevIdx) {
        keyState.current = fromStart;
        console.log(`[Key Rotator] 🔄 Quay vòng sử dụng Key #${fromStart+1}.`);
        return true;
    }
    return false;
};

const GEMINI_EXTRACT_MODEL = "gemini-2.5-flash"; 
console.log(`[Gemini Engine] ✅ Đã khởi động cỗ máy xử lý dữ liệu cấu trúc: ${GEMINI_EXTRACT_MODEL}`);

const upload = multer({ dest: 'uploads/' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// TỐC ĐỘ CHẬM RÃI, ỔN ĐỊNH THEO YÊU CẦU CỦA SẾP
const POLITE_DELAY = 3000; 
const KEY_PARSE_DELAY = 3000;

const isRateLimitError = (error) => {
    const msg = (error?.message || "").toLowerCase(); const status = error?.status || error?.code || 0;
    return status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource_exhausted") || status === 503 || msg.includes("503") || status === 403 || msg.includes("403");
};

const smartSleep = async (error, label = "") => {
    if (!isRateLimitError(error)) { console.log(`[${label}] ↻ Lỗi luồng: ${error.message} → Thử lại sau 4s...`); await sleep(4000); return; }
    console.log(`[${label}] ⏳ Quá hạn mức Quota! Đang luân chuyển Key bảo vệ...`);
    rotateKey(`(Trigger: ${label})`); await sleep(5000);
};

const updateJob = async (jobId, patch) => {
    if (!jobId) return null;
    try { return await Job.findByIdAndUpdate(jobId, patch, { returnDocument: 'after' }); } catch (error) { return null; }
};

const parseJsonObject = (rawText) => {
    if (!rawText || typeof rawText !== "string") return null;
    try { return JSON.parse(rawText); } catch {}
    const firstBrace = rawText.indexOf('{'); const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    try { return JSON.parse(rawText.substring(firstBrace, lastBrace + 1)); } catch { return null; }
};

// HÀM HÀN GẮN LỖI JSON TỪ AI
const parseAiJson = async (rawText, schemaDescription, emptyFallback) => {
    const localParsed = parseJsonObject(rawText); if (localParsed) return localParsed;
    console.log("[JSON Fixer] Dữ liệu JSON bị lỗi cú pháp. Đang yêu cầu AI sửa chữa...");
    try {
        const activeKey = getActiveKey();
        const model = activeKey.client.getGenerativeModel({ model: GEMINI_EXTRACT_MODEL, generationConfig: { responseMimeType: "application/json" } });
        const prompt = `Repair this broken JSON output. Output plain valid JSON only matching schema: ${schemaDescription}. Text: ${rawText}`;
        const res = await model.generateContent([{ text: prompt }]);
        return parseJsonObject(res.response.text()) || emptyFallback; 
    } catch { 
        return emptyFallback; 
    }
};

const inferPartFromQuestionNo = (qNo) => {
    if (qNo >= 1 && qNo <= 6) return 1; if (qNo >= 7 && qNo <= 31) return 2; if (qNo >= 32 && qNo <= 70) return 3; 
    if (qNo >= 71 && qNo <= 100) return 4; if (qNo >= 101 && qNo <= 130) return 5; if (qNo >= 131 && qNo <= 146) return 6; 
    if (qNo >= 147 && qNo <= 200) return 7; return null;
};

const chunkText = (text, maxLength = 7000) => {
    const chunks = []; let current = 0;
    while (current < text.length) { chunks.push(text.substring(current, current + maxLength)); current += maxLength; }
    return chunks;
};

// BỘ LỌC KIỂM ĐỊNH CHẤT LƯỢNG ĐỀ (QA VALIDATION ENGINE)
const validateExamData = (questionsArray) => {
    let validCount = 0;
    const errors = { missingText: [], missingOptions: [], invalidAnswers: [] };
    const partStats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };

    questionsArray.forEach(q => {
        let isPerfect = true; const qNo = q.QuestionNo;
        if(q.Part >= 1 && q.Part <= 7) partStats[q.Part] += 1;

        if (!q.QuestionText || q.QuestionText.trim() === "") { errors.missingText.push(qNo); isPerfect = false; }
        if (!q.OptionA || !q.OptionB || !q.OptionC || (q.Part !== 2 && !q.OptionD)) { errors.missingOptions.push(qNo); isPerfect = false; }
        
        const validAns = ["A", "B", "C", "D"];
        if (!q.CorrectAnswer || !validAns.includes(String(q.CorrectAnswer).toUpperCase().trim())) { errors.invalidAnswers.push(qNo); isPerfect = false; }

        if (isPerfect) validCount++;
    });

    return {
        total: 200, valid: validCount, accuracy: parseFloat(((validCount / 200) * 100).toFixed(2)),
        errors, partStats
    };
};

const calculateToeicScoreStandard = (correctListening, correctReading) => {
    const listeningScale = [5, 5, 5, 5, 5, 5, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200, 210, 215, 220, 225, 230, 235, 240, 245, 250, 255, 260, 265, 270, 275, 280, 285, 290, 295, 300, 310, 315, 320, 325, 330, 335, 340, 345, 350, 355, 360, 365, 370, 375, 380, 385, 390, 395, 400, 405, 410, 415, 420, 425, 430, 435, 440, 445, 450, 455, 460, 465, 470, 475, 480, 485, 490, 495, 495, 495, 495, 495];
    const readingScale = [5, 5, 5, 5, 5, 5, 5, 5, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200, 205, 210, 215, 220, 225, 230, 235, 240, 245, 250, 255, 260, 265, 270, 275, 280, 285, 290, 295, 300, 305, 310, 315, 320, 325, 330, 335, 340, 345, 350, 355, 360, 365, 370, 375, 380, 385, 390, 395, 400, 405, 410, 415, 420, 425, 430, 435, 440, 445, 450, 460, 470, 480, 485, 490, 495, 495, 495];
    const cl = Math.max(0, Math.min(100, correctListening)); const cr = Math.max(0, Math.min(100, correctReading));
    return { scoreListening: listeningScale[cl], scoreReading: readingScale[cr], totalScore: listeningScale[cl] + readingScale[cr] };
};

const getAllAudioFiles = (dirPath, arrayOfFiles = []) => {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) { getAllAudioFiles(fullPath, arrayOfFiles); } else if (file.match(/\.(mp3|wav)$/i)) { arrayOfFiles.push(fullPath); }
    });
    return arrayOfFiles;
};

// =======================================================
// ⚙️ PIPELINE THẾ HỆ MỚI: VISION OCR BASE64 + ANTI-EMPTY CACHE
// =======================================================
async function processExamInBackground(pdfFiles, examName, duration, partsArray, cropFiles, zipFilePath, listeningKeyPath, readingKeyPath, jobId = null, options = {}) {
    try {
        const { targetExamId = null } = options;
        console.log(`\n======================================================`);
        console.log(`[Pipeline V2] KÍCH HOẠT MẮT THẦN GIẢI MÃ ĐỀ ETS: ${examName}`);
        await updateJob(jobId, { status: 'processing', progress: 5, message: 'Hệ thống đang cấu trúc hóa bảng đáp án...' });

        let allKeys = {};

        // SỬA LỖI: Dùng AI đọc trực tiếp file PDF Key để lấy Lời giải thích qua BASE64
        const keyPaths = [listeningKeyPath, readingKeyPath].filter(Boolean);
        for (const kPath of keyPaths) {
            try {
                await updateJob(jobId, { message: `Đang nhờ AI phân tích cấu trúc bảng đáp án và lời giải từ file Key...` });
                const keyBuffer = fs.readFileSync(kPath);
                const keyBase64 = keyBuffer.toString("base64");
                
                const activeKey = getActiveKey();
                const jsonModel = activeKey.client.getGenerativeModel({ 
                    model: GEMINI_EXTRACT_MODEL,
                    generationConfig: { responseMimeType: "application/json", temperature: 0 }
                });

                const promptKey = `Bạn là chuyên gia TOEIC. Hãy đọc file PDF Đáp án này và trích xuất TOÀN BỘ câu hỏi, đáp án đúng và phần transcript giải thích.
                Trả về JSON định dạng chuẩn sau: 
                { "keys": [ { "QuestionNo": số, "CorrectAnswer": "A hoặc B hoặc C hoặc D", "Explanation": "Nội dung lời giải thích hoặc đoạn hội thoại transcript chi tiết" } ] }`;

                const res = await jsonModel.generateContent([{ inlineData: { data: keyBase64, mimeType: "application/pdf" } }, promptKey]);
                const parsedKeyData = await parseAiJson(res.response.text(), '{ "keys": [] }', { keys: [] });

                if (parsedKeyData?.keys) {
                    parsedKeyData.keys.forEach(k => {
                        if (k.QuestionNo) {
                            allKeys[k.QuestionNo] = {
                                CorrectAnswer: k.CorrectAnswer?.replace(/[^A-D]/g, '') || "", 
                                Explanation: k.Explanation || ""
                            };
                        }
                    });
                }
                console.log(`[Key Engine] 🎯 Đã dùng AI hốt thành công bộ Đáp Án + Giải thích xịn xò từ file Key PDF!`);
            } catch (e) {
                console.log(`[Key Engine] ⚠️ Lỗi đọc file đáp án:`, e.message);
            }
            try { fs.unlinkSync(kPath); } catch(e){}
            await sleep(KEY_PARSE_DELAY);
        }

        await updateJob(jobId, { progress: 20, message: 'Đang kết nối kho Audio và ảnh phòng Scan...' });

        // KHỞI TẠO 200 CÂU BỌC THÉP
        let initialQuestionsList = [];
        for (let i = 1; i <= 200; i++) {
            const part = inferPartFromQuestionNo(i);
            initialQuestionsList.push({
                Part: part, QuestionNo: i,
                QuestionText: part === 1 ? "(Nghe Audio và chọn đáp án mô tả đúng nhất bức tranh)" : part === 2 ? "(Nghe Audio và chọn câu phản hồi đúng nhất)" : "",
                OptionA: "A", OptionB: "B", OptionC: "C", OptionD: part === 2 ? "" : "D",
                PassageText: "", ImageUrl: "", PassageImages: [], AudioUrl: "",
                CorrectAnswer: allKeys[i]?.CorrectAnswer || "", Explanation: allKeys[i]?.Explanation || ""
            });
        }

        let audioUrlMap = {}; let taskImageMap = {}; 
        if (cropFiles && cropFiles.length > 0) {
            for (const file of cropFiles) {
                try {
                    const taskId = file.fieldname; const result = await cloudinary.uploader.upload(file.path, { folder: "toeic_crops" });
                    if (!taskImageMap[taskId]) taskImageMap[taskId] = []; taskImageMap[taskId].push(result.secure_url); fs.unlinkSync(file.path); 
                } catch (e) {}
            }
        }

        if (zipFilePath && fs.existsSync(zipFilePath)) {
            const extractedPath = path.join(process.cwd(), `uploads/audio_${Date.now()}`); fs.mkdirSync(extractedPath, { recursive: true });
            const zip = new AdmZip(zipFilePath); zip.extractAllTo(extractedPath, true); const audioFiles = getAllAudioFiles(extractedPath);
            for (const filePath of audioFiles) {
                try {
                    const result = await cloudinary.uploader.upload(filePath, { resource_type: "video", folder: "toeic_audio" });
                    const baseName = path.basename(filePath).split('.')[0]; const match = baseName.match(/(?:^|-)(\d+)(?:-(\d+))?$/); 
                    if (match) {
                        let start = parseInt(match[1], 10); let end = match[2] ? parseInt(match[2], 10) : start; if (end - start > 5) start = end; 
                        for (let k = start; k <= end; k++) { audioUrlMap[k] = result.secure_url; }
                    }
                } catch (e) {}
            }
            fs.rmSync(extractedPath, { recursive: true, force: true }); fs.unlinkSync(zipFilePath);
        }

        // GIAI ĐOẠN 4: OCR BẰNG GEMINI VISION TRUYỀN THẲNG BASE64 (KHÔNG UPLOAD FILE, BẢO VỆ 401 TUYỆT ĐỐI)
        if (pdfFiles && pdfFiles.length > 0) {
            for (let i = 0; i < pdfFiles.length; i++) {
                const pdfFile = pdfFiles[i];
                await updateJob(jobId, { progress: 35, message: `Mắt thần AI đang giải mã dữ liệu ảnh scan tập đề số ${i+1}...` });

                let fullOcrText = "";
                const pdfBuffer = fs.readFileSync(pdfFile.path);
                
                // Thuật toán băm MD5 kiểm tra kho lưu trữ Cache
                const fileHash = crypto.createHash('md5').update(pdfBuffer).digest('hex');
                const ocrFolder = path.join(process.cwd(), 'uploads/ocr');
                const cacheFilePath = path.join(ocrFolder, `${fileHash}.txt`);

                if (!fs.existsSync(ocrFolder)) fs.mkdirSync(ocrFolder, { recursive: true });

                if (fs.existsSync(cacheFilePath)) {
                    fullOcrText = fs.readFileSync(cacheFilePath, 'utf8');
                    // CHỐNG CACHE RỖNG: Xóa cache nếu nhỏ hơn 100 ký tự (file bị lỗi từ lần trước)
                    if (fullOcrText.trim().length < 100) {
                        console.log(`[MD5 Cache] ⚠️ Phát hiện file Cache cũ bị lỗi rỗng. Tiến hành dọn dẹp để AI quét mới lại!`);
                        fs.unlinkSync(cacheFilePath);
                        fullOcrText = "";
                    } else {
                        console.log(`[MD5 Cache] ⚡ Đã tìm thấy bản sao lưu OCR hợp lệ. Kích hoạt đọc siêu tốc!`);
                    }
                }

                if (!fullOcrText) {
                    console.log(`[Vision Engine] Đang mã hóa cấu trúc Base64 gửi AI đọc ảnh Scan (API Trả phí)...`);
                    const pdfBase64 = pdfBuffer.toString("base64");
                    let attemptOcr = 0; let ocrSuccess = false;

                    while (attemptOcr < 3 && !ocrSuccess) {
                        attemptOcr++;
                        try {
                            const activeKey = getActiveKey();
                            const model = activeKey.client.getGenerativeModel({ model: GEMINI_EXTRACT_MODEL });
                            const ocrPrompt = `Read this TOEIC exam PDF. Extract ALL visible text. Keep question numbers, answer choices, and passages. Do not summarize. Return plain text only.`;

                            const result = await model.generateContent([
                                { inlineData: { data: pdfBase64, mimeType: "application/pdf" } }, 
                                ocrPrompt
                            ]);
                            fullOcrText = result.response.text(); ocrSuccess = true;
                            
                            // Ghi lại file để làm cache lưu trữ lâu dài
                            fs.writeFileSync(cacheFilePath, fullOcrText);
                        } catch (e) {
                            await smartSleep(e, `Vision OCR Engine File ${i+1}`);
                        }
                    }
                }

                // GIAI ĐOẠN 8: Đồng bộ hốt gọn Part 5 bằng bộ lọc Regex
                const part5Questions = parsePart5ByRegex(fullOcrText);
                if (part5Questions.length > 0) {
                    console.log(`[OCR Engine] 🎯 Đã hốt gọn ${part5Questions.length} câu Part 5 bằng cấu trúc Regex!`);
                    part5Questions.forEach(p5Q => {
                        const idx = initialQuestionsList.findIndex(q => q.QuestionNo === p5Q.QuestionNo);
                        if (idx !== -1) initialQuestionsList[idx] = { ...initialQuestionsList[idx], ...p5Q };
                    });
                }

                // GIAI ĐOẠN 6: Chia tách các block cụm văn bản nhỏ
                let toeicBlocks = extractToeicBlocks(fullOcrText);
                console.log(`[OCR Engine] ✂️ Đã cắt đề thi thành ${toeicBlocks.length} khối câu hỏi nhỏ.`);

                // Cơ chế cứu hộ phòng độc nếu Regex block bị lệch cấu trúc trả về 0
                if (toeicBlocks.length === 0 && fullOcrText.trim().length > 0) {
                    console.log(`[Cứu Hộ Khẩn Cấp] ⚠️ Regex chia block trống (0 khối). Kích hoạt băm chuỗi tự động...`);
                    const fallbackChunks = chunkText(fullOcrText, 7000);
                    toeicBlocks = fallbackChunks.map((chunk, index) => ({ start: 32 + (index * 4), end: 35 + (index * 4), content: chunk, isFallback: true }));
                }

                // GIAI ĐOẠN 10: AI giải mã chi tiết các khối câu hỏi khó
                for (let j = 0; j < toeicBlocks.length; j++) {
                    const block = toeicBlocks[j];
                    const progressRate = Math.min(95, 45 + Math.round((j / toeicBlocks.length) * 50));
                    await updateJob(jobId, { progress: progressRate, message: `Mắt thần đang bóc tách cấu trúc khối câu hỏi ${block.start}-${block.end}...` });

                    let attemptBlock = 0; let blockSuccess = false;
                    while (attemptBlock < 3 && !blockSuccess) {
                        attemptBlock++;
                        try {
                            const activeKey = getActiveKey();
                            const jsonModel = activeKey.client.getGenerativeModel({ model: GEMINI_EXTRACT_MODEL, generationConfig: { responseMimeType: "application/json" } });

                            let PROMPT_BLOCK = block.isFallback 
                                ? `Trích xuất tất cả câu hỏi TOEIC (từ câu 32). Trả về chuẩn JSON Schema: { "questions": [ { "QuestionNo": int, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string } ] }. Text: ${block.content}` 
                                : `Convert this TOEIC block into JSON. Return JSON only matching schema: { "questions": [ { "QuestionNo": int, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string } ] }. Text: ${block.content}`;

                            const res = await jsonModel.generateContent([{ text: PROMPT_BLOCK }]);
                            const parsedData = await parseAiJson(res.response.text(), '{ "questions": [] }', { questions: [] });

                            if (parsedData?.questions && Array.isArray(parsedData.questions)) {
                                parsedData.questions.forEach(newQ => {
                                    const qNo = parseInt(newQ.QuestionNo, 10);
                                    if (qNo >= 1 && qNo <= 200) {
                                        const targetIdx = initialQuestionsList.findIndex(q => q.QuestionNo === qNo);
                                        if (targetIdx !== -1) {
                                            initialQuestionsList[targetIdx].QuestionText = newQ.QuestionText || initialQuestionsList[targetIdx].QuestionText;
                                            initialQuestionsList[targetIdx].OptionA = newQ.OptionA || initialQuestionsList[targetIdx].OptionA;
                                            initialQuestionsList[targetIdx].OptionB = newQ.OptionB || initialQuestionsList[targetIdx].OptionB;
                                            initialQuestionsList[targetIdx].OptionC = newQ.OptionC || initialQuestionsList[targetIdx].OptionC;
                                            initialQuestionsList[targetIdx].OptionD = initialQuestionsList[targetIdx].Part === 2 ? "" : (newQ.OptionD || initialQuestionsList[targetIdx].OptionD);
                                        }
                                    }
                                });
                                blockSuccess = true;
                            }
                        } catch (e) { await smartSleep(e, `Block Chunk ${block.start}-${block.end}`); }
                    }
                    await sleep(POLITE_DELAY); // Chạy ổn định chậm rãi
                }
                try { fs.unlinkSync(pdfFile.path); } catch(e){}
            }
        }

        // Ráp nối media ảnh phòng cắt và audio
        const finalQuestionsArray = initialQuestionsList.map(q => {
            let pImages = []; let singleImage = "";
            for (const fName in taskImageMap) {
                const lowerField = fName.toLowerCase(); const numbers = lowerField.match(/\d+/g); if (!numbers) continue;
                const imgPart = parseInt(numbers[0], 10); if (imgPart !== q.Part && imgPart !== 0) continue;
                if (numbers.length >= 3) {
                    const s = parseInt(numbers[numbers.length - 2], 10); const e = parseInt(numbers[numbers.length - 1], 10);
                    if (q.QuestionNo >= s && q.QuestionNo <= e) pImages = taskImageMap[fName];
                } else if (numbers.length === 2 && q.QuestionNo === parseInt(numbers[1], 10)) {
                    singleImage = taskImageMap[fName][0] || ""; pImages = taskImageMap[fName];
                }
            }
            return {
                ...q, AudioUrl: audioUrlMap[q.QuestionNo] || q.AudioUrl, ImageUrl: singleImage || q.ImageUrl,
                PassageImages: pImages.length > 0 ? pImages : q.PassageImages,
                CorrectAnswer: allKeys[q.QuestionNo]?.CorrectAnswer || q.CorrectAnswer,
                Explanation: allKeys[q.QuestionNo]?.Explanation || q.Explanation
            };
        });

        // KÍCH HOẠT BỘ KHÁM SỨC KHỎE ĐỀ THI QA VALIDATION
        const validationResult = validateExamData(finalQuestionsArray);
        console.log(`[QA Engine] 📊 Kiểm định chất lượng đề thành công. Độ chính xác ban đầu: ${validationResult.accuracy}%`);

        // GIAI ĐOẠN 13: ĐẨY VÀO PHÒNG DUYỆT BÀI ADMIN REVIEW
        if (finalQuestionsArray.length > 0) {
            const draft = new DraftExam({ 
                jobId, targetExamId, name: examName, duration, 
                questions: finalQuestionsArray,
                validationStats: validationResult 
            });
            await draft.save();
            await updateJob(jobId, { status: 'done', progress: 100, message: `Mắt thần hoàn tất! (Chính xác đạt: ${validationResult.accuracy}%). Đang chờ sếp duyệt.` });
            console.log(`[Pipeline V2] 🎉 Hoàn thành đẩy đề thi vào phòng duyệt bài Review thành công!`);
        } else {
            await updateJob(jobId, { status: 'failed', progress: 100, message: 'Lỗi: Không bóc tách được dữ liệu.' });
        }
    } catch (error) {
        console.error(`[Worker System] ❌ Gãy pipeline ngầm:`, error.message);
        await updateJob(jobId, { status: 'failed', message: 'Pipeline sập hệ thống.', error: error.message });
    }
}

// ==========================================
// CÁC KHU VỰC ROUTERS API ENDPOINTS HỆ THỐNG
// ==========================================
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization || ""; const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Bạn cần đăng nhập để thực hiện thao tác này." });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ message: "Phiên đăng nhập hết hạn." }); }
};
const requireAdmin = (req, res, next) => { if (req.user?.role !== "admin") return res.status(403).json({ message: "Bạn không có quyền quản trị." }); next(); };
const requireSameUserOrAdmin = (req, res, next) => {
    if (req.user?.role === "admin" || String(req.user?.id) === String(req.params.userId)) return next();
    return res.status(403).json({ message: "Bạn không có quyền xem dữ liệu này." });
};

// CÁC API PHỤC VỤ LUỒNG ADMIN REVIEW SỬA ĐỀ VÀ DUYỆT ĐỀ CHÍNH THỨC
app.get('/api/admin/draft-exams/:jobId', authenticate, requireAdmin, async (req, res) => {
    try { const draft = await DraftExam.findOne({ jobId: req.params.jobId }); if (!draft) return res.status(404).json({ message: "Không thấy bản nháp đề." }); res.json(draft); } 
    catch { res.status(500).json({ message: "Lỗi." }); }
});

app.post('/api/admin/draft-exams/:jobId/approve', authenticate, requireAdmin, async (req, res) => {
    try {
        const draft = await DraftExam.findOne({ jobId: req.params.jobId });
        if (!draft) return res.status(404).json({ message: "Không tìm thấy đề nháp cần duyệt." });
        let exam;
        if (draft.targetExamId) {
            exam = await Exam.findById(draft.targetExamId);
            if (!exam) return res.status(404).json({ message: "Khong tim thay de goc de cap nhat." });
            exam.name = draft.name;
            exam.duration = draft.duration;
            exam.questions = draft.questions;
            await exam.save();
        } else {
            exam = new Exam({ name: draft.name, duration: draft.duration, questions: draft.questions });
            await exam.save();
        }
        await DraftExam.findByIdAndDelete(draft._id);
        await Job.findOneAndUpdate({ _id: req.params.jobId }, { examId: exam._id });
        res.status(200).json({ message: "🎉 Đề thi đã chính thức được duyệt lên sàn thi thử!", examId: exam._id });
    } catch { res.status(500).json({ message: "Lỗi duyệt bài." }); }
});

app.put('/api/admin/draft-exams/:jobId', authenticate, requireAdmin, async (req, res) => {
    try { await DraftExam.findOneAndUpdate({ jobId: req.params.jobId }, { questions: req.body.questions }); res.json({ message: "Đã lưu chỉnh sửa từ Admin!" }); } 
    catch { res.status(500).json({ message: "Lỗi lưu." }); }
});

app.get('/api/active-jobs', authenticate, requireAdmin, async (req, res) => {
    try { res.status(200).json(await Job.find({ createdBy: req.user.id, status: { $in: ['pending', 'processing'] } }).sort({ createdAt: -1 })); } 
    catch (error) { res.status(500).json({ message: "Lỗi kiểm tra tiến trình nền." }); }
});

app.post('/api/upload-exam', authenticate, requireAdmin, upload.any(), async (req, res) => {
    try {
        const files = req.files; if (!files || files.length === 0) return res.status(400).json({ message: 'Thiếu file!' });
        const examName = req.body.name || "Đề thi TOEIC Mới"; const duration = req.body.duration || 120;
        const selectedParts = req.body.parts ? JSON.parse(req.body.parts).map(Number) : [];

        const pdfFiles = files.filter(f => f.mimetype === 'application/pdf' && f.fieldname === 'examFiles');
        const zipFile = files.find(f => f.fieldname === 'audioZip' || (f.originalname && f.originalname.toLowerCase().endsWith('.zip')) || f.mimetype === 'application/zip');
        const cropFiles = files.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
        const listeningKeyFile = files.find(f => f.fieldname === 'listeningKey');
        const readingKeyFile = files.find(f => f.fieldname === 'readingKey');

        const job = await new Job({ type: 'create_exam', status: 'pending', progress: 0, message: 'Hệ thống đang nạp dữ liệu ảnh scan...', examName, createdBy: req.user.id }).save();
        res.status(202).json({ message: "Đã kích hoạt cổng AI chạy nền thành công!", jobId: job._id });

        processExamInBackground(pdfFiles, examName, duration, selectedParts, cropFiles, zipFile ? zipFile.path : null, listeningKeyFile ? listeningKeyFile.path : null, readingKeyFile ? readingKeyFile.path : null, job._id, {});
    } catch (error) { res.status(500).json({ message: 'Lỗi máy chủ' }); }
});

app.put('/api/exams/:id/append-files', authenticate, requireAdmin, upload.any(), async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: "Khong tim thay de thi." });

        const files = req.files || [];
        const examName = req.body.name || exam.name;
        const duration = Number(req.body.duration || exam.duration || 120);

        const pdfFiles = files.filter(f => f.mimetype === 'application/pdf' && f.fieldname === 'examFiles');
        const zipFile = files.find(f => f.fieldname === 'audioZip' || (f.originalname && f.originalname.toLowerCase().endsWith('.zip')) || f.mimetype === 'application/zip');
        const cropFiles = files.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
        const listeningKeyFile = files.find(f => f.fieldname === 'listeningKey');
        const readingKeyFile = files.find(f => f.fieldname === 'readingKey');

        const hasPipelineWork = pdfFiles.length > 0 || cropFiles.length > 0 || Boolean(zipFile || listeningKeyFile || readingKeyFile);

        if (!hasPipelineWork) {
            exam.name = examName;
            exam.duration = duration;
            await exam.save();
            return res.json({ message: "Da cap nhat thong tin de thi." });
        }

        const job = await new Job({
            type: 'update_exam',
            status: 'pending',
            progress: 0,
            message: 'Dang cap nhat de thi bang pipeline OCR...',
            examName,
            examId: exam._id,
            createdBy: req.user.id
        }).save();

        res.status(202).json({ message: "Da khoi tao pipeline cap nhat de. Sau khi xong, hay vao phong duyet de.", jobId: job._id });

        processExamInBackground(
            pdfFiles,
            examName,
            duration,
            [1, 2, 3, 4, 5, 6, 7],
            cropFiles,
            zipFile ? zipFile.path : null,
            listeningKeyFile ? listeningKeyFile.path : null,
            readingKeyFile ? readingKeyFile.path : null,
            job._id,
            { targetExamId: exam._id }
        );
    } catch (error) {
        res.status(500).json({ message: "Loi cap nhat de thi." });
    }
});

app.get('/api/exams', async (req, res) => {
    try {
        const exams = await Exam.find().select('-questions').sort({ createdAt: -1 });
        const counts = await Exam.aggregate([{ $project: { questionCount: { $size: { $ifNull: ['$questions', []] } } } }]);
        const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.questionCount]));
        res.json(exams.map(e => ({ ...e.toObject(), questionCount: countMap[String(e._id)] || 0 })));
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.get('/api/exams/:id', async (req, res) => {
    try { const exam = await Exam.findById(req.params.id); if (!exam) return res.status(404).json({ message: "Không tìm thấy đề thi." }); res.json(exam); } 
    catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.delete('/api/exams/:id', authenticate, requireAdmin, async (req, res) => {
    try { await Exam.findByIdAndDelete(req.params.id); res.json({ message: "Đã xóa!" }); } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.patch('/api/exams/:id/questions', authenticate, requireAdmin, async (req, res) => {
    try {
        const { questions } = req.body; const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: "Không tìm thấy đề." });
        exam.questions = questions; await exam.save(); res.json({ message: `Thành công!` });
    } catch (error) { res.status(500).json({ message: "Lỗi." }); }
});

app.get('/api/jobs/:id', authenticate, async (req, res) => {
    try { res.json(await Job.findById(req.params.id)); } catch (error) { res.status(500).json({ message: "Lỗi." }); }
});

app.post('/api/results', authenticate, async (req, res) => {
    try {
        const { examId, userAnswers, timeSpent } = req.body; const exam = await Exam.findById(examId);
        if (!exam) return res.status(404).json({ message: "Không tìm thấy đề thi." });
        let correctListening = 0; let totalListening = 0; let correctReading = 0; let totalReading = 0;
        exam.questions.forEach(q => {
            const isListening = q.QuestionNo <= 100; if (isListening) totalListening++; else totalReading++;
            const studentAns = String(userAnswers?.[q.QuestionNo] || "").trim().toUpperCase();
            const correctAns = String(q.CorrectAnswer || "").trim().toUpperCase();
            if (studentAns && studentAns === correctAns) { if (isListening) correctListening++; else correctReading++; }
        });
        const toeicScores = calculateToeicScoreStandard(correctListening, correctReading);
        const newResult = new Result({
            userId: req.user.id, examId, examName: exam.name, correctListening, wrongListening: totalListening - correctListening, totalListening,
            correctReading, wrongReading: totalReading - correctReading, totalReading, scoreListening: toeicScores.scoreListening, scoreReading: toeicScores.scoreReading, totalScore: toeicScores.totalScore, timeSpent: timeSpent || 0, userAnswers: userAnswers || {}
        });
        await newResult.save(); res.status(201).json({ message: "Nộp bài thành công!", result: newResult });
    } catch (error) { res.status(500).json({ message: "Lỗi hệ thống tính điểm." }); }
});

app.get('/api/results/me', authenticate, async (req, res) => {
    try { res.json(await Result.find({ userId: req.user.id }).sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.get('/api/results/user/:userId', authenticate, requireSameUserOrAdmin, async (req, res) => {
    try { res.json(await Result.find({ userId: req.params.userId }).sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ message: "Lỗi." }); }
});

// ==========================================
// CỔNG CHAT TƯ VẤN HỖ TRỢ HỌC VIÊN
// ==========================================
app.post('/api/contacts', async (req, res) => {
    try {
        const { name, email, subject, message, userId } = req.body;
        const newTicket = new Contact({ userId, name, email, subject, message, messages: [{ sender: 'user', text: message, createdAt: new Date() }] });
        await newTicket.save(); res.status(201).json({ message: "Đã gửi yêu cầu hỗ trợ thành công!" });
    } catch (error) { res.status(500).json({ message: "Lỗi hệ thống." }); }
});

app.get('/api/admin/contacts', authenticate, requireAdmin, async (req, res) => {
    try { res.status(200).json(await Contact.find().sort({ status: 1, createdAt: -1 })); } catch (error) { res.status(500).json({ message: "Lỗi tải danh sách." }); }
});

app.patch('/api/admin/contacts/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { status, reply } = req.body; const setOps = {}; const pushOps = {};
        if (status) setOps.status = status;
        if (typeof reply !== 'undefined') { setOps.adminReply = reply; setOps.repliedAt = new Date(); if (!setOps.status) setOps.status = 'read'; pushOps.messages = { sender: 'admin', text: reply, createdAt: new Date() }; }
        const updateDoc = {}; if (Object.keys(setOps).length) updateDoc.$set = setOps; if (Object.keys(pushOps).length) updateDoc.$push = pushOps;
        if (Object.keys(updateDoc).length) { await Contact.findByIdAndUpdate(req.params.id, updateDoc); }
        res.status(200).json({ message: "Đã cập nhật thông báo." });
    } catch (error) { res.status(500).json({ message: "Lỗi cập nhật." }); }
});

app.post('/api/admin/contacts/:id/messages', authenticate, requireAdmin, async (req, res) => {
    try {
        const { text } = req.body; if (!text || !text.trim()) return res.status(400).json({ message: 'Thiếu nội dung.' });
        const updated = await Contact.findByIdAndUpdate(req.params.id, {
            $push: { messages: { sender: 'admin', text: text.trim(), createdAt: new Date() } },
            $set: { adminReply: text.trim(), repliedAt: new Date(), status: 'read' }
        }, { new: true }); res.status(200).json(updated);
    } catch (error) { res.status(500).json({ message: 'Lỗi gửi phản hồi.' }); }
});

app.get('/api/contacts/me', authenticate, async (req, res) => {
    try { res.status(200).json(await Contact.find({ userId: req.user.id }).sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ message: "Lỗi." }); }
});

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
    try { res.status(200).json(await User.find().select('-password').sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ message: "Lỗi." }); }
});

// --- AUTH ROUTERS ---
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body; const normalizedEmail = String(email || "").trim().toLowerCase();
        if (await User.findOne({ email: normalizedEmail })) return res.status(400).json({ message: "Email đã dùng!" });
        const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
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

app.listen(PORT, () => console.log(`🚀 Backend TOEIC Siêu AI chạy tại http://localhost:${PORT}`));