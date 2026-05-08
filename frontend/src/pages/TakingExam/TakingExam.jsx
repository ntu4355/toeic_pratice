import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./TakingExam.css";

const TakingExam = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const examId = location.state?.examId; 
  
  const selectedParts = location.state?.selectedParts || []; 
  
  const [examInfo, setExamInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [timeLeft, setTimeLeft] = useState(7200); 
  const [answers, setAnswers] = useState({});

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
      setTimeLeft(currentExam.duration * 60);
      
      if (currentExam.examData && currentExam.examData.length > 0) {
        let finalQuestions = currentExam.examData;
        
        if (selectedParts && selectedParts.length > 0) {
          finalQuestions = finalQuestions.filter(q => 
            selectedParts.map(Number).includes(Number(q.Part))
          );
        }

        if (finalQuestions.length === 0) {
          alert("Không có câu hỏi nào thuộc các Part bạn vừa chọn. Vui lòng chọn lại!");
          navigate("/exam");
          return;
        }
        
        setQuestions(finalQuestions);
      } else {
        alert("Đề thi này chưa có file dữ liệu câu hỏi!");
      }
    }
  }, [examId, navigate, selectedParts]); 

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
    setAnswers((prev) => ({ ...prev, [questionNo]: optionLetter }));
  };

  const handleAutoSubmit = () => {
    alert("Hết giờ làm bài! Hệ thống đang tự động thu bài...");
    navigate("/"); 
  };

  const handleManualSubmit = () => {
    const isConfirm = window.confirm("Bạn có chắc chắn muốn nộp bài ngay bây giờ?");
    if (isConfirm) {
      console.log("Đáp án học viên chọn:", answers);
      alert("Nộp bài thành công! Chúng ta sẽ làm phần chấm điểm sau.");
      navigate("/exam"); 
    }
  };

  const scrollToQuestion = (questionNo) => {
    const element = document.getElementById(`question-${questionNo}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const groupedQuestions = questions.reduce((acc, curr) => {
    if (!acc[curr.Part]) {
      acc[curr.Part] = [];
    }
    acc[curr.Part].push(curr);
    return acc;
  }, {});

  if (!examInfo || questions.length === 0) {
    return <div style={{textAlign: "center", padding: "50px"}}>Đang tải dữ liệu bài thi...</div>;
  }

  return (
    <div className="taking-exam">
      <div className="exam-content">
        <h2 style={{color: "#0f2f6d", marginBottom: "20px"}}>{examInfo.name}</h2>
        
        <div className="questions-list">
          {questions.map((q) => (
            <div key={q.QuestionNo} id={`question-${q.QuestionNo}`} className="question-block">
              
              {/* 1. Số thứ tự và nội dung câu hỏi */}
              <div className="question-text">
                <span style={{fontWeight: "bold", marginRight: "8px"}}>{q.QuestionNo}.</span> 
                {q.QuestionText}
              </div>
              
              {/* 2. AUDIO PLAYER */}
              {q.AudioUrl && (
                <div className="question-audio-wrapper" style={{
                  margin: "15px 0", padding: "8px 15px", backgroundColor: "#f1f5f9",
                  borderRadius: "50px", display: "flex", alignItems: "center", border: "1px solid #e2e8f0"
                }}>
                  <audio controls controlsList="nodownload" style={{ width: "100%", height: "35px", outline: "none" }}>
                    <source src={q.AudioUrl} type="audio/mpeg" />
                    Trình duyệt của bạn không hỗ trợ phát âm thanh.
                  </audio>
                </div>
              )}

              {/* 3. HÌNH ẢNH (Part 1) */}
              {q.ImageUrl && (
                <div className="question-image" style={{ margin: "15px 0", textAlign: "center" }}>
                  <img 
                    src={q.ImageUrl} alt={`Hình ảnh câu ${q.QuestionNo}`} 
                    style={{ maxWidth: "100%", maxHeight: "400px", objectFit: "contain", borderRadius: "8px", border: "1px solid #dee2e6", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }} 
                  />
                </div>
              )}

              {/* 4. ĐÁP ÁN (ĐÃ ĐƯỢC FIX ĐỂ LUÔN HIỂN THỊ) */}
              <div className="options-grid">
                <label className="option-label">
                  <input type="radio" name={`q-${q.QuestionNo}`} checked={answers[q.QuestionNo] === 'A'} onChange={() => handleSelectAnswer(q.QuestionNo, 'A')} />
                  <span>A. {q.OptionA || ""}</span>
                </label>

                <label className="option-label">
                  <input type="radio" name={`q-${q.QuestionNo}`} checked={answers[q.QuestionNo] === 'B'} onChange={() => handleSelectAnswer(q.QuestionNo, 'B')} />
                  <span>B. {q.OptionB || ""}</span>
                </label>

                <label className="option-label">
                  <input type="radio" name={`q-${q.QuestionNo}`} checked={answers[q.QuestionNo] === 'C'} onChange={() => handleSelectAnswer(q.QuestionNo, 'C')} />
                  <span>C. {q.OptionC || ""}</span>
                </label>

                {/* Part 2 TOEIC chỉ có 3 đáp án, nếu là Part 2 thì ẩn D đi */}
                {(q.OptionD || Number(q.Part) !== 2) && (
                  <label className="option-label">
                    <input type="radio" name={`q-${q.QuestionNo}`} checked={answers[q.QuestionNo] === 'D'} onChange={() => handleSelectAnswer(q.QuestionNo, 'D')} />
                    <span>D. {q.OptionD || ""}</span>
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="exam-sidebar">
        <div className="timer-card">
          <h3>THỜI GIAN CÒN LẠI</h3>
          <div className="time-display">{formatTime(timeLeft)}</div>
        </div>

        <div className="answer-sheet">
          {Object.keys(groupedQuestions).sort((a,b) => a - b).map(part => (
            <div key={part} className="part-section">
               <h3 className="part-heading">Part {part}</h3>
               <div className="question-grid">
                 {groupedQuestions[part].map(q => (
                    <div
                       key={q.QuestionNo}
                       className={`q-box ${answers[q.QuestionNo] ? 'answered' : ''}`}
                       onClick={() => scrollToQuestion(q.QuestionNo)}
                    >
                       {q.QuestionNo}
                    </div>
                 ))}
               </div>
            </div>
          ))}
        </div>

        <button className="submit-exam-btn" onClick={handleManualSubmit}>
          Nộp bài ngay
        </button>
      </div>
    </div>
  );
};

export default TakingExam;