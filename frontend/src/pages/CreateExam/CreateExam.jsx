import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./CreateExam.css";

const CreateExam = ({ currentUser }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    examName: "",
    duration: "120",
    description: "",
  });

  const [selectedFiles, setSelectedFiles] = useState([]); // Lưu mảng file tích lũy
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

  // --- LOGIC MỚI: CHỌN THÊM FILE TÍCH LŨY ---
  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    
    setSelectedFiles((prevFiles) => {
      // Lọc bỏ những file đã tồn tại (trùng tên) để tránh bị chọn đúp
      const existingFileNames = prevFiles.map(f => f.name);
      const uniqueNewFiles = newFiles.filter(f => !existingFileNames.includes(f.name));
      
      return [...prevFiles, ...uniqueNewFiles]; // Nối file mới vào danh sách cũ
    });

    // Reset lại value của input để nếu người dùng xóa file rồi muốn chọn lại chính file đó thì vẫn được
    e.target.value = null; 
  };

  // --- LOGIC MỚI: XÓA TỪNG FILE ---
  const handleRemoveFile = (indexToRemove) => {
    setSelectedFiles((prevFiles) => prevFiles.filter((_, index) => index !== indexToRemove));
  };

  // --- BƯỚC 1: GỬI TẤT CẢ FILE CHO BACKEND XỬ LÝ ---
  const handleAnalyzeFiles = async (e) => {
    e.preventDefault();

    if (selectedFiles.length === 0) return alert("Vui lòng chọn ít nhất 1 file PDF đề thi!");

    setIsProcessing(true); 

    const uploadData = new FormData();
    selectedFiles.forEach(file => {
      uploadData.append("files", file); 
    });

    try {
      const response = await fetch("http://localhost:5000/api/upload-exam", {
        method: "POST",
        body: uploadData,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Lỗi khi kết nối với máy chủ AI");
      
      setPendingQuestions(result.examData);

    } catch (error) {
      console.error(error);
      alert(`Có lỗi xảy ra: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- HÀM XỬ LÝ UPLOAD ẢNH CHO PART 1 (BƯỚC 2) ---
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

  // --- LƯU ĐỀ THI HOÀN CHỈNH VÀO LOCALSTORAGE ---
  const handleFinalSave = () => {
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
      configuredParts: configuredParts, 
      parts: configuredParts.length,    
      questions: totalQuestions,        
      isCompleted: false,
      created: new Date().toISOString().split("T")[0],
      fileNames: selectedFiles.map(f => f.name).join(", "),
      examData: pendingQuestions, 
    };

    const updatedExams = [newExam, ...storedExams];
    localStorage.setItem("toeic_exams", JSON.stringify(updatedExams));

    alert(`Hoàn tất!\nĐã lưu đề thi: ${formData.examName} (${totalQuestions} câu hỏi)`);
    
    // Reset form
    setFormData({ examName: "", duration: "120", description: "" });
    setSelectedFiles([]);
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
             <button type="button" className="btn-cancel" onClick={() => setPendingQuestions(null)}>Quay lại</button>
             <button type="button" className="btn-submit" onClick={handleFinalSave}>Lưu Đề Thi Chính Thức</button>
          </div>
        </div>
      </div>
    );
  }

  // GIAO DIỆN BƯỚC 1: FORM CHÍNH
  return (
    <div className="create-exam-container">
      <div className="create-header">
        <h2>Tạo Đề Thi Bằng Trí Tuệ Nhân Tạo</h2>
        <p>Hỗ trợ gộp nhiều file (VD: 1 PDF Listening, 1 PDF Reading, 1 ZIP Audio)</p>
      </div>

      <form className="create-form" onSubmit={handleAnalyzeFiles}>
        <div className="form-group">
          <label htmlFor="examName">Tên đề thi (*)</label>
          <input type="text" id="examName" name="examName" value={formData.examName} onChange={handleChange} required disabled={isProcessing} />
        </div>

        <div className="form-group">
          <label htmlFor="duration">Thời gian làm bài (Phút)</label>
          <input type="number" id="duration" name="duration" value={formData.duration} onChange={handleChange} required disabled={isProcessing} />
        </div>

        <div className="form-group">
          <label>Chọn tất cả các file liên quan (PDF Đề, ZIP Audio)</label>
          <div className="file-drop-zone" style={{ border: '2px dashed #0f2f6d', padding: '20px', textAlign: 'center', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
            
            <input 
              id="multiFilePicker"
              type="file" 
              multiple 
              onChange={handleFileChange} 
              style={{ marginBottom: '15px' }}
              disabled={isProcessing}
            />

            {/* --- GIAO DIỆN MỚI: DANH SÁCH FILE CÓ NÚT XÓA --- */}
            {selectedFiles.length > 0 && (
              <div className="file-list" style={{ textAlign: "left", marginTop: "10px", padding: "10px", backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                <strong>Đã chọn {selectedFiles.length} file:</strong>
                <ul style={{ listStyleType: "none", paddingLeft: "0", marginTop: "10px" }}>
                  {selectedFiles.map((f, i) => (
                    <li key={i} style={{ 
                      fontSize: '13px', 
                      color: '#334155', 
                      margin: "5px 0", 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center",
                      backgroundColor: "#f1f5f9",
                      padding: "8px 12px",
                      borderRadius: "4px",
                      border: "1px solid #cbd5e1"
                    }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: "10px" }}>
                        {f.name.endsWith('.pdf') ? '📄' : f.name.endsWith('.zip') ? '📦' : '📁'} {f.name}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveFile(i)}
                        title="Xóa file này"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontWeight: "bold",
                          fontSize: "16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 5px"
                        }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* ------------------------------------------------ */}
            
          </div>
          <small style={{ color: "#64748b", display: "block", marginTop: "5px" }}>
            * Mẹo: Bạn có thể chọn nhiều lần, các file mới sẽ được cộng dồn vào danh sách.
          </small>
        </div>

        <div className="form-actions">
           <button type="button" className="btn-cancel" onClick={() => navigate('/admin')} disabled={isProcessing}>Hủy bỏ</button>
           <button type="submit" className="btn-submit" disabled={isProcessing || selectedFiles.length === 0}>
             {isProcessing ? "⏳ AI đang đọc và xử lý các file..." : "Phân tích đề thi"}
           </button>
        </div>
      </form>
    </div>
  );
};

export default CreateExam;