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

  // Kéo dữ liệu đề thi từ MONGODB (BACKEND) khi mở trang
  useEffect(() => {
    if (!examId) {
      alert("Không tìm thấy thông tin đề thi!");
      navigate("/exam");
      return;
    }

    const fetchExamData = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/exams");
        const data = await response.json();
        
        // Tìm đề thi có _id (trong MongoDB) khớp với examId
        const currentExam = data.find(e => e._id === examId);

        if (currentExam) {
          setExamInfo(currentExam);
          // Gán thời gian làm bài (phút -> giây), mặc định 120 phút nếu không có
          setTimeLeft((currentExam.duration || 120) * 60);
          
          // Lấy danh sách câu hỏi AI đã bóc tách
          if (currentExam.questions && currentExam.questions.length > 0) {
            setQuestions(currentExam.questions);
          } else {
            alert("Đề thi này chưa có dữ liệu câu hỏi!");
          }
        } else {
          alert("Không tìm thấy đề thi trong Database!");
          navigate("/exam");
        }
      } catch (error) {
        console.error("Lỗi khi kết nối Backend:", error);
      }
    };

    fetchExamData();
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
      console.log("Đáp án học viên chọn:", answers);
      alert("Nộp bài thành công! Chúng ta sẽ làm phần chấm điểm sau.");
      navigate("/exam");
    }
  };

  // Hàm click để cuộn đến câu hỏi
  const scrollToQuestion = (qId) => {
    const element = document.getElementById(`question-${qId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  if (!examInfo || questions.length === 0) {
    return <div style={{textAlign: "center", padding: "50px"}}>Đang tải dữ liệu bài thi...</div>;
  }

  // Phân loại câu hỏi theo Part để render
  const groupedQuestions = questions.reduce((acc, q) => {
    if (!acc[q.Part]) acc[q.Part] = [];
    acc[q.Part].push(q);
    return acc;
  }, {});

  return (
    <div className="taking-exam-container">
      {/* Cột trái: Nội dung bài thi */}
      <div className="exam-content-col">
        <div className="exam-header-sticky">
            <h2 style={{color: "#0f2f6d", margin: "0", marginBottom: "10px"}}>{examInfo.name}</h2>
            {/* Giả lập Audio Player */}
            <div className="audio-player-mock">
                <button className="play-btn">▶</button>
                <div className="progress-bar"><div className="progress"></div></div>
                <span style={{color: '#0f4bcf', fontWeight: '600'}}>00:00 / {examInfo.duration || 120}:00</span>
            </div>
        </div>
        
        <div className="questions-scroll-area">
          {Object.keys(groupedQuestions).map((part) => (
             <div key={part} className="part-section">
                <h3 style={{color: "#e53e3e", borderBottom: "2px solid #e53e3e", paddingBottom: "10px"}}>
                  Part {part}
                </h3>
                {groupedQuestions[part].map((q, index) => (
                  <div key={index} id={`question-${q.QuestionNo}`} className="question-item" style={{marginBottom: "30px", background: "#fff", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)"}}>
                    <p style={{fontSize: "16px", fontWeight: "500"}}><strong>Câu {q.QuestionNo}:</strong> {q.QuestionText}</p>
                    
                    {/* Nếu có ảnh thì hiển thị */}
                    {q.ImageUrl && (
                      <div style={{margin: "15px 0"}}>
                        <img src={q.ImageUrl} alt={`Minh họa câu ${q.QuestionNo}`} style={{maxWidth: "100%", borderRadius: "8px"}} />
                      </div>
                    )}

                    <div className="options-list" style={{display: "flex", flexDirection: "column", gap: "10px", marginTop: "15px"}}>
                       {['A', 'B', 'C', 'D'].map((opt) => (
                         q[`Option${opt}`] ? (
                            <label key={opt} className="option-label" style={{display: "flex", alignItems: "center", gap: "10px", cursor: "pointer"}}>
                                <input 
                                  type="radio" 
                                  name={`question-${q.QuestionNo}`} 
                                  checked={answers[q.QuestionNo] === opt}
                                  onChange={() => handleSelectAnswer(q.QuestionNo, opt)}
                                  style={{transform: "scale(1.2)"}}
                                />
                                <span><strong>{opt}.</strong> {q[`Option${opt}`]}</span>
                            </label>
                         ) : null
                       ))}
                    </div>
                  </div>
                ))}
             </div>
          ))}
        </div>
      </div>

      {/* Cột phải: Sidebar đếm ngược và phiếu trả lời */}
      <div className="exam-sidebar-col">
        <div className="timer-box">
            <h4 style={{textAlign: "center"}}>THỜI GIAN CÒN LẠI</h4>
            <div className="time-display" style={{fontSize: "32px", fontWeight: "bold", textAlign: "center", color: "#e53e3e", margin: "10px 0"}}>{formatTime(timeLeft)}</div>
            <button className="submit-btn" onClick={handleManualSubmit} style={{width: "100%", padding: "12px", background: "#0f4bcf", color: "#fff", border: "none", borderRadius: "8px", fontSize: "16px", cursor: "pointer"}}>Nộp bài ngay</button>
        </div>

        <div className="navigation-box" style={{marginTop: "20px", background: "#fff", padding: "15px", borderRadius: "10px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)"}}>
            <h4 style={{textAlign: "center", borderBottom: "1px solid #ddd", paddingBottom: "10px"}}>BẢNG CÂU HỎI</h4>
            <div style={{maxHeight: "500px", overflowY: "auto", paddingRight: "5px"}}>
              {Object.keys(groupedQuestions).map(part => (
                  <div key={part} className="nav-part-group" style={{marginTop: "15px"}}>
                      <h5 style={{marginBottom: "10px", color: "#555"}}>Part {part}</h5>
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
        </div>
      </div>
    </div>
  );
};

export default TakingExam;