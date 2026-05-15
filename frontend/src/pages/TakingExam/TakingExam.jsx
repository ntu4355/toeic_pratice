import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./TakingExam.css";

// LUẬT THÉP: Cấu hình cứng số lượng câu hỏi chuẩn xác của TOEIC
const partsConfig = [
  { id: 1, title: "Part 1", start: 1, end: 6 },
  { id: 2, title: "Part 2", start: 7, end: 31 },
  { id: 3, title: "Part 3", start: 32, end: 70 },
  { id: 4, title: "Part 4", start: 71, end: 100 },
  { id: 5, title: "Part 5", start: 101, end: 130 },
  { id: 6, title: "Part 6", start: 131, end: 146 },
  { id: 7, title: "Part 7", start: 147, end: 200 },
];

const TakingExam = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const examId = location.state?.examId;
  const selectedParts = location.state?.selectedParts || []; 

  const [examInfo, setExamInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [timeLeft, setTimeLeft] = useState(7200);
  const [answers, setAnswers] = useState({});
  const [activePartId, setActivePartId] = useState(null);

  useEffect(() => {
    if (!examId) {
      alert("Không tìm thấy thông tin đề thi!");
      navigate("/exam");
      return;
    }

    fetch("http://localhost:5000/api/exams")
      .then((res) => res.json())
      .then((data) => {
        const currentExam = data.find((e) => String(e._id) === String(examId) || String(e.id) === String(examId));
        
        if (currentExam) {
          setExamInfo(currentExam);
          setTimeLeft(currentExam.duration ? currentExam.duration * 60 : 7200);
          
          let examQuestions = currentExam.questions || [];
          
          if (selectedParts && selectedParts.length > 0) {
             examQuestions = examQuestions.filter(q => {
               const matchedPart = partsConfig.find(p => q.QuestionNo >= p.start && q.QuestionNo <= p.end);
               return matchedPart && selectedParts.includes(matchedPart.id);
             });
          }

          examQuestions.sort((a, b) => a.QuestionNo - b.QuestionNo);

          if (examQuestions.length > 0) {
            setQuestions(examQuestions);
            const firstAvailablePart = partsConfig.find(p => 
              (selectedParts.length === 0 || selectedParts.includes(p.id)) &&
              examQuestions.some(q => q.QuestionNo >= p.start && q.QuestionNo <= p.end)
            );
            if (firstAvailablePart) {
              setActivePartId(firstAvailablePart.id);
            }
          } else {
            alert("Đề thi này chưa có dữ liệu câu hỏi cho các Part đã chọn!");
          }
        }
      })
      .catch((err) => console.error("Lỗi khi tải đề thi:", err));
  }, [examId, navigate, selectedParts]);

  useEffect(() => {
    if (timeLeft <= 0) {
      handleAutoSubmit();
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
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
    if (window.confirm("Bạn có chắc chắn muốn nộp bài ngay bây giờ?")) {
      alert("Nộp bài thành công! Chúng ta sẽ làm phần chấm điểm sau.");
      navigate("/exam");
    }
  };

  const handleSidebarClick = (questionNo, targetPartId) => {
    if (activePartId !== targetPartId) {
      setActivePartId(targetPartId);
      setTimeout(() => {
        const element = document.getElementById(`question-${questionNo}`);
        if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    } else {
      const element = document.getElementById(`question-${questionNo}`);
      if (element) element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  if (!examInfo || questions.length === 0 || !activePartId) {
    return <div style={{ textAlign: "center", padding: "50px" }}>Đang tải dữ liệu bài thi...</div>;
  }

  const availableParts = partsConfig.filter(p => 
    (selectedParts.length === 0 || selectedParts.includes(p.id)) &&
    questions.some(q => q.QuestionNo >= p.start && q.QuestionNo <= p.end)
  );

  const currentPartConfig = partsConfig.find(p => p.id === activePartId);
  const displayedQuestions = questions.filter(q => q.QuestionNo >= currentPartConfig.start && q.QuestionNo <= currentPartConfig.end);

  const currentPartIndex = availableParts.findIndex(p => p.id === activePartId);
  const prevPart = currentPartIndex > 0 ? availableParts[currentPartIndex - 1] : null;
  const nextPart = currentPartIndex < availableParts.length - 1 ? availableParts[currentPartIndex + 1] : null;

  // THUẬT TOÁN GỘP NHÓM CÂU HỎI THEO BÀI ĐỌC (PASSAGE)
  const passageGroups = [];
  let currentPassage = null;
  let currentGroup = [];

  displayedQuestions.forEach(q => {
    const qPassage = q.PassageText || "";
    if (qPassage !== currentPassage) {
      if (currentGroup.length > 0) {
        passageGroups.push({ passage: currentPassage, questions: currentGroup });
      }
      currentPassage = qPassage;
      currentGroup = [q];
    } else {
      currentGroup.push(q);
    }
  });
  if (currentGroup.length > 0) {
    passageGroups.push({ passage: currentPassage, questions: currentGroup });
  }

  return (
    <div className="taking-exam-container">
      
      {/* CỘT TRÁI: NỘI DUNG BÀI THI */}
      <div className="exam-content-col">
        <h2 style={{ color: "#0f2f6d", marginBottom: "15px" }}>{examInfo.name}</h2>

        {/* THANH TABS CHUYỂN PART */}
        <div className="part-tabs-container">
          {availableParts.map(part => (
            <button
              key={part.id}
              className={`part-tab-btn ${activePartId === part.id ? "active" : ""}`}
              onClick={() => setActivePartId(part.id)}
            >
              {part.title}
            </button>
          ))}
        </div>

        {/* GIAO DIỆN CHIA ĐÔI MÀN HÌNH (PART 6 & 7) */}
        {(activePartId === 6 || activePartId === 7) ? (
          <div className="part-67-wrapper">
            {passageGroups.map((group, idx) => (
              <div key={idx} className="reading-split-container" style={{ marginBottom: '50px', borderBottom: '2px dashed #ccc', paddingBottom: '30px' }}>
                
                {/* CỘT TRÁI: ĐOẠN VĂN BẢN (Do AI tự trích xuất) */}
                <div className="passage-left-col">
                   <div className="passage-title">
                     Câu hỏi {group.questions[0]?.QuestionNo} - {group.questions[group.questions.length - 1]?.QuestionNo} tham khảo đoạn văn sau:
                   </div>
                   <div className="passage-text" style={{ whiteSpace: "pre-wrap", fontSize: "15px", color: "#333", lineHeight: "1.6" }}>
                     {group.passage ? group.passage : "(Không có dữ liệu bài đọc)"}
                   </div>
                </div>

                {/* CỘT PHẢI: CÁC CÂU HỎI TRẮC NGHIỆM */}
                <div className="questions-right-col">
                  {group.questions.map((q) => (
                    <div key={q.QuestionNo} id={`question-${q.QuestionNo}`} className="question-item" style={{backgroundColor: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #eee'}}>
                      <p className="question-text" style={{fontSize: '14px', marginBottom: '10px'}}>
                        <strong>{q.QuestionNo}</strong>. {q.QuestionText}
                      </p>
                      <div className="options-group">
                        {["A", "B", "C", "D"].map((opt) => {
                          if (!q[`Option${opt}`]) return null; 
                          return (
                            <label key={opt} className={`option-label ${answers[q.QuestionNo] === opt ? 'selected' : ''}`} style={{padding: '5px'}}>
                              <input type="radio" name={`question-${q.QuestionNo}`} value={opt} checked={answers[q.QuestionNo] === opt} onChange={() => handleSelectAnswer(q.QuestionNo, opt)} />
                              <span className="option-circle" style={{width: '22px', height: '22px', fontSize: '12px'}}>{opt}</span>
                              <span className="option-text" style={{fontSize: '14px'}}>{q[`Option${opt}`]}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

        ) : (

          /* GIAO DIỆN 1 CỘT (PART 1, 2, 3, 4, 5) */
          <div className="questions-list">
            {displayedQuestions.map((q, index) => {
              const showAudioPlayer = q.AudioUrl && (index === 0 || q.AudioUrl !== displayedQuestions[index - 1].AudioUrl);

              return (
                <div key={q.QuestionNo} id={`question-${q.QuestionNo}`} className="question-item">
                  
                  {showAudioPlayer && (
                     <div className="question-audio-wrapper" style={{ marginBottom: "15px", padding: "10px", backgroundColor: "#f0f4f8", borderRadius: "8px" }}>
                         <audio controls style={{ width: "100%", height: "40px" }}>
                             <source src={q.AudioUrl} type="audio/mpeg" />
                         </audio>
                     </div>
                  )}

                  <p className="question-text">
                    <strong>Câu {q.QuestionNo}:</strong> {q.QuestionText}
                  </p>
                  
                  {q.ImageUrl && (
                    <img src={q.ImageUrl} alt={`Question ${q.QuestionNo}`} style={{maxWidth: "100%", maxHeight: "300px", marginBottom: "15px"}} />
                  )}
                  
                  <div className="options-group">
                    {["A", "B", "C", "D"].map((opt) => {
                      const optionText = q[`Option${opt}`];
                      if (!optionText) return null; 
                      
                      return (
                        <label key={opt} className={`option-label ${answers[q.QuestionNo] === opt ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={`question-${q.QuestionNo}`}
                            value={opt}
                            checked={answers[q.QuestionNo] === opt}
                            onChange={() => handleSelectAnswer(q.QuestionNo, opt)}
                          />
                          <span className="option-circle">{opt}</span>
                          <span className="option-text">{optionText}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* NÚT CHUYỂN PART */}
        <div className="part-navigation-buttons">
          {prevPart ? (
             <button className="nav-part-btn" onClick={() => { setActivePartId(prevPart.id); window.scrollTo(0, 0); }}>
               ← Quay lại {prevPart.title}
             </button>
          ) : <div></div>}
          
          {nextPart ? (
             <button className="nav-part-btn" onClick={() => { setActivePartId(nextPart.id); window.scrollTo(0, 0); }}>
               Tiếp tục {nextPart.title} →
             </button>
          ) : <div></div>}
        </div>
      </div>

      {/* CỘT PHẢI: BẢNG ĐIỀU HƯỚNG */}
      <div className="exam-sidebar-col">
        <div className="timer-box">
          <div className="timer-label">THỜI GIAN CÒN LẠI</div>
          <div className="timer-value">{formatTime(timeLeft)}</div>
        </div>

        <button className="submit-btn" onClick={handleManualSubmit}>
          Nộp bài ngay
        </button>

        <div className="question-navigation">
          <h3 style={{ textAlign: "center", marginBottom: "15px", fontSize: "16px" }}>BẢNG CÂU HỎI</h3>
          
          {availableParts.map((part) => {
            const partQuestionNumbers = [];
            for (let i = part.start; i <= part.end; i++) {
              if (questions.find(q => q.QuestionNo === i)) {
                partQuestionNumbers.push(i);
              }
            }

            return (
              <div key={part.id} className="nav-part-section">
                <div className="nav-part-title">{part.title}</div>
                <div className="question-grid">
                  {partQuestionNumbers.map((qNo) => (
                    <div
                      key={qNo}
                      className={`q-box ${answers[qNo] ? "answered" : ""}`}
                      onClick={() => handleSidebarClick(qNo, part.id)}
                    >
                      {qNo}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TakingExam;