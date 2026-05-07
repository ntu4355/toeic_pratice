import "./Exam.css";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Chỉ giữ lại cấu trúc các Part của bài thi TOEIC
const parts = [
  { id: 1, title: "Part 1", count: 6, tags: ["Tranh tả người", "Tranh tả vật"] },
  { id: 2, title: "Part 2", count: 25, tags: ["Câu hỏi WHAT", "Câu hỏi WHO"] },
  { id: 3, title: "Part 3", count: 39, tags: ["Câu hỏi về chủ đề", "Hành động tương lai"] },
  { id: 4, title: "Part 4", count: 30, tags: ["Announcement", "Talk"] },
  { id: 5, title: "Part 5", count: 30, tags: ["Từ loại", "Ngữ pháp"] },
  { id: 6, title: "Part 6", count: 16, tags: ["Hoàn thành đoạn văn", "Từ nối"] },
  { id: 7, title: "Part 7", count: 54, tags: ["Single passage", "Multiple passages"] },
];

const Exam = () => {
  const navigate = useNavigate();
  const [examsList, setExamsList] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [selectedParts, setSelectedParts] = useState(() => new Set());

  // Hook này lấy data trực tiếp từ localStorage, không còn nạp dữ liệu mẫu
  useEffect(() => {
    const storedExams = JSON.parse(localStorage.getItem("toeic_exams") || "[]");
    setExamsList(storedExams);
  }, []);

  const togglePart = (id) => {
    setSelectedParts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllParts = () => {
    setSelectedParts(new Set(parts.map((p) => p.id)));
  };

  const clearAllParts = () => setSelectedParts(new Set());

  const handleStart = () => {
    if (selectedParts.size === 0) {
      alert("Vui lòng chọn ít nhất 1 part để bắt đầu.");
      return;
    }
    // TRUYỀN ID CỦA ĐỀ THI SANG TRANG LÀM BÀI
    navigate("/taking-exam", { state: { examId: selectedExam } });
  };

  const handleBackToExams = () => {
    setSelectedExam(null);
    setSelectedParts(new Set());
  };

  return (
    <div className="exam">
      {selectedExam === null ? (
        <>
          <h1>Chọn đề thi TOEIC</h1>
          
          {examsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666', background: '#fff', borderRadius: '12px', border: '1px solid #ddd' }}>
              <p>Hiện tại hệ thống chưa có đề thi nào. Vui lòng quay lại sau!</p>
            </div>
          ) : (
            <div className="exams-grid">
              {examsList.map((exam) => (
                <div key={exam.id} className="exam-card">
                  <div className="exam-card-content">
                    <h3 className="exam-title">{exam.name}</h3>
                    <p style={{fontSize: '13px', color: '#666', marginTop: '8px'}}>Thời gian: {exam.duration} phút</p>
                  </div>
                  <button
                    className={`exam-btn ${exam.isCompleted ? "completed" : ""}`}
                    onClick={() => setSelectedExam(exam.id)}
                  >
                    {exam.isCompleted ? "Xem kết quả" : "Chi tiết"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="exam-header">
            <button className="back-btn" onClick={handleBackToExams}>
              ← Quay lại
            </button>
            <h1>Chọn phần muốn làm - {examsList.find((e) => e.id === selectedExam)?.name}</h1>
          </div>

          <div className="exam-controls">
            <div className="controls-left">
              <button className="control-btn" onClick={selectAllParts}>Chọn tất cả</button>
              <button className="control-btn" onClick={clearAllParts}>Bỏ chọn</button>
            </div>
            <div className="controls-right">
              <button className="start-btn" onClick={handleStart}>
                Bắt đầu ({selectedParts.size})
              </button>
            </div>
          </div>

          <div className="parts-list">
            {parts.map((part) => (
              <section key={part.id} className="part">
                <label className="part-left">
                  <input
                    type="checkbox"
                    checked={selectedParts.has(part.id)}
                    onChange={() => togglePart(part.id)}
                  />
                </label>
                <div className="part-main">
                  <div className="part-header">
                    <h3>{part.title} ({part.count} câu)</h3>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Exam;