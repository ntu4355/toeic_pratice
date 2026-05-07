import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./CreateExam.css";

const TOEIC_PARTS = [
  { id: 1, title: "Part 1: Hình ảnh", count: 6 },
  { id: 2, title: "Part 2: Hỏi & Đáp", count: 25 },
  { id: 3, title: "Part 3: Hội thoại", count: 39 },
  { id: 4, title: "Part 4: Bài nói ngắn", count: 30 },
  { id: 5, title: "Part 5: Điền vào câu", count: 30 },
  { id: 6, title: "Part 6: Điền đoạn văn", count: 16 },
  { id: 7, title: "Part 7: Đọc hiểu", count: 54 },
];

const CreateExam = ({ currentUser }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    examName: "",
    duration: "120",
    description: "",
  });

  const [selectedParts, setSelectedParts] = useState(new Set());
  const [audioFile, setAudioFile] = useState(null);
  const [documentFile, setDocumentFile] = useState(null);
  
  const [isProcessing, setIsProcessing] = useState(false);

  const audioInputRef = useRef(null);
  const documentInputRef = useRef(null);

  const [dragActiveAudio, setDragActiveAudio] = useState(false);
  const [dragActiveDoc, setDragActiveDoc] = useState(false);

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="access-denied">
        <div className="denied-content">
          <h2>🔒 Truy cập bị từ chối</h2>
          <p>Chỉ admin mới có quyền tạo đề thi mới.</p>
          <button className="btn-home" onClick={() => navigate("/")}>
            ← Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const togglePart = (partId) => {
    setSelectedParts((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  };

  const totalQuestions = Array.from(selectedParts).reduce((total, partId) => {
    const part = TOEIC_PARTS.find((p) => p.id === partId);
    return total + (part ? part.count : 0);
  }, 0);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleAudioSelect = (e) => {
    if (e.target.files && e.target.files[0]) setAudioFile(e.target.files[0]);
  };

  const handleAudioDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveAudio(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) setAudioFile(e.dataTransfer.files[0]);
  };

  const handleDocSelect = (e) => {
    if (e.target.files && e.target.files[0]) setDocumentFile(e.target.files[0]);
  };

  const handleDocDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveDoc(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) setDocumentFile(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e, setDragState) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState(true);
  };

  const handleDragLeave = (e, setDragState) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedParts.size === 0) {
      alert("Vui lòng chọn ít nhất 1 Part cho đề thi này!");
      return;
    }

    if (!documentFile) {
      alert("Vui lòng tải lên file PDF đề thi để AI có thể phân tích!");
      return;
    }

    setIsProcessing(true); 

    const uploadData = new FormData();
    uploadData.append("examFile", documentFile);

    try {
      const response = await fetch("http://localhost:5000/api/upload-exam", {
        method: "POST",
        body: uploadData,
      });

      if (!response.ok) {
        throw new Error("Lỗi khi kết nối với máy chủ AI");
      }

      const result = await response.json();
      const extractedQuestions = result.examData;

      const storedExams = JSON.parse(localStorage.getItem("toeic_exams") || "[]");
      const newExam = {
        id: Date.now(),
        name: formData.examName,
        duration: parseInt(formData.duration),
        views: 0,
        comments: 0,
        configuredParts: Array.from(selectedParts).sort(),
        parts: selectedParts.size,
        questions: totalQuestions,
        isCompleted: false,
        created: new Date().toISOString().split("T")[0],
        audioFileName: audioFile ? audioFile.name : null,
        docFileName: documentFile.name,
        examData: extractedQuestions, 
      };

      const updatedExams = [newExam, ...storedExams];
      localStorage.setItem("toeic_exams", JSON.stringify(updatedExams));

      alert(`Tuyệt vời!\nAI đã trích xuất thành công ${extractedQuestions.length} câu hỏi.\nĐã lưu đề thi: ${formData.examName}`);
      
      // Đã xóa trạng thái reset của 'difficulty'
      setFormData({ examName: "", duration: "120", description: "" });
      setSelectedParts(new Set());
      setAudioFile(null);
      setDocumentFile(null);

    } catch (error) {
      console.error(error);
      alert("Có lỗi xảy ra trong quá trình AI phân tích. Vui lòng kiểm tra lại Backend!");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="create-exam-container">
      <div className="create-header">
        <h2>Tạo Đề Thi Bằng Trí Tuệ Nhân Tạo</h2>
        <p>Tải file PDF lên và AI sẽ tự động bóc tách thành câu hỏi trắc nghiệm.</p>
      </div>

      <form className="create-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="examName">Tên đề thi (*)</label>
          <input type="text" id="examName" name="examName" value={formData.examName} onChange={handleChange} placeholder="Ví dụ: TOEIC Practice Test 2024 - Test 1" required disabled={isProcessing} />
        </div>

        {/* Ô Thời gian được mở rộng khi đã xóa bỏ Độ khó */}
        <div className="form-group">
          <label htmlFor="duration">Thời gian làm bài (Phút)</label>
          <input type="number" id="duration" name="duration" value={formData.duration} onChange={handleChange} min="10" max="180" required disabled={isProcessing} />
        </div>

        <div className="form-group">
          <label>Cấu trúc đề thi (Chọn các Part) (*)</label>
          <div className="parts-selection-container">
            {TOEIC_PARTS.map((part) => (
              <label key={part.id} className={`part-checkbox-label ${selectedParts.has(part.id) ? 'selected' : ''}`}>
                <input type="checkbox" checked={selectedParts.has(part.id)} onChange={() => togglePart(part.id)} disabled={isProcessing} />
                <span>{part.title} ({part.count} câu)</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>File Audio Listening (.mp3, .wav)</label>
          {!audioFile ? (
            <div 
              className={`upload-zone ${dragActiveAudio ? "drag-active" : ""}`}
              onClick={() => !isProcessing && audioInputRef.current.click()}
              onDragOver={(e) => handleDragOver(e, setDragActiveAudio)}
              onDragLeave={(e) => handleDragLeave(e, setDragActiveAudio)}
              onDrop={handleAudioDrop}
            >
              <div className="upload-icon">🎧</div>
              <div className="upload-text">Kéo thả file âm thanh (Dùng chung cho Part 1-4)</div>
              <input type="file" accept="audio/*" hidden ref={audioInputRef} onChange={handleAudioSelect} disabled={isProcessing} />
            </div>
          ) : (
            <div className="file-preview">
              <div className="file-info">
                <div className="file-icon">🎵</div>
                <div className="file-details">
                  <span className="file-name" title={audioFile.name}>{audioFile.name}</span>
                  <span className="file-size">{formatFileSize(audioFile.size)}</span>
                </div>
              </div>
              <button type="button" className="remove-file-btn" onClick={() => setAudioFile(null)} disabled={isProcessing}>✕</button>
            </div>
          )}
        </div>

        <div className="form-group">
          <label>File Đề Thi (.pdf) (*)</label>
          {!documentFile ? (
            <div 
              className={`upload-zone ${dragActiveDoc ? "drag-active" : ""}`}
              onClick={() => !isProcessing && documentInputRef.current.click()}
              onDragOver={(e) => handleDragOver(e, setDragActiveDoc)}
              onDragLeave={(e) => handleDragLeave(e, setDragActiveDoc)}
              onDrop={handleDocDrop}
            >
              <div className="upload-icon">📄</div>
              <div className="upload-text">Kéo thả file PDF đề thi vào đây để AI đọc</div>
              <input type="file" accept=".pdf" hidden ref={documentInputRef} onChange={handleDocSelect} disabled={isProcessing} />
            </div>
          ) : (
            <div className="file-preview">
              <div className="file-info">
                <div className="file-icon">📄</div>
                <div className="file-details">
                  <span className="file-name" title={documentFile.name}>{documentFile.name}</span>
                  <span className="file-size">{formatFileSize(documentFile.size)}</span>
                </div>
              </div>
              <button type="button" className="remove-file-btn" onClick={() => setDocumentFile(null)} disabled={isProcessing}>✕</button>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={() => navigate('/admin')} disabled={isProcessing}>Hủy bỏ</button>
          <button type="submit" className="btn-submit" disabled={isProcessing} style={{ opacity: isProcessing ? 0.7 : 1 }}>
            {isProcessing ? "⏳ Đang nhờ AI phân tích (10-30s)..." : "Lưu Đề Thi"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateExam;