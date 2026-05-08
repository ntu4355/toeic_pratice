import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./CreateExam.css";

const CreateExam = ({ currentUser }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    examName: "",
    duration: "120",
    description: "",
  });

  const [audioFile, setAudioFile] = useState(null); 
  const [documentFile, setDocumentFile] = useState(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingQuestions, setPendingQuestions] = useState(null); 

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="access-denied">
        <div className="denied-content">
          <h2>🔒 Truy cập bị từ chối</h2>
          <p>Chỉ admin mới có quyền tạo đề thi mới.</p>
          <button className="btn-home" onClick={() => navigate("/")}>← Về trang chủ</button>
        </div>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // --- BƯỚC 1: GỬI PDF & ZIP CHO BACKEND XỬ LÝ ---
  const handleAnalyzePDF = async (e) => {
    e.preventDefault();

    if (!documentFile) return alert("Vui lòng tải lên file PDF đề thi!");

    setIsProcessing(true); 

    const uploadData = new FormData();
    uploadData.append("examFile", documentFile);
    if (audioFile) {
      uploadData.append("audioZip", audioFile); 
    }

    try {
      const response = await fetch("http://localhost:5000/api/upload-exam", {
        method: "POST",
        body: uploadData,
      });

      if (!response.ok) throw new Error("Lỗi khi kết nối với máy chủ AI");

      const result = await response.json();
      
      // Chuyển sang giao diện thêm ảnh Part 1
      setPendingQuestions(result.examData);

    } catch (error) {
      console.error(error);
      alert("Có lỗi xảy ra trong quá trình AI phân tích. Vui lòng kiểm tra Backend.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- HÀM XỬ LÝ UPLOAD ẢNH CHO PART 1 ---
  const handleImageUpload = (questionNo, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setPendingQuestions(prev => 
        prev.map(q => q.QuestionNo === questionNo ? { ...q, ImageUrl: base64String } : q)
      );
    };
    reader.readAsDataURL(file);
  };

  // --- BƯỚC 2: LƯU ĐỀ THI HOÀN CHỈNH VÀO LOCALSTORAGE ---
  const handleFinalSave = () => {
    // Tự động phân tích các Part và đếm số câu hỏi từ dữ liệu AI trả về
    const extractedPartsSet = new Set(pendingQuestions.map(q => Number(q.Part)));
    const configuredParts = Array.from(extractedPartsSet).sort((a, b) => a - b);
    const totalQuestions = pendingQuestions.length;

    const storedExams = JSON.parse(localStorage.getItem("toeic_exams") || "[]");
    const newExam = {
      id: Date.now(),
      name: formData.examName,
      duration: parseInt(formData.duration),
      views: 0,
      comments: 0,
      configuredParts: configuredParts, // Lấy mảng Part AI tìm được
      parts: configuredParts.length,    // Tổng số Part
      questions: totalQuestions,        // Tổng số câu hỏi
      isCompleted: false,
      created: new Date().toISOString().split("T")[0],
      audioFileName: audioFile ? audioFile.name : null,
      docFileName: documentFile.name,
      examData: pendingQuestions, 
    };

    const updatedExams = [newExam, ...storedExams];
    localStorage.setItem("toeic_exams", JSON.stringify(updatedExams));

    alert(`Hoàn tất!\nĐã lưu đề thi: ${formData.examName} (${totalQuestions} câu hỏi)`);
    
    setFormData({ examName: "", duration: "120", description: "" });
    setAudioFile(null);
    setDocumentFile(null);
    setPendingQuestions(null);
  };

  // GIAO DIỆN BƯỚC 2: BỔ SUNG ẢNH PART 1
  if (pendingQuestions) {
    const part1Questions = pendingQuestions.filter(q => Number(q.Part) === 1);
    
    return (
      <div className="create-exam-container">
        <div className="create-header">
          <h2>Bước 2: Bổ sung hình ảnh cho Part 1</h2>
          <p>Vui lòng tải lên hình ảnh cho các câu hỏi Part 1 (nếu đề có Part 1).</p>
        </div>
        
        <div className="image-upload-section" style={{ backgroundColor: "#fff", padding: "20px", borderRadius: "8px", marginTop: "20px" }}>
          {part1Questions.length === 0 ? (
            <p>Đề thi này không có Part 1. Bạn có thể lưu đề thi ngay!</p>
          ) : (
            part1Questions.map(q => (
              <div key={q.QuestionNo} style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px solid #eee" }}>
                <h4>Câu {q.QuestionNo}:</h4>
                <div style={{ display: "flex", alignItems: "center", gap: "20px", marginTop: "10px" }}>
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(q.QuestionNo, e)} />
                  {q.ImageUrl && <img src={q.ImageUrl} alt={`Preview Q${q.QuestionNo}`} style={{ height: "100px", borderRadius: "4px", border: "1px solid #ccc" }} />}
                </div>
              </div>
            ))
          )}
          
          <div className="form-actions" style={{ marginTop: "30px" }}>
             <button type="button" className="btn-cancel" onClick={() => setPendingQuestions(null)}>Hủy bỏ</button>
             <button type="button" className="btn-submit" onClick={handleFinalSave}>Lưu Đề Thi Chính Thức</button>
          </div>
        </div>
      </div>
    );
  }

  // GIAO DIỆN BƯỚC 1: FORM ĐIỀN THÔNG TIN CƠ BẢN ĐÃ ĐƯỢC RÚT GỌN
  return (
    <div className="create-exam-container">
      <div className="create-header">
        <h2>Tạo Đề Thi Bằng Trí Tuệ Nhân Tạo</h2>
      </div>

      <form className="create-form" onSubmit={handleAnalyzePDF}>
        <div className="form-group">
          <label htmlFor="examName">Tên đề thi (*)</label>
          <input type="text" id="examName" name="examName" value={formData.examName} onChange={handleChange} required disabled={isProcessing} />
        </div>

        <div className="form-group">
          <label htmlFor="duration">Thời gian làm bài (Phút)</label>
          <input type="number" id="duration" name="duration" value={formData.duration} onChange={handleChange} required disabled={isProcessing} />
        </div>

        {/* ĐÃ XÓA KHỐI CHỌN PART Ở ĐÂY */}

        <div className="form-group">
          <label>File Audio Listening (.zip) (Nén các file 1.mp3, 32-34.mp3...)</label>
          <input type="file" accept=".zip" onChange={(e) => setAudioFile(e.target.files[0])} disabled={isProcessing} />
        </div>

        <div className="form-group">
          <label>File Đề Thi (.pdf) (*)</label>
          <input type="file" accept=".pdf" onChange={(e) => setDocumentFile(e.target.files[0])} required disabled={isProcessing} />
        </div>

        <div className="form-actions">
           <button type="button" className="btn-cancel" onClick={() => navigate('/admin')} disabled={isProcessing}>Hủy bỏ</button>
           <button type="submit" className="btn-submit" disabled={isProcessing}>
             {isProcessing ? "⏳ Đang phân tích PDF và ZIP..." : "Phân tích đề thi"}
           </button>
        </div>
      </form>
    </div>
  );
};

export default CreateExam;