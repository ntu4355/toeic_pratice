import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./TakingExam.css";

const TakingExam = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const examId = location.state?.examId; 
  
  // Lấy danh sách Part đã chọn từ Exam.jsx
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
        
        // Lọc câu hỏi theo Part được chọn
        if (selectedParts && selectedParts.length > 0) {
          finalQuestions = finalQuestions.filter(q => 
            selectedParts.map(Number).includes(Number(q.Part))
          );
        }

        if (finalQuestions.length === 0) {
          alert("Không có câu hỏi nào thuộc các Part bạn vừa chọn.");
          navigate("/exam");
          return;
        }
        
        setQuestions(finalQuestions);
      } else {
        alert("Đề thi này chưa có dữ liệu câu hỏi!");
      }
    }
  }, [examId, navigate]); 

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
      alert("Nộp bài thành công! Phần chấm điểm sẽ được cập nhật sau.");
      navigate("/exam"); 
    }
  };

  const scrollToQuestion = (questionNo) => {
    const element = document.getElementById(`question-${questionNo}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Gom nhóm câu hỏi cho Sidebar bên phải
  const groupedQuestions = questions.reduce((acc, curr) => {
    if (!acc[curr.Part]) acc[curr.Part] = [];
    acc[curr.Part].push(curr);
    return acc;
  }, {});

  if (!examInfo || questions.length === 0) {
    return <div style={{textAlign: "center", padding: "50px"}}>Đang tải dữ liệu bài thi...</div>;
  }

  return (
    <div className="taking-exam">
      {/* CỘT TRÁI: Nội dung bài thi */}
      <div className="exam-content">
        <h2 style={{color: "#0f2f6d", marginBottom: "20px"}}>{examInfo.name}</h2>

        <div className="questions-list">
          {questions.map((q) => (
            <div key={q.QuestionNo} id={`question-${q.QuestionNo}`} className="question-block">
              <div className="question-text">
                <span style={{fontWeight: "bold", marginRight: "8px"}}>{q.QuestionNo}.</span> 
                {q.QuestionText}
              </div>
              
              {/* --- AUDIO PLAYER (Chỉ hiển thị ở câu đầu tiên của nhóm Audio) --- */}
              {q.AudioUrl && (
                <div className="question-audio" style={{ margin: "15px 0", width: "100%" }}>
                  <audio controls style={{ width: "100%", height: "45px", outline: "none" }}>
                    <source src={q.AudioUrl} type="audio/mpeg" />
                    Trình duyệt của bạn không hỗ trợ thẻ audio.
                  </audio>
                </div>
              )}

              {/* --- HIỂN THỊ HÌNH ẢNH PART 1 --- */}
              {q.ImageUrl && (
                <div className="question-image" style={{ margin: "15px 0", textAlign: "center" }}>
                  <img 
                    src={q.ImageUrl} 
                    alt={`Hình ảnh câu ${q.QuestionNo}`} 
                    style={{ maxWidth: "100%", maxHeight: "350px", objectFit: "contain", borderRadius: "6px", border: "1px solid #e2e8f0" }} 
                  />
                </div>
              )}

              {/* --- ĐÁP ÁN --- */}
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

      {/* CỘT PHẢI: Bảng điều hướng câu hỏi */}
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
                       title={answers[q.QuestionNo] ? `Đã chọn: ${answers[q.QuestionNo]}` : "Chưa làm"}
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