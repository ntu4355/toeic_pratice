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

  // =======================================================================
  // THUẬT TOÁN MỚI: GỘP NHÓM CÂU HỎI THEO MẢNG HÌNH ẢNH (PASSAGE IMAGES)
  // =======================================================================
  const passageGroups = [];
  let currentImageKey = null;
  let currentGroup = [];

  displayedQuestions.forEach(q => {
    // Nối các link ảnh lại thành một chuỗi duy nhất để làm chìa khóa so sánh
    const qImageKey = (q.PassageImages && q.PassageImages.length > 0) 
      ? q.PassageImages.join("||") 
      : `no_img_${q.QuestionNo}`; // Nếu câu nào không có ảnh thì ép nó đứng riêng 1 mình

    if (qImageKey !== currentImageKey) {
      if (currentGroup.length > 0) {
        passageGroups.push({ 
          images: currentGroup[0].PassageImages || [], 
          questions: currentGroup 
        });
      }
      currentImageKey = qImageKey;
      currentGroup = [q];
    } else {
      currentGroup.push(q);
    }
  });

  if (currentGroup.length > 0) {
    passageGroups.push({ 
      images: currentGroup[0].PassageImages || [], 
      questions: currentGroup 
    });
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

        {/* GIAO DIỆN CHIA ĐÔI MÀN HÌNH (PART 6 & 7) - BÂY GIỜ HIỂN THỊ DẢI ẢNH */}
        {(activePartId === 6 || activePartId === 7) ? (
          <div className="part-67-wrapper">
            {passageGroups.map((group, idx) => (
              <div key={idx} className="reading-split-container" style={{ marginBottom: '50px', borderBottom: '2px dashed #ccc', paddingBottom: '30px', display: 'flex', gap: '20px' }}>
                
                {/* CỘT TRÁI: DẢI ẢNH ĐOẠN VĂN (MỚI) */}
                <div className="passage-left-col" style={{ flex: '2', minWidth: '0' }}>
                   <div className="passage-title" style={{ fontWeight: 'bold', marginBottom: '15px', color: '#1e293b' }}>
                     Câu hỏi {group.questions[0]?.QuestionNo} - {group.questions[group.questions.length - 1]?.QuestionNo} tham khảo thông tin sau:
                   </div>
                   
                   <div className="passage-images-gallery" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                     {group.images && group.images.length > 0 ? (
                       group.images.map((imgUrl, imgIdx) => (
                         <img 
                           key={imgIdx} 
                           src={imgUrl} 
                           alt={`Đoạn văn ${imgIdx + 1} cho câu ${group.questions[0]?.QuestionNo}`} 
                           style={{ 
                             width: '100%', 
                             height: 'auto', 
                             borderRadius: '8px', 
                             border: '1px solid #cbd5e1', 
                             boxShadow: '0 2px 4px rgba(0,0,0,0.05)' 
                           }} 
                         />
                       ))
                     ) : (
                       <div style={{ padding: '20px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', border: '1px dashed #fca5a5' }}>
                         (Không tìm thấy dữ liệu ảnh bài đọc cho nhóm câu hỏi này)
                       </div>
                     )}
                   </div>
                </div>

                {/* CỘT PHẢI: CÁC CÂU HỎI TRẮC NGHIỆM */}
                <div className="questions-right-col" style={{ flex: '1', minWidth: '0' }}>
                  {group.questions.map((q) => (
                    <div key={q.QuestionNo} id={`question-${q.QuestionNo}`} className="question-item" style={{backgroundColor: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #eee', marginBottom: '15px'}}>
                      <p className="question-text" style={{fontSize: '15px', marginBottom: '12px', fontWeight: '500', color: '#0f172a'}}>
                        <strong>{q.QuestionNo}</strong>. {q.QuestionText}
                      </p>
                      <div className="options-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {["A", "B", "C", "D"].map((opt) => {
                          if (!q[`Option${opt}`]) return null; 
                          return (
                            <label key={opt} className={`option-label ${answers[q.QuestionNo] === opt ? 'selected' : ''}`} style={{padding: '8px 12px', cursor: 'pointer', borderRadius: '6px', border: '1px solid transparent'}}>
                              <input type="radio" name={`question-${q.QuestionNo}`} value={opt} checked={answers[q.QuestionNo] === opt} onChange={() => handleSelectAnswer(q.QuestionNo, opt)} style={{ display: 'none' }} />
                              <span className="option-circle" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', border: '1px solid #94a3b8', marginRight: '10px', fontSize: '13px', fontWeight: 'bold' }}>{opt}</span>
                              <span className="option-text" style={{fontSize: '14px', color: '#334155'}}>{q[`Option${opt}`]}</span>
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
                    <img src={q.ImageUrl} alt={`Question ${q.QuestionNo}`} style={{maxWidth: "100%", maxHeight: "400px", marginBottom: "15px", borderRadius: "8px"}} />
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