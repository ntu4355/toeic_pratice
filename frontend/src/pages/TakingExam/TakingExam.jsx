import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./TakingExam.css";

// Dữ liệu câu hỏi mẫu
const mockQuestions = [
  {
    id: 1,
    text: "1. What is the main purpose of the announcement?",
    options: ["A. To advertise a new product", "B. To announce a staff change", "C. To schedule a meeting", "D. To request a repair"],
  },
  {
    id: 2,
    text: "2. When will the event take place?",
    options: ["A. On Monday", "B. On Tuesday", "C. On Wednesday", "D. On Friday"],
  },
  {
    id: 3,
    text: "3. Who is Mr. Smith?",
    options: ["A. The new CEO", "B. A client", "C. The building manager", "D. A job applicant"],
  }
];

const TakingExam = () => {
  const navigate = useNavigate();
  // Khởi tạo thời gian 120 phút (7200 giây)
  const [timeLeft, setTimeLeft] = useState(7200); 
  const [answers, setAnswers] = useState({});

  // Logic đồng hồ đếm ngược
  useEffect(() => {
    if (timeLeft <= 0) {
      handleAutoSubmit();
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Format giây thành mm:ss
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelectAnswer = (questionId, optionLetter) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionLetter,
    }));
  };

  const handleAutoSubmit = () => {
    alert("Hết giờ làm bài! Hệ thống đang tự động thu bài...");
    navigate("/"); // Tạm thời điều hướng về trang chủ
  };

  const handleManualSubmit = () => {
    const isConfirm = window.confirm("Bạn có chắc chắn muốn nộp bài ngay bây giờ?");
    if (isConfirm) {
      alert("Nộp bài thành công! Chúng ta sẽ làm phần chấm điểm sau.");
      navigate("/"); 
    }
  };

  return (
    <div className="taking-exam">
      {/* Cột trái: Nội dung bài thi */}
      <div className="exam-content">
        <div className="audio-player-mock">
          <button className="audio-btn">▶</button>
          <div className="audio-progress">
            <div className="audio-progress-bar"></div>
          </div>
          <span style={{color: '#0f4bcf', fontWeight: '600'}}>01:24 / 45:00</span>
        </div>

        <div className="questions-list">
          {mockQuestions.map((q) => (
            <div key={q.id} className="question-block">
              <div className="question-text">{q.text}</div>
              <div className="options-grid">
                {q.options.map((opt) => {
                  const letter = opt.charAt(0); // Lấy chữ cái A, B, C, D
                  return (
                    <label key={opt} className="option-label">
                      <input 
                        type="radio" 
                        name={`q-${q.id}`} 
                        checked={answers[q.id] === letter}
                        onChange={() => handleSelectAnswer(q.id, letter)}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cột phải: Sidebar đếm ngược và phiếu trả lời */}
      <div className="exam-sidebar">
        <div className="timer-card">
          <h3>THỜI GIAN CÒN LẠI</h3>
          <div className="time-display">{formatTime(timeLeft)}</div>
        </div>

        <div className="answer-sheet">
          <h3>Phiếu trả lời</h3>
          <div className="sheet-grid">
            {mockQuestions.map((q) => (
              <div key={q.id} className="sheet-item">
                <span className="sheet-number">{q.id}.</span>
                {["A", "B", "C", "D"].map((letter) => (
                  <div 
                    key={letter}
                    onClick={() => handleSelectAnswer(q.id, letter)}
                    className={`sheet-bubble ${answers[q.id] === letter ? 'selected' : ''}`}
                  >
                    {letter}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <button className="submit-exam-btn" onClick={handleManualSubmit}>
          Nộp bài ngay
        </button>
      </div>
    </div>
  );
};

export default TakingExam;