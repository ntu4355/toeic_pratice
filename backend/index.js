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
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import PDFParser from "pdf2json"; 

dotenv.config();

// ==========================================
// CÔNG CỤ XỬ LÝ PDF (HIỆN ĐẠI & ỔN ĐỊNH 100%)
// ==========================================
const parsePdfBuffer = (buffer) => {
    return new Promise((resolve, reject) => {
        try {
            const pdfParser = new PDFParser(null, 1); 
            
            pdfParser.on("pdfParser_dataError", errData => {
                console.error("🔥 LỖI ĐỌC PDF:", errData.parserError);
                reject(new Error(errData.parserError));
            });
            
            pdfParser.on("pdfParser_dataReady", () => {
                resolve({ text: pdfParser.getRawTextContent() });
            });
            
            pdfParser.parseBuffer(buffer);
        } catch (error) {
            reject(error);
        }
    });
};

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
    client: new GoogleGenerativeAI(key),
    fileClient: new GoogleAIFileManager(key),
    dailyExhausted: false,
}));
const keyState = { current: 0 };
const getActiveKey = () => geminiKeys[keyState.current];

const rotateKey = (reason = "") => {
    const prevIdx = keyState.current;
    geminiKeys[prevIdx].dailyExhausted = true;
    const nextIdx = geminiKeys.findIndex((k, i) => i > prevIdx && !k.dailyExhausted);
    if (nextIdx !== -1) {
        keyState.current = nextIdx;
        console.log(`[Key Rotator] 🔄 Key #${prevIdx+1} hết quota ngày → Chuyển sang Key #${nextIdx+1}. ${reason}`);
        return true;
    }
    const fromStart = geminiKeys.findIndex(k => !k.dailyExhausted);
    if (fromStart !== -1 && fromStart !== prevIdx) {
        keyState.current = fromStart;
        console.log(`[Key Rotator] 🔄 Dùng lại Key #${fromStart+1}. ${reason}`);
        return true;
    }
    console.log(`[Key Rotator] ❌ Tất cả ${geminiKeys.length} key đều hết quota ngày!`);
    return false;
};

const genAI = { getGenerativeModel: (...args) => getActiveKey().client.getGenerativeModel(...args) };

// 💡 ĐÃ GHIM CỨNG THÀNH 1.5-FLASH ĐỂ TRÁNH HẾT QUOTA, BẤT CHẤP FILE .ENV
const GEMINI_EXTRACT_MODEL = "gemini-2.5-flash";
const GEMINI_KEY_MODEL     = "gemini-2.5-flash";
const GEMINI_CLEANUP_MODEL = "gemini-2.5-flash";
console.log(`[Gemini] ✅ Đã tải ${geminiKeys.length} API key. Model đang dùng: ${GEMINI_EXTRACT_MODEL}`);

const upload = multer({ dest: 'uploads/' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 💡 TĂNG ĐỘ TRỄ LÊN 3.5 GIÂY ĐỂ TRÁNH BỊ GOOGLE PHẠT SPAM
const POLITE_DELAY = 3500;

const chunkText = (text, maxLength) => {
    const chunks = [];
    let currentChunk = "";
    const lines = text.split('\n');
    for (const line of lines) {
        if (currentChunk.length + line.length > maxLength) {
            chunks.push(currentChunk);
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }
    if (currentChunk.trim()) chunks.push(currentChunk);
    return chunks.length > 0 ? chunks : [text];
};

const isRateLimitError = (error) => {
    const msg = (error?.message || "").toLowerCase();
    const status = error?.status || error?.code || 0;
    return status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource_exhausted") || status === 503 || msg.includes("503");
};

const isDailyQuotaExhausted = (error) => {
    const msg = error?.message || "";
    try {
        const m = msg.match(/\[\{[\s\S]*?\}\]/);
        if (m) {
            const arr = JSON.parse(m[0]);
            return arr.some(item => item?.violations?.some(v =>
                v.quotaId?.toLowerCase().includes("perday") &&
                (String(v.quotaValue) === "0" || msg.includes("limit: 0"))
            ));
        }
    } catch {}
    return (msg.toLowerCase().includes("perday") || msg.includes("per_day")) && msg.includes("limit: 0");
};

const parseRetryDelay = (error) => {
    const msg = error?.message || "";
    try {
        const m = msg.match(/\[\{[\s\S]*?\}\]/);
        if (m) {
            const arr = JSON.parse(m[0]);
            for (const item of arr) {
                if (item["@type"]?.includes("RetryInfo") && item.retryDelay) {
                    const s = parseInt(item.retryDelay.replace("s",""), 10);
                    if (!isNaN(s) && s > 0) return s * 1000 + 2000;
                }
            }
        }
    } catch {}
    const match = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
    if (match) return Math.ceil(parseFloat(match[1])) * 1000 + 2000;
    return 65000;
};

const smartSleep = async (error, label = "") => {
    if (!isRateLimitError(error)) {
        console.log(`[${label}] ↻ Lỗi máy chủ Google, thử lại sau 3s...`);
        await sleep(3000);
        return;
    }
    if (isDailyQuotaExhausted(error)) {
        const rotated = rotateKey(`(trigger: ${label})`);
        if (!rotated) {
            console.log(`[${label}] ⚠️ Tất cả key hết quota ngày. Đang chờ 60s để hồi phục...`);
            await sleep(60000);
        }
        return;
    }
    const waitMs = parseRetryDelay(error);
    console.log(`[${label}] ⏳ Quá tải hệ thống! Nghỉ ${Math.ceil(waitMs/1000)}s theo yêu cầu của Google...`);
    await sleep(waitMs > 0 ? waitMs : 5000);
};

const getJsonModel = (modelName) => genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" }
});

const updateJob = async (jobId, patch) => {
    if (!jobId) return null;
    try {
        // Đã sửa thành returnDocument để chặn Warning của Mongoose
        return await Job.findByIdAndUpdate(jobId, patch, { returnDocument: 'after' });
    } catch (error) {
        return null;
    }
};

const parseJsonObject = (rawText) => {
    if (!rawText || typeof rawText !== "string") return null;
    try { return JSON.parse(rawText); } catch {}
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    try { return JSON.parse(rawText.substring(firstBrace, lastBrace + 1)); } catch { return null; }
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

    // 💡 BỌC THÉP: Ép chuẩn Part theo đúng luật TOEIC, không tin tưởng AI
    const part = inferPartFromQuestionNo(questionNo);
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
    if (!token) return res.status(401).json({ message: "Bạn cần đăng nhập để thực hiện thao tác này." });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch { return res.status(401).json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." }); }
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Bạn không có quyền quản trị." });
    next();
};

const requireSameUserOrAdmin = (req, res, next) => {
    if (req.user?.role === "admin" || String(req.user?.id) === String(req.params.userId)) return next();
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
// HÀM AI ĐỌC TEXT FILE ĐÁP ÁN 
// ==========================================
async function processKeyPdf(filePath, keyName) {
    let extractedKeys = {};
    if (!filePath || !fs.existsSync(filePath)) return extractedKeys;

    console.log(`\n[Key Parser] 🧠 Bắt đầu vắt Text từ file Đáp án ${keyName}...`);
    
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfData = await parsePdfBuffer(pdfBuffer);
    const fullText = pdfData.text || "";

    const textChunks = chunkText(fullText, 8000); 

    for (let j = 0; j < textChunks.length; j++) {
        const chunk = textChunks[j];
        console.log(`[Key Parser] Phân tích Đáp án ${keyName} (Phần ${j + 1}/${textChunks.length})...`);

        let attempt = 0;
        let chunkSuccess = false;

        while (attempt < 3 && !chunkSuccess) {
            attempt++;
            try {
                const model = getJsonModel(GEMINI_KEY_MODEL);
                const PROMPT_KEY = `Bạn là chuyên gia chấm thi TOEIC. Hãy bóc tách ĐÁP ÁN ĐÚNG và LỜI GIẢI THÍCH từ đoạn văn bản sau.
                - YÊU CẦU QUAN TRỌNG: Phần "Explanation" BẮT BUỘC phải lấy toàn bộ Transcript (Lời thoại), Giải thích chi tiết và DỊCH NGHĨA TIẾNG VIỆT.
                - Định dạng JSON trả về bắt buộc:
                { "keys": [ { "QuestionNo": 101, "CorrectAnswer": "A", "Explanation": "Nội dung lời thoại, giải thích và bản dịch..." } ] }
                - Nếu đoạn văn bản này không chứa đáp án câu nào, hãy trả về { "keys": [] }
                
                Văn bản cần xử lý:
                """
                ${chunk}
                """`;

                const result = await model.generateContent([{ text: PROMPT_KEY }]);
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
                    console.log(`[Key Parser] [V] Xong phần ${j+1}. Lấy được ${normalizedKeys.length} đáp án.`);
                }
            } catch (error) {
                console.error(`[Key Parser] [!] Lỗi (Lần ${attempt}):`, error.message);
                if (attempt < 3) await smartSleep(error, "Key Parser");
            }
        }
        if (j < textChunks.length - 1) await sleep(POLITE_DELAY);
    }
    try { fs.unlinkSync(filePath); } catch(e){}
    return extractedKeys;
}

// ==========================================
// HÀM CHẠY NGẦM BÓC TÁCH ĐỀ THI
// ==========================================
async function processExamInBackground(pdfFiles, examName, duration, partsArray, cropFiles, zipFilePath, listeningKeyPath, readingKeyPath, jobId = null) {
    try {
        console.log(`\n======================================================`);
        console.log(`[Worker] Bắt đầu xử lý ĐỀ THI: ${examName}`);
        await updateJob(jobId, { status: 'processing', progress: 5, message: 'Đang vắt chữ từ file đáp án...' });
        
        // 💡 SỬA LỖI NÚT THẮT CỔ CHAI: Đọc đáp án NỐI TIẾP thay vì SONG SONG
        let listeningKeys = {};
        if (listeningKeyPath) {
            console.log("[Key Parser] ⏳ Đang xử lý Đáp án Listening (Vui lòng chờ)...");
            listeningKeys = await processKeyPdf(listeningKeyPath, "Listening");
            console.log("[Key Parser] ✅ Xong Đáp án Listening! Nghỉ 3 giây cho Google nghỉ thở...");
            await sleep(3000); 
        }

        let readingKeys = {};
        if (readingKeyPath) {
            console.log("[Key Parser] ⏳ Đang xử lý Đáp án Reading (Vui lòng chờ)...");
            readingKeys = await processKeyPdf(readingKeyPath, "Reading");
            console.log("[Key Parser] ✅ Xong Đáp án Reading! Nghỉ 3 giây...");
            await sleep(3000);
        }

        const allKeys = { ...listeningKeys, ...readingKeys };
        await updateJob(jobId, { progress: 25, message: 'Đã đọc đáp án, đang xử lý ảnh và audio...' });

        let finalQuestionsArray = [];
        let audioUrlMap = {}; 
        let taskImageMap = {}; 

        if (cropFiles && cropFiles.length > 0) {
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
            const extractedPath = path.join(process.cwd(), `uploads/audio_${Date.now()}`);
            fs.mkdirSync(extractedPath, { recursive: true });
            const zip = new AdmZip(zipFilePath);
            zip.extractAllTo(extractedPath, true);

            const audioFiles = getAllAudioFiles(extractedPath);
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

        await updateJob(jobId, { progress: 40, message: 'Đã xử lý xong media, đang đẩy Text cho AI...' });

        if (pdfFiles && pdfFiles.length > 0) {
            console.log(`\n[+] Bắt đầu vắt chữ từ File Đề Thi (PDF -> Text)...`);
            for (let i = 0; i < pdfFiles.length; i++) {
                const pdfFile = pdfFiles[i];
                
                const pdfBuffer = fs.readFileSync(pdfFile.path);
                const pdfData = await parsePdfBuffer(pdfBuffer);
                const fullText = pdfData.text || "";

                const textChunks = chunkText(fullText, 8000); 

                for (let j = 0; j < textChunks.length; j++) {
                    const chunk = textChunks[j];
                    console.log(`[Exam Parser] 🧠 AI phân tích Đề thi (Phần ${j + 1}/${textChunks.length})...`);
                    const chunkProgress = Math.min(90, 40 + Math.round(((i + (j / textChunks.length)) / pdfFiles.length) * 50));
                    await updateJob(jobId, { progress: chunkProgress, message: `Đang nhờ AI bóc tách file ${i + 1}/${pdfFiles.length}, phần ${j + 1}/${textChunks.length}...` });

                    let attempt = 0;
                    let chunkSuccess = false;

                    while (attempt < 3 && !chunkSuccess) {
                        attempt++;
                        try {
                            const model = getJsonModel(GEMINI_EXTRACT_MODEL);

                            const PROMPT_TOEIC = `Bạn là chuyên gia TOEIC. Nhiệm vụ của bạn là bóc tách TẤT CẢ các câu hỏi trắc nghiệm từ đoạn văn bản sau.
                            - Lấy CHUẨN XÁC số thứ tự câu hỏi (Ví dụ: 32., 101., 150.).
                            - Bỏ qua Part 1, 2. CHỈ TÌM và trích xuất các câu hỏi từ số 32 đến 200.
                            - TUYỆT ĐỐI KHÔNG CẦN đọc và trích xuất đoạn văn (PassageText). Hãy để "PassageText": "".
                            - Bắt buộc trả về định dạng JSON chuẩn:
                            { "questions": [ { "Part": int, "QuestionNo": int, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "PassageText": "" } ] }
                            - TÌM THẬT KỸ! Đừng bỏ sót bất kỳ câu hỏi nào trong đoạn văn bản này.
                            
                            Văn bản cần xử lý:
                            """
                            ${chunk}
                            """`;

                            const result = await model.generateContent([{ text: PROMPT_TOEIC }]);
                            const rawText = result.response.text();
                            
                            const parsedData = await parseAiJson(
                                rawText,
                                '{ "questions": [ { "Part": number, "QuestionNo": number, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "PassageText": "" } ] }',
                                { questions: [] }
                            );
                            
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

                                        // 💡 BỌC THÉP LỌC TRÙNG LẶP: Không cho phép AI đẻ ra 2 câu giống nhau
                                        processedQuestions.forEach(newQ => {
                                            const existingIdx = finalQuestionsArray.findIndex(q => q.QuestionNo === newQ.QuestionNo);
                                            if (existingIdx !== -1) {
                                                finalQuestionsArray[existingIdx] = { ...finalQuestionsArray[existingIdx], ...newQ };
                                            } else {
                                                finalQuestionsArray.push(newQ);
                                            }
                                        });
                                }
                                chunkSuccess = true; 
                                console.log(`[Exam Parser] [V] Đã đóng gói xong Phần ${j+1}/${textChunks.length}.`);
                            }
                        } catch (error) {
                            console.error(`[Exam Parser] ❌ Lỗi (Lần thử ${attempt}):`, error.message);
                            if (attempt < 3) await smartSleep(error, "Exam Parser");
                        }
                    } 
                    if (j < textChunks.length - 1) {
                        await sleep(POLITE_DELAY);
                    }
                }
                
                // 💡 NGHỈ 5S SAU KHI XONG MỖI FILE ĐỂ TRÁNH DỘI BOM GOOGLE
                console.log(`[Exam Parser] ✅ Đã xong file PDF ${i + 1}. Nghỉ 5 giây trước khi tiếp tục...`);
                await sleep(5000);

                try { fs.unlinkSync(pdfFile.path); } catch(e){}
            }
        }

        finalQuestionsArray.sort((a, b) => a.QuestionNo - b.QuestionNo);
        console.log(`\n[Worker] 🎉 HOÀN TẤT ĐỀ THI: ${examName}! Tổng số câu: ${finalQuestionsArray.length}`);
        
        if (finalQuestionsArray.length > 0) {
            const newExam = new Exam({ name: examName, duration: duration, questions: finalQuestionsArray });
            await newExam.save();
            await updateJob(jobId, { status: 'done', progress: 100, message: `Đã tạo đề thi với ${finalQuestionsArray.length} câu.`, examId: newExam._id });
        } else {
            await updateJob(jobId, { status: 'failed', progress: 100, message: 'AI không bóc được câu hỏi nào từ text.', error: 'No questions extracted' });
        }

    } catch (error) {
        console.error(`[Worker] ❌ Lỗi xử lý ngầm:`, error.message);
        await updateJob(jobId, { status: 'failed', message: 'Xử lý đề thi thất bại.', error: error.message });
    }
}

// ==========================================
// CÁC API POST / PUT / GET
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
            message: 'Đã nhận file, đang chuyển đổi PDF sang Text...',
            examName,
            createdBy: req.user.id
        }).save();

        res.status(202).json({
            message: "Đã tiếp nhận file! Hệ thống AI đang chạy nền siêu tốc.",
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

app.put('/api/exams/:id/append-files', authenticate, requireAdmin, upload.any(), async (req, res) => {
    try {
        const examId = req.params.id;
        const files = req.files;
        
        const updateData = {};
        if (req.body.name) updateData.name = req.body.name;
        if (req.body.duration) updateData.duration = req.body.duration;
        await Exam.findByIdAndUpdate(examId, updateData, { returnDocument: 'after' });

        if (!files || files.length === 0) {
            return res.json({ message: "Đã cập nhật thông tin cơ bản (Không có file mới)." });
        }

        const job = await new Job({
            type: 'update_exam',
            status: 'pending',
            progress: 0,
            message: 'Đã nhận file bổ sung, đang chuẩn bị text cho AI.',
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
                const exam = await Exam.findById(examId);
                if (!exam) {
                    await updateJob(job._id, { status: 'failed', error: 'Exam not found', message: 'Không tìm thấy đề thi.' });
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
                    await updateJob(job._id, { progress: 25, message: 'Đang vắt chữ bổ sung...' });
                    for (let i = 0; i < examPdfFiles.length; i++) {
                        const examPdfFile = examPdfFiles[i];
                        const pdfBuffer = fs.readFileSync(examPdfFile.path);
                        const pdfData = await parsePdfBuffer(pdfBuffer);
                        const fullText = pdfData.text || "";

                        const textChunks = chunkText(fullText, 8000);

                        for (let j = 0; j < textChunks.length; j++) {
                            const chunk = textChunks[j];
                            const chunkProgress = Math.min(65, 25 + Math.round(((i + (j / textChunks.length)) / examPdfFiles.length) * 40));
                            await updateJob(job._id, { progress: chunkProgress, message: `Đang quét văn bản bổ sung ${i + 1}/${examPdfFiles.length}, phần ${j + 1}/${textChunks.length}...` });

                            let attempt = 0;
                            let chunkSuccess = false;

                            while (attempt < 3 && !chunkSuccess) {
                                attempt++;
                                try {
                                    const model = getJsonModel(GEMINI_EXTRACT_MODEL);
                                    const PROMPT_TOEIC = `Bạn là chuyên gia TOEIC. Hãy bóc tách các câu hỏi trắc nghiệm từ đoạn văn bản sau.
                                    - Lấy CHUẨN XÁC số thứ tự câu hỏi (QuestionNo).
                                    - Bỏ qua Part 1, 2. Chỉ tập trung Part 3, 4, 5, 6, 7.
                                    - 🛑 QUAN TRỌNG: BỎ QUA HOÀN TOÀN các câu hỏi số: [${existingQsText}].
                                    - Bắt buộc trả về định dạng JSON:
                                    { "questions": [ { "Part": int, "QuestionNo": int, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "PassageText": "" } ] }
                                    - Nếu không có câu mới trả về { "questions": [] }
                                    
                                    Văn bản cần xử lý:
                                    """
                                    ${chunk}
                                    """`;

                                    const result = await model.generateContent([{ text: PROMPT_TOEIC }]);
                                    const parsedData = await parseAiJson(result.response.text(), '{ "questions": [] }', { questions: [] });
                                    
                                    if (parsedData.questions && Array.isArray(parsedData.questions)) {
                                        const normalizedQuestions = parsedData.questions.map(normalizeQuestionItem).filter(Boolean);
                                        normalizedQuestions.forEach(newQ => {
                                            const existingQIndex = updatedQuestions.findIndex(q => q.QuestionNo === newQ.QuestionNo);
                                            if (existingQIndex !== -1) updatedQuestions[existingQIndex] = { ...updatedQuestions[existingQIndex], ...newQ };
                                            else updatedQuestions.push({ ...newQ, AudioUrl: "", PassageImages: [], ImageUrl: "", CorrectAnswer: "", Explanation: "" });
                                        });
                                        chunkSuccess = true;
                                    }
                                } catch (error) {
                                    if (attempt < 3) await smartSleep(error, "Worker Update");
                                }
                            }
                            if (j < textChunks.length - 1) await sleep(POLITE_DELAY);
                        }
                        try { fs.unlinkSync(examPdfFile.path); } catch(e){} 
                    }
                }

                if (listeningKeyFile) {
                    await updateJob(job._id, { progress: 70, message: 'Đang đọc đáp án Listening bổ sung...' });
                    const keys = await processKeyPdf(listeningKeyFile.path, "Listening (Bổ sung)");
                    allKeys = { ...allKeys, ...keys };
                    await sleep(3000);
                }
                if (readingKeyFile) {
                    await updateJob(job._id, { progress: 75, message: 'Đang đọc đáp án Reading bổ sung...' });
                    const keys = await processKeyPdf(readingKeyFile.path, "Reading (Bổ sung)");
                    allKeys = { ...allKeys, ...keys };
                    await sleep(3000);
                }

                if (Object.keys(allKeys).length > 0) {
                    updatedQuestions = updatedQuestions.map(q => {
                        if (allKeys[q.QuestionNo]) {
                            return { ...q, CorrectAnswer: allKeys[q.QuestionNo].CorrectAnswer || q.CorrectAnswer, Explanation: allKeys[q.QuestionNo].Explanation || q.Explanation };
                        }
                        return q;
                    });
                }

                if (zipFile && fs.existsSync(zipFile.path)) {
                    await updateJob(job._id, { progress: 82, message: 'Đang xử lý audio bổ sung...' });
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

                    updatedQuestions = updatedQuestions.map(q => audioUrlMap[q.QuestionNo] ? { ...q, AudioUrl: audioUrlMap[q.QuestionNo] } : q);
                }

                // Chèn các câu Part 1 & 2 rỗng nếu thiếu
                for (let k = 1; k <= 31; k++) {
                    if (!updatedQuestions.find(q => q.QuestionNo === k)) {
                        if (allKeys[k] || taskImageMap[`part1_image_${k}`]) {
                            const isPart1 = k <= 6;
                            updatedQuestions.push({
                                Part: isPart1 ? 1 : 2, QuestionNo: k, 
                                QuestionText: isPart1 ? "(Nghe Audio và chọn đáp án mô tả đúng nhất bức tranh)" : "(Nghe Audio và chọn câu phản hồi đúng nhất)",
                                OptionA: "A", OptionB: "B", OptionC: "C", OptionD: isPart1 ? "D" : "",
                                ImageUrl: isPart1 && taskImageMap[`part1_image_${k}`] ? taskImageMap[`part1_image_${k}`][0] : "",
                                AudioUrl: "", CorrectAnswer: allKeys[k]?.CorrectAnswer || "", Explanation: allKeys[k]?.Explanation || ""
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
                                if (taskId.startsWith('part6_') || taskId.startsWith('part7_')) { pImages = taskImageMap[taskId]; }
                                if (taskId.startsWith('part3_') || taskId.startsWith('part4_')) { graphicUrl = taskImageMap[taskId][0] || ""; }
                            }
                        }
                    }
                    return { ...q, PassageImages: pImages, ImageUrl: graphicUrl };
                });

                updatedQuestions.sort((a, b) => a.QuestionNo - b.QuestionNo);
                exam.questions = updatedQuestions;
                await exam.save();
                await updateJob(job._id, { status: 'done', progress: 100, message: `Đã cập nhật xong!`, examId: exam._id });

            } catch (error) {
                await updateJob(job._id, { status: 'failed', message: 'Cập nhật đề thi thất bại.', error: error.message });
            }
        }, 1000); 

    } catch (error) { res.status(500).json({ message: 'Lỗi máy chủ' }); }
});

app.get('/api/exams', async (req, res) => {
    try {
        const exams = await Exam.find().select('-questions').sort({ createdAt: -1 });
        const counts = await Exam.aggregate([{ $project: { questionCount: { $size: { $ifNull: ['$questions', []] } } } }]);
        const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.questionCount]));
        const result = exams.map(e => ({ ...e.toObject(), questionCount: countMap[String(e._id)] || 0 }));
        res.json(result);
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.get('/api/exams/:id', async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: "Không tìm thấy." });
        res.json(exam);
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.delete('/api/exams/:id', authenticate, requireAdmin, async (req, res) => {
    try { await Exam.findByIdAndDelete(req.params.id); res.json({ message: "Đã xóa!" }); } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.patch('/api/exams/:id/questions', authenticate, requireAdmin, async (req, res) => {
    try {
        const { questions } = req.body;
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ message: "Lỗi." });
        exam.questions = questions;
        await exam.save();
        res.json({ message: `Thành công!` });
    } catch (error) { res.status(500).json({ message: "Lỗi." }); }
});

app.get('/api/jobs/:id', authenticate, async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ message: "Lỗi." });
        res.json(job);
    } catch (error) { res.status(500).json({ message: "Lỗi." }); }
});

app.post('/api/results', authenticate, async (req, res) => {
    try {
        const newResult = new Result({ ...req.body, userId: req.user.id });
        await newResult.save();
        res.status(201).json({ message: "Thành công!", result: newResult });
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.get('/api/results/me', authenticate, async (req, res) => {
    try { res.json(await Result.find({ userId: req.user.id }).sort({ createdAt: -1 })); } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (await User.findOne({ email: normalizedEmail })) return res.status(400).json({ message: "Email đã dùng!" });
        const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
        const safeRole = role === "admin" && normalizedEmail === "admin@toeic.com" ? "admin" : "user";
        await new User({ name, email: normalizedEmail, password: hashedPassword, role: safeRole }).save();
        res.status(201).json({ message: "Thành công!" });
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: String(email || "").trim().toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: "Sai!" });
        res.status(200).json({ 
            message: "Thành công!", 
            token: jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' }), 
            user: { id: user._id, name: user.name, email: user.email, role: user.role } 
        });
    } catch (error) { res.status(500).json({ message: "Lỗi" }); }
});

app.listen(PORT, () => console.log(`🚀 Backend TOEIC Siêu AI chạy tại http://localhost:${PORT}`));