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

// THÊM 2 THƯ VIỆN BẢO MẬT
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Chuỗi bí mật để tạo thẻ JWT (Có thể giấu vào file .env sau)
const JWT_SECRET = process.env.JWT_SECRET || "toeic_secret_key_2026_sieu_bao_mat";

app.use(cors());
app.use(express.json());

// --- MONGODB ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Đã mở khóa Két sắt MongoDB thành công!'))
  .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// SCHEMA ĐỀ THI
const examSchema = new mongoose.Schema({
    name: String,
    duration: Number,
    createdAt: { type: Date, default: Date.now },
    questions: Array 
});
const Exam = mongoose.model('Exam', examSchema);

// ==========================================
// SCHEMA NGƯỜI DÙNG (USER DATABASE)
// ==========================================
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

// HÀM TÌM FILE AUDIO XUYÊN THƯ MỤC (ĐỆ QUY)
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
// HÀM CHẠY NGẦM BÓC TÁCH ĐỀ THI
// ==========================================
// THAY ĐỔI 1: Nhận 'cropFiles' (chứa toàn bộ ảnh scan) thay vì chỉ part1ImagesData
async function processExamInBackground(pdfFiles, examName, duration, partsArray, cropFiles, zipFilePath) {
    try {
        console.log(`\n[Worker] Bắt đầu xử lý ngầm đề thi: ${examName}`);
        let finalQuestionsArray = [];
        let audioUrlMap = {}; 
        let taskImageMap = {}; // Lưu trữ mảng ảnh theo từng task (Ví dụ: part7_147_148: [url1, url2])

        // ----------------------------------------------------
        // 0. UPLOAD TOÀN BỘ ẢNH SCAN LÊN CLOUDINARY ĐẦU TIÊN
        // ----------------------------------------------------
        if (cropFiles && cropFiles.length > 0) {
            console.log(`[+] Đang đẩy ${cropFiles.length} bức ảnh scan lên Cloudinary...`);
            for (const file of cropFiles) {
                try {
                    const taskId = file.fieldname; // Lấy mã nhóm (VD: part6_131_134)
                    const result = await cloudinary.uploader.upload(file.path, { folder: "toeic_crops" });
                    
                    if (!taskImageMap[taskId]) taskImageMap[taskId] = [];
                    taskImageMap[taskId].push(result.secure_url);
                    
                    fs.unlinkSync(file.path); 
                } catch (e) {
                    console.error(`[!] Lỗi up ảnh scan ${file.fieldname}:`, e.message);
                }
            }
            console.log(`[+] Đã map xong hình ảnh vào các nhóm câu hỏi!`);
        }

        // ----------------------------------------------------
        // 1. XỬ LÝ FILE ZIP AUDIO
        // ----------------------------------------------------
        if (zipFilePath && fs.existsSync(zipFilePath)) {
            console.log(`[+] Đang giải nén và phân loại Audio...`);
            const extractedPath = path.join(process.cwd(), `uploads/audio_${Date.now()}`);
            fs.mkdirSync(extractedPath, { recursive: true });
            const zip = new AdmZip(zipFilePath);
            zip.extractAllTo(extractedPath, true);

            const audioFiles = getAllAudioFiles(extractedPath);
            console.log(`[+] Tìm thấy ${audioFiles.length} file âm thanh trong ZIP. Đang đẩy lên Cloudinary...`);

            for (const filePath of audioFiles) {
                try {
                    const result = await cloudinary.uploader.upload(filePath, { resource_type: "video", folder: "toeic_audio" });
                    const fileUrl = result.secure_url;
                    
                    const fileName = path.basename(filePath);
                    const baseName = fileName.split('.')[0]; 
                    
                    const match = baseName.match(/(?:^|-)(\d+)(?:-(\d+))?$/); 

                    if (match) {
                        let start = parseInt(match[1], 10);
                        let end = match[2] ? parseInt(match[2], 10) : start;

                        if (end - start > 5) {
                            start = end; 
                        }

                        for (let k = start; k <= end; k++) {
                            audioUrlMap[k] = fileUrl;
                        }
                    }
                } catch (e) { 
                    console.error(`[!] Lỗi đẩy Audio ${filePath}:`, e.message); 
                }
            }
            fs.rmSync(extractedPath, { recursive: true, force: true });
            fs.unlinkSync(zipFilePath);
            console.log(`[+] Đã tải xong và map Audio thành công!`);
        }

        // ----------------------------------------------------
        // 2. SINH CÂU HỎI PART 1 VÀ 2 (Dùng ảnh từ taskImageMap)
        // ----------------------------------------------------
        if (partsArray.includes(1)) {
            console.log(`[Worker] Đang thiết lập Part 1...`);
            for (let i = 1; i <= 6; i++) {
                const taskId = `part1_image_${i}`;
                const images = taskImageMap[taskId] || [];
                finalQuestionsArray.push({
                    Part: 1, QuestionNo: i, QuestionText: "(Nghe Audio và chọn đáp án mô tả đúng nhất bức tranh)",
                    OptionA: "A", OptionB: "B", OptionC: "C", OptionD: "D", CorrectAnswer: "", 
                    ImageUrl: images.length > 0 ? images[0] : "", // Part 1 chỉ cần 1 ảnh
                    AudioUrl: audioUrlMap[i] || "" 
                });
            }
        }

        if (partsArray.includes(2)) {
            for (let i = 7; i <= 31; i++) {
                finalQuestionsArray.push({
                    Part: 2, QuestionNo: i, QuestionText: "(Nghe Audio và chọn câu phản hồi đúng nhất)",
                    OptionA: "A", OptionB: "B", OptionC: "C", OptionD: "", 
                    CorrectAnswer: "", ImageUrl: "",
                    AudioUrl: audioUrlMap[i] || ""
                });
            }
        }

        // ----------------------------------------------------
        // 3. TỰ ĐỘNG CẮT 3 TRANG/MẢNH VÀ XỬ LÝ QUA GEMINI
        // ----------------------------------------------------
        if (pdfFiles && pdfFiles.length > 0) {
            for (let i = 0; i < pdfFiles.length; i++) {
                const pdfFile = pdfFiles[i];
                console.log(`\n[+] Đang băm nhỏ file PDF gốc: ${pdfFile.originalname}...`);
                
                const pdfBytes = fs.readFileSync(pdfFile.path);
                const pdfDoc = await PDFDocument.load(pdfBytes);
                const totalPages = pdfDoc.getPageCount();
                const pagesPerChunk = 3; 

                for (let j = 0; j < totalPages; j += pagesPerChunk) {
                    const endIndex = Math.min(j + pagesPerChunk, totalPages);
                    console.log(`\n[Worker] Đang xử lý mảnh từ trang ${j + 1} đến ${endIndex}...`);

                    const subDocument = await PDFDocument.create();
                    const indices = Array.from({length: endIndex - j}, (_, index) => j + index);
                    const copiedPages = await subDocument.copyPages(pdfDoc, indices);
                    copiedPages.forEach((page) => subDocument.addPage(page));
                    const subPdfBytes = await subDocument.save();

                    const tempPdfPath = path.join(process.cwd(), `uploads/temp_${Date.now()}_${j}.pdf`);
                    fs.writeFileSync(tempPdfPath, subPdfBytes);

                    const MAX_RETRIES = 3;
                    let attempt = 0;
                    let chunkSuccess = false;

                    while (attempt < MAX_RETRIES && !chunkSuccess) {
                        attempt++;
                        let uploadResponse;
                        try {
                            if (attempt > 1) {
                                console.log(`[Worker] 🔄 Đang xử lý LẠI mảnh trang ${j + 1}-${endIndex} (Lần thử ${attempt}/${MAX_RETRIES})...`);
                            }

                            uploadResponse = await fileManager.uploadFile(tempPdfPath, {
                                mimeType: "application/pdf",
                                displayName: `Mảnh trang ${j + 1} đến ${endIndex}`,
                            });
                            
                            const model = genAI.getGenerativeModel({ 
                                model: "gemini-2.5-flash",
                                generationConfig: { responseMimeType: "application/json" }
                            });

                            // THAY ĐỔI 2: CẤM AI ĐỌC CHỮ PASSAGETEXT ĐỂ CHẠY NHANH HƠN VÀ KHÔNG LÀM HỎNG ĐỊNH DẠNG
                            const PROMPT_TOEIC = `Bạn là chuyên gia TOEIC. Hãy bóc tách các câu hỏi trắc nghiệm từ đoạn văn bản sau.
                            LƯU Ý QUAN TRỌNG:
                            - Bỏ qua Part 1 và Part 2. Chỉ tập trung Part 3, 4, 5, 6, 7.
                            - Lấy CHUẨN XÁC số thứ tự câu hỏi (QuestionNo).
                            - ĐỐI VỚI PART 6 VÀ PART 7: TUYỆT ĐỐI KHÔNG CẦN đọc và trích xuất đoạn văn (PassageText). Hãy để "PassageText": "" cho tất cả các câu hỏi. Chỉ cần lấy nội dung câu hỏi và đáp án A, B, C, D.
                            - Bắt buộc trả về đúng định dạng JSON object duy nhất có key 'questions':
                            { "questions": [ { "Part": int, "QuestionNo": int, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "CorrectAnswer": "", "PassageText": "" } ] }`;

                            const result = await model.generateContent([
                                { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                                { text: PROMPT_TOEIC },
                            ]);

                            let rawText = result.response.text();
                            
                            const firstBrace = rawText.indexOf('{');
                            const lastBrace = rawText.lastIndexOf('}');

                            if (firstBrace !== -1 && lastBrace !== -1) {
                                const cleanJson = rawText.substring(firstBrace, lastBrace + 1);
                                const parsedData = JSON.parse(cleanJson);

                                if (parsedData.questions && parsedData.questions.length > 0) {
                                    // THAY ĐỔI 3: Map mảng ảnh đã scan vào đúng câu hỏi của Part 6 và 7
                                    const processedQuestions = parsedData.questions.map(q => {
                                        let pImages = [];
                                        
                                        // Tìm xem câu hỏi này (ví dụ 147) có nằm trong nhóm ảnh nào không (ví dụ part7_147_148)
                                        for (const taskId in taskImageMap) {
                                            if (taskId.startsWith('part6_') || taskId.startsWith('part7_')) {
                                                const parts = taskId.split('_'); 
                                                const start = parseInt(parts[1], 10);
                                                const end = parseInt(parts[2], 10);
                                                if (q.QuestionNo >= start && q.QuestionNo <= end) {
                                                    pImages = taskImageMap[taskId];
                                                    break; // Tìm thấy thì dừng vòng lặp
                                                }
                                            }
                                        }

                                        return {
                                            ...q,
                                            AudioUrl: audioUrlMap[q.QuestionNo] || "",
                                            PassageImages: pImages // Gắn mảng ảnh vào trường dữ liệu mới
                                        };
                                    });

                                    finalQuestionsArray = [...finalQuestionsArray, ...processedQuestions];
                                    console.log(`[Worker] [V] Quét xong mảnh này. Lấy được ${processedQuestions.length} câu hỏi.`);
                                    chunkSuccess = true; 
                                } else {
                                    throw new Error("AI không tìm thấy câu hỏi nào trong mảnh này.");
                                }
                            } else {
                                throw new Error("AI không trả về chuẩn cấu trúc JSON.");
                            }

                        } catch (error) {
                            console.error(`[Worker] [!] Lỗi ở mảnh từ trang ${j + 1} (Thử lần ${attempt}):`, error.message);
                            if (attempt < MAX_RETRIES) {
                                console.log(`[Worker] ⏳ Đang ngủ 60 giây để hồi phục trước khi làm lại...`);
                                await sleep(60000);
                            } else {
                                console.error(`[Worker] ❌ BỎ QUA mảnh trang ${j + 1}-${endIndex} sau ${MAX_RETRIES} lần thất bại liên tiếp.`);
                            }
                        } finally {
                            if (uploadResponse) {
                                try { await fileManager.deleteFile(uploadResponse.file.name); } catch(e){}
                            }
                        }
                    } 

                    try { fs.unlinkSync(tempPdfPath); } catch(e){}

                    if (j + pagesPerChunk < totalPages || i < pdfFiles.length - 1) {
                         console.log(`[Worker] ⏳ Đang ngủ 60 giây để chờ Google hồi phục Token cho mảnh TIẾP THEO...`);
                         await sleep(60000);
                    }
                }
                try { fs.unlinkSync(pdfFile.path); } catch(e){}
            }
        }

        console.log(`\n[Worker] 🎉 HOÀN TẤT BÓC TÁCH ĐỀ THI: ${examName}! Tổng số câu: ${finalQuestionsArray.length}`);
        
        if (finalQuestionsArray.length > 0) {
            const newExam = new Exam({ name: examName, duration: duration, questions: finalQuestionsArray });
            await newExam.save();
            console.log(`[Worker] 💾 ĐÃ LƯU THÀNH CÔNG ĐỀ THI VÀO DATABASE!`);
        }

    } catch (error) {
        console.error(`[Worker] ❌ Lỗi xử lý ngầm:`, error.message);
    }
}

// ==========================================
// API NHẬN FILE TỪ GIAO DIỆN
// ==========================================
app.post('/api/upload-exam', upload.any(), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) return res.status(400).json({ message: 'Thiếu file!' });

        const examName = req.body.name || "Đề thi TOEIC Mới";
        const duration = req.body.duration || 120;
        const selectedParts = JSON.parse(req.body.parts || "[]");

        const pdfFiles = files.filter(f => f.mimetype === 'application/pdf');
        const zipFile = files.find(f => f.originalname.toLowerCase().endsWith('.zip'));
        
        // THAY ĐỔI 4: Bắt lấy TOÀN BỘ các file ảnh (cropFiles) thay vì chỉ part1Images
        const cropFiles = files.filter(f => f.mimetype.startsWith('image/'));

        res.json({ message: "Đã tiếp nhận file! Hệ thống đang tự động bóc tách ngầm..." });

        processExamInBackground(pdfFiles, examName, duration, selectedParts, cropFiles, zipFile ? zipFile.path : null);

    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ' });
    }
});

// API LẤY DANH SÁCH ĐỀ THI
app.get('/api/exams', async (req, res) => {
    try {
        const exams = await Exam.find().sort({ createdAt: -1 });
        res.json(exams);
    } catch (error) {
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// API XÓA ĐỀ THI TRONG MONGODB
app.delete('/api/exams/:id', async (req, res) => {
    try {
        await Exam.findByIdAndDelete(req.params.id);
        res.json({ message: "Đã xóa đề thi thành công!" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi xóa đề thi" });
    }
});

// API SỬA TÊN VÀ THỜI GIAN ĐỀ THI TRONG MONGODB
app.put('/api/exams/:id', async (req, res) => {
    try {
        const { name, duration } = req.body;
        await Exam.findByIdAndUpdate(req.params.id, { name, duration });
        res.json({ message: "Đã cập nhật đề thi thành công!" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi khi cập nhật đề thi" });
    }
});

// ==========================================
// API QUẢN LÝ NGƯỜI DÙNG & XÁC THỰC
// ==========================================

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email này đã được sử dụng!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role: role || 'user'
        });
        await newUser.save();

        res.status(201).json({ message: "Đăng ký tài khoản thành công!" });
    } catch (error) {
        console.error("Lỗi đăng ký:", error);
        res.status(500).json({ message: "Lỗi hệ thống khi đăng ký." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy tài khoản với email này!" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Mật khẩu không chính xác!" });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '1d' } 
        );

        res.status(200).json({
            message: "Đăng nhập thành công!",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error("Lỗi đăng nhập:", error);
        res.status(500).json({ message: "Lỗi hệ thống khi đăng nhập." });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json(users);
    } catch (error) {
        console.error("Lỗi lấy danh sách user:", error);
        res.status(500).json({ message: "Lỗi khi lấy danh sách người dùng." });
    }
});

app.listen(PORT, () => console.log(`🚀 Backend Tự động Cắt PDF + Ngủ Đông chạy tại http://localhost:${PORT}`));