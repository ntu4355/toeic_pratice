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
    email: { type: String, required: true, unique: true }, // Email không được trùng lặp
    password: { type: String, required: true },
    role: { type: String, default: 'user' } // Mặc định là 'user', Admin sẽ có role 'admin'
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
async function processExamInBackground(pdfFiles, examName, duration, partsArray, part1ImagesData, zipFilePath) {
    try {
        console.log(`\n[Worker] Bắt đầu xử lý ngầm đề thi: ${examName}`);
        let finalQuestionsArray = [];
        let audioUrlMap = {}; 

        /// ----------------------------------------------------
        // 0. XỬ LÝ FILE ZIP AUDIO (Tự động tìm sâu trong folder)
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
                    const baseName = fileName.split('.')[0]; // Ví dụ: E26-T01-32-34
                    
                    // DÙNG REGEX THÔNG MINH HƠN: Bắt đoạn số ở cuối cùng
                    const match = baseName.match(/(?:^|-)(\d+)(?:-(\d+))?$/); 

                    if (match) {
                        let start = parseInt(match[1], 10);
                        let end = match[2] ? parseInt(match[2], 10) : start;

                        // 🛡️ BỘ LỌC AN TOÀN CHỐNG NHẦM LẪN:
                        // Cụm TOEIC tối đa 3-4 câu. Nếu khoảng cách > 5, chắc chắn là bắt nhầm mã đề.
                        if (end - start > 5) {
                            start = end; // Ép trở lại thành 1 câu duy nhất là câu cuối cùng
                        }

                        // Gắn link Audio cho các câu từ start đến end
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
        // 1. TỰ ĐỘNG SINH CÂU HỎI PART 1 VÀ TẢI ẢNH LÊN CLOUDINARY
        // ----------------------------------------------------
        if (partsArray.includes(1)) {
            console.log(`[Worker] Đang đẩy ảnh Part 1 lên Cloudinary...`);
            for (let i = 1; i <= 6; i++) {
                let imageUrl = "";
                const imgData = part1ImagesData.find(img => img.fieldname === `part1_image_${i}`);
                if (imgData) {
                    try {
                        const result = await cloudinary.uploader.upload(imgData.path, { folder: "toeic_part1" });
                        imageUrl = result.secure_url;
                        fs.unlinkSync(imgData.path); 
                    } catch (e) {}
                }
                finalQuestionsArray.push({
                    Part: 1, QuestionNo: i, QuestionText: "(Nghe Audio và chọn đáp án mô tả đúng nhất bức tranh)",
                    OptionA: "A", OptionB: "B", OptionC: "C", OptionD: "D", CorrectAnswer: "", ImageUrl: imageUrl,
                    AudioUrl: audioUrlMap[i] || "" 
                });
            }
        }

        // ----------------------------------------------------
        // 2. TỰ ĐỘNG SINH CÂU HỎI RỖNG PART 2 (CHỈ A, B, C)
        // ----------------------------------------------------
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
                const pagesPerChunk = 3; // CỨ ĐÚNG 3 TRANG CẮT 1 NHÁT

                for (let j = 0; j < totalPages; j += pagesPerChunk) {
                    const endIndex = Math.min(j + pagesPerChunk, totalPages);
                    console.log(`\n[Worker] Đang xử lý mảnh từ trang ${j + 1} đến ${endIndex}...`);

                    // 3.1. Tạo mảnh PDF nhỏ
                    const subDocument = await PDFDocument.create();
                    const indices = Array.from({length: endIndex - j}, (_, index) => j + index);
                    const copiedPages = await subDocument.copyPages(pdfDoc, indices);
                    copiedPages.forEach((page) => subDocument.addPage(page));
                    const subPdfBytes = await subDocument.save();

                    const tempPdfPath = path.join(process.cwd(), `uploads/temp_${Date.now()}_${j}.pdf`);
                    fs.writeFileSync(tempPdfPath, subPdfBytes);

                    // ========================================================
                    // BỘ ĐẾM RETRY: TỰ ĐỘNG THỬ LẠI TỐI ĐA 3 LẦN NẾU LỖI
                    // ========================================================
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

                            // 3.2. Gửi mảnh nhỏ cho Gemini
                            uploadResponse = await fileManager.uploadFile(tempPdfPath, {
                                mimeType: "application/pdf",
                                displayName: `Mảnh trang ${j + 1} đến ${endIndex}`,
                            });
                            
                            // Sử dụng Gemini 2.5 và ép kiểu JSON
                            const model = genAI.getGenerativeModel({ 
                                model: "gemini-2.5-flash",
                                generationConfig: { responseMimeType: "application/json" }
                            });

                            const PROMPT_TOEIC = `Bạn là chuyên gia TOEIC. Hãy bóc tách các câu hỏi trắc nghiệm từ đoạn văn bản sau.
                            LƯU Ý QUAN TRỌNG:
                            - Bỏ qua Part 1 và Part 2. Chỉ tập trung Part 3, 4, 5, 6, 7.
                            - Lấy CHUẨN XÁC số thứ tự câu hỏi (QuestionNo).
                            - ĐỐI VỚI PART 6 VÀ PART 7: BẮT BUỘC phải đọc và trích xuất TOÀN BỘ nội dung của đoạn văn/bài đọc (tờ rơi, email, bài báo...) và đưa vào trường "PassageText" cho TẤT CẢ các câu hỏi thuộc đoạn văn đó.
                            - Đối với các câu không có đoạn văn chung (như Part 5), để "PassageText": "".
                            - Bắt buộc trả về đúng định dạng JSON object duy nhất có key 'questions':
                            { "questions": [ { "Part": int, "QuestionNo": int, "QuestionText": string, "OptionA": string, "OptionB": string, "OptionC": string, "OptionD": string, "CorrectAnswer": "", "PassageText": string } ] }`;

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
                                    const processedQuestions = parsedData.questions.map(q => ({
                                        ...q,
                                        AudioUrl: audioUrlMap[q.QuestionNo] || ""
                                    }));
                                    finalQuestionsArray = [...finalQuestionsArray, ...processedQuestions];
                                    console.log(`[Worker] [V] Quét xong mảnh này. Lấy được ${processedQuestions.length} câu hỏi.`);
                                    chunkSuccess = true; // Thành công => Thoát vòng lặp while
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
                            // Dọn dẹp file trên Google File Manager sau mỗi lần thử
                            if (uploadResponse) {
                                try { await fileManager.deleteFile(uploadResponse.file.name); } catch(e){}
                            }
                        }
                    } 
                    // ========================================================
                    // KẾT THÚC VÒNG LẶP RETRY
                    // ========================================================

                    try { fs.unlinkSync(tempPdfPath); } catch(e){}

                    // 3.3. Nếu chưa phải mảnh cuối cùng, ngủ 60s chờ hồi token cho MẢNH TIẾP THEO
                    if (j + pagesPerChunk < totalPages || i < pdfFiles.length - 1) {
                         console.log(`[Worker] ⏳ Đang ngủ 60 giây để chờ Google hồi phục Token cho mảnh TIẾP THEO...`);
                         await sleep(60000);
                    }
                }
                // Xóa PDF gốc
                try { fs.unlinkSync(pdfFile.path); } catch(e){}
            }
        }

        console.log(`\n[Worker] 🎉 HOÀN TẤT BÓC TÁCH ĐỀ THI: ${examName}! Tổng số câu: ${finalQuestionsArray.length}`);
        
        // 4. LƯU VÀO DATABASE
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
        const part1ImagesData = files.filter(f => f.fieldname.startsWith('part1_image_'));

        res.json({ message: "Đã tiếp nhận file! Hệ thống đang tự động bóc tách ngầm..." });

        processExamInBackground(pdfFiles, examName, duration, selectedParts, part1ImagesData, zipFile ? zipFile.path : null);

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

// 1. API Đăng ký tài khoản (Register)
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // Kiểm tra xem email đã tồn tại trong Két sắt chưa
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email này đã được sử dụng!" });
        }

        // Băm (Mã hóa) mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Lưu User mới vào Database
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

// 2. API Đăng nhập (Login)
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Tìm user theo email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy tài khoản với email này!" });
        }

        // So sánh mật khẩu người dùng nhập với mật khẩu đã mã hóa trong Két sắt
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Mật khẩu không chính xác!" });
        }

        // Cấp thẻ JWT (Token) có thời hạn 1 ngày
        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '1d' } 
        );

        // Trả về thông tin (tuyệt đối không trả về password) và thẻ Token
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

// 3. API Lấy danh sách người dùng (Dành riêng cho tab Admin Dashboard)
app.get('/api/users', async (req, res) => {
    try {
        // Lấy tất cả user nhưng giấu đi trường password (-password) để bảo mật
        const users = await User.find().select('-password');
        res.status(200).json(users);
    } catch (error) {
        console.error("Lỗi lấy danh sách user:", error);
        res.status(500).json({ message: "Lỗi khi lấy danh sách người dùng." });
    }
});

// ==========================================

app.listen(PORT, () => console.log(`🚀 Backend Tự động Cắt PDF + Ngủ Đông chạy tại http://localhost:${PORT}`));