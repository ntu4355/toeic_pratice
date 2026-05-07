import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./CreateExam.css";

// Dữ liệu chuẩn cấu trúc TOEIC
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
    difficulty: "Medium",
    description: "",
  });

  // Sử dụng Set để lưu trữ các Part được chọn
  const [selectedParts, setSelectedParts] = useState(new Set());

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
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const togglePart = (partId) => {
    setSelectedParts((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) {
        next.delete(partId);
      } else {
        next.add(partId);
      }
      return next;
    });
  };

  // Tính tổng số câu hỏi dựa trên các Part được chọn
  const totalQuestions = Array.from(selectedParts).reduce((total, partId) => {
    const part = TOEIC_PARTS.find((p) => p.id === partId);
    return total + (part ? part.count : 0);
  }, 0);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (selectedParts.size === 0) {
      alert("Vui lòng chọn ít nhất 1 Part cho đề thi này!");
      return;
    }

    const storedExams = JSON.parse(localStorage.getItem("toeic_exams") || "[]");

    const newExam = {
      id: Date.now(),
      name: formData.examName,
      duration: parseInt(formData.duration),
      views: 0,
      comments: 0,
      // Lưu trữ chi tiết các Part được cấu hình cho đề này
      configuredParts: Array.from(selectedParts).sort(), 
      parts: selectedParts.size, // Số lượng phần thi
      questions: totalQuestions, // Tổng số câu hỏi thực tế
      isCompleted: false,
      created: new Date().toISOString().split("T")[0],
    };

    const updatedExams = [newExam, ...storedExams];
    localStorage.setItem("toeic_exams", JSON.stringify(updatedExams));

    alert(`Đã tạo thành công đề thi: ${formData.examName}\nTổng số câu: ${totalQuestions}`);
    
    // Reset form
    setFormData({
      examName: "",
      duration: "120",
      difficulty: "Medium",
      description: "",
    });
    setSelectedParts(new Set());
  };

  return (
    <div className="create-exam-container">
      <div className="create-header">
        <h2>Tạo Đề Thi Mới</h2>
        <p>Thêm đề thi TOEIC mới vào hệ thống. Các trường có dấu (*) là bắt buộc.</p>
      </div>

      <form className="create-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="examName">Tên đề thi (*)</label>
          <input
            type="text"
            id="examName"
            name="examName"
            value={formData.examName}
            onChange={handleChange}
            placeholder="Ví dụ: TOEIC Practice Test 2024 - Test 1"
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="duration">Thời gian làm bài (Phút)</label>
            <input
              type="number"
              id="duration"
              name="duration"
              value={formData.duration}
              onChange={handleChange}
              min="10"
              max="180"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="difficulty">Độ khó</label>
            <select
              id="difficulty"
              name="difficulty"
              value={formData.difficulty}
              onChange={handleChange}
            >
              <option value="Easy">Dễ</option>
              <option value="Medium">Trung bình</option>
              <option value="Hard">Khó</option>
            </select>
          </div>
        </div>

        {/* Khu vực chọn Part chi tiết */}
        <div className="form-group">
          <label>Cấu trúc đề thi (Chọn các Part muốn tạo) (*)</label>
          <div className="parts-selection-container">
            {TOEIC_PARTS.map((part) => (
              <label 
                key={part.id} 
                className={`part-checkbox-label ${selectedParts.has(part.id) ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedParts.has(part.id)}
                  onChange={() => togglePart(part.id)}
                />
                <span>{part.title} ({part.count} câu)</span>
              </label>
            ))}
          </div>
          {selectedParts.size > 0 && (
            <div className="total-questions-badge">
              Tổng cộng: {totalQuestions} câu hỏi
            </div>
          )}
        </div>

        <div className="form-group">
          <label>File Audio Listening (.mp3)</label>
          <div className="upload-zone">
            <div className="upload-icon">🎧</div>
            <div className="upload-text">Kéo thả file âm thanh hoặc Click để tải lên</div>
            <div className="upload-hint">Hỗ trợ định dạng MP3, kích thước tối đa 50MB</div>
          </div>
        </div>

        <div className="form-group">
          <label>File Đề Thi / Câu Hỏi (.pdf / .xlsx)</label>
          <div className="upload-zone">
            <div className="upload-icon">📄</div>
            <div className="upload-text">Kéo thả file PDF/Excel hoặc Click để tải lên</div>
            <div className="upload-hint">Sử dụng template Excel của hệ thống để import hàng loạt</div>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="description">Mô tả thêm / Ghi chú</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows="3"
            placeholder="Nhập mô tả hoặc ghi chú nội bộ cho đề thi này..."
          ></textarea>
        </div>

        <div className="form-actions">
          <button 
            type="button" 
            className="btn-cancel" 
            onClick={() => navigate('/admin')}
          >
            Hủy bỏ
          </button>
          <button type="submit" className="btn-submit">
            Lưu Đề Thi
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateExam;