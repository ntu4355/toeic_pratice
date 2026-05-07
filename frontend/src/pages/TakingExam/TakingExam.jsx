import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./TakingExam.css";

const TakingExam = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const examId = location.state?.examId; // Lấy ID đề thi được truyền sang
  
  const [examInfo, setExamInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [timeLeft, setTimeLeft] = useState(7200); 
  const [answers, setAnswers] = useState({});

  // Kéo dữ liệu đề thi từ localStorage khi mở trang
  useEffect(() => {
    if (!examId) {
      alert("Không tìm thấy thông tin đề thi!");
      navigate("/exam");
      return;
    }

    const storedExams = JSON.parse(localStorage.getItem("toeic_exams") || "[]");
    const currentExam = storedExams.find(e => e.id === examId);

    if (currentExam) {
      setExamInfo(currentExam);
      // Gán thời gian làm bài (phút -> giây)
      setTimeLeft(currentExam.duration * 60);
      
      // Lấy danh sách câu hỏi đã được import từ Excel (nếu có)
      if (currentExam.examData && currentExam.examData.length > 0) {
        setQuestions(currentExam.examData);
      } else {
        alert("Đề thi này chưa có file dữ liệu câu hỏi!");
      }
    }
  }, [examId, navigate]);

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

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelectAnswer = (questionNo, optionLetter) => {
    setAnswers((prev) => ({
      ...prev,
      [questionNo]: optionLetter,
    }));
  };

  const handleAutoSubmit = () => {
    alert("Hết giờ làm bài! Hệ thống đang tự động thu bài...");
    navigate("/"); 
  };

  const handleManualSubmit = () => {
    const isConfirm = window.confirm("Bạn có chắc chắn muốn nộp bài ngay bây giờ?");
    if (isConfirm) {
      // TẠM THỜI: In ra console đáp án người dùng chọn để bạn kiểm tra
      console.log("Đáp án học viên chọn:", answers);
      alert("Nộp bài thành công! Chúng ta sẽ làm phần chấm điểm sau.");
      navigate("/exam"); 
    }
  };

  if (!examInfo || questions.length === 0) {
    return <div style={{textAlign: "center", padding: "50px"}}>Đang tải dữ liệu bài thi...</div>;
  }

  return (
    <div className="taking-exam">
      {/* Cột trái: Nội dung bài thi */}
      <div className="exam-content">
        <h2 style={{color: "#0f2f6d", marginBottom: "20px"}}>{examInfo.name}</h2>
        
        {/* Giả lập Audio Player */}
        <div className="audio-player-mock">
          <button className="audio-btn">▶</button>
          <div className="audio-progress">
            <div className="audio-progress-bar"></div>
          </div>
          <span style={{color: '#0f4bcf', fontWeight: '600'}}>00:00 / {examInfo.duration}:00</span>
        </div>

        <div className="questions-list">
          {questions.map((q) => (
            <div key={q.QuestionNo} className="question-block">
              {/* Hiển thị câu hỏi */}
              <div className="question-text">
                <span style={{fontWeight: "bold", marginRight: "8px"}}>{q.QuestionNo}.</span> 
                {q.QuestionText}
              </div>
              
              {/* Hiển thị các đáp án từ Excel */}
              <div className="options-grid">
                {q.OptionA && (
                  <label className="option-label">
                    <input type="radio" name={`q-${q.QuestionNo}`} checked={answers[q.QuestionNo] === 'A'} onChange={() => handleSelectAnswer(q.QuestionNo, 'A')} />
                    <span>A. {q.OptionA}</span>
                  </label>
                )}
                {q.OptionB && (
                  <label className="option-label">
                    <input type="radio" name={`q-${q.QuestionNo}`} checked={answers[q.QuestionNo] === 'B'} onChange={() => handleSelectAnswer(q.QuestionNo, 'B')} />
                    <span>B. {q.OptionB}</span>
                  </label>
                )}
                {q.OptionC && (
                  <label className="option-label">
                    <input type="radio" name={`q-${q.QuestionNo}`} checked={answers[q.QuestionNo] === 'C'} onChange={() => handleSelectAnswer(q.QuestionNo, 'C')} />
                    <span>C. {q.OptionC}</span>
                  </label>
                )}
                {q.OptionD && (
                  <label className="option-label">
                    <input type="radio" name={`q-${q.QuestionNo}`} checked={answers[q.QuestionNo] === 'D'} onChange={() => handleSelectAnswer(q.QuestionNo, 'D')} />
                    <span>D. {q.OptionD}</span>
                  </label>
                )}
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
            {questions.map((q) => (
              <div key={q.QuestionNo} className="sheet-item">
                <span className="sheet-number">{q.QuestionNo}.</span>
                {["A", "B", "C", "D"].map((letter) => {
                  // Ẩn bong bóng D nếu câu đó không có OptionD (như Part 2)
                  if (letter === "D" && !q.OptionD) return null;
                  
                  return (
                    <div 
                      key={letter}
                      onClick={() => handleSelectAnswer(q.QuestionNo, letter)}
                      className={`sheet-bubble ${answers[q.QuestionNo] === letter ? 'selected' : ''}`}
                    >
                      {letter}
                    </div>
                  )
                })}
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