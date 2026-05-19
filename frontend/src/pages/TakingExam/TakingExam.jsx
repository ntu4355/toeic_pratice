import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./TakingExam.css";
import { API_BASE_URL, getAuthHeaders } from "../../config/api";

const partsConfig = [
  { id: 1, title: "Part 1", start: 1, end: 6 },
  { id: 2, title: "Part 2", start: 7, end: 31 },
  { id: 3, title: "Part 3", start: 32, end: 70 },
  { id: 4, title: "Part 4", start: 71, end: 100 },
  { id: 5, title: "Part 5", start: 101, end: 130 },
  { id: 6, title: "Part 6", start: 131, end: 146 },
  { id: 7, title: "Part 7", start: 147, end: 200 },
];

const getListeningScore = (correct) => {
    if (correct <= 6) return 5;
    if (correct >= 93) return 495;
    return Math.round((correct * 5.3) / 5) * 5; 
};
const getReadingScore = (correct) => {
    if (correct <= 9) return 5;
    if (correct >= 97) return 495;
    return Math.round((correct * 5.1) / 5) * 5; 
};

const optionLabelRegex = /^\([A-D]\)$/;

const ExplanationContent = ({ text }) => {
  const safeText = text || "(Chưa có giải thích cho câu này)";
  const lines = safeText.split("\n");

  return lines.map((line, lineIndex) => (
    <Fragment key={`${lineIndex}-${line}`}>
      {line.split(/(\([A-D]\))/g).map((part, partIndex) =>
        optionLabelRegex.test(part) ? (
          <strong key={`${lineIndex}-${partIndex}`} style={{ color: "#d97706", fontSize: "15px" }}>
            {part}
          </strong>
        ) : (
          <Fragment key={`${lineIndex}-${partIndex}`}>{part}</Fragment>
        ),
      )}
      {lineIndex < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
};

const TakingExam = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const examId = location.state?.examId;
  const isReviewMode = location.state?.isReviewMode || false;
  const selectedParts = useMemo(
    () => (isReviewMode ? [] : location.state?.selectedParts || []),
    [isReviewMode, location.state],
  ); 

  const [examInfo, setExamInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [timeLeft, setTimeLeft] = useState(7200);
  const [answers, setAnswers] = useState(location.state?.userAnswers || {});
  const [activePartId, setActivePartId] = useState(null);

  const [isSubmitted, setIsSubmitted] = useState(isReviewMode);
  
  const [scoreInfo, setScoreInfo] = useState(location.state?.scoreInfo || { 
    correctL: 0, wrongL: 0, scoreL: 0,
    correctR: 0, wrongR: 0, scoreR: 0,
    totalScore: 0, timeSpent: 0 
  });

  const calculateScore = useCallback(async () => {
    if (!examInfo) return;

    let correctL = 0, wrongL = 0, correctR = 0, wrongR = 0;
    let totalL = 0, totalR = 0;
    
    questions.forEach(q => {
      const userAns = answers[q.QuestionNo]?.trim().toUpperCase();
      const correctAns = q.CorrectAnswer?.trim().toUpperCase();
      const isListening = q.QuestionNo <= 100;

      if (isListening) totalL++; else totalR++;

      if (userAns) {
        if (userAns === correctAns) {
          isListening ? correctL++ : correctR++;
        } else {
          isListening ? wrongL++ : wrongR++;
        }
      } else {
          isListening ? wrongL++ : wrongR++;
      }
    });

    const projectedCorrectL = totalL > 0 ? Math.round((correctL / totalL) * 100) : 0;
    const projectedCorrectR = totalR > 0 ? Math.round((correctR / totalR) * 100) : 0;

    const scoreL = totalL > 0 ? getListeningScore(projectedCorrectL) : 0;
    const scoreR = totalR > 0 ? getReadingScore(projectedCorrectR) : 0;
    const totalScore = scoreL + scoreR;
    const timeSpent = ((examInfo.duration || 120) * 60) - timeLeft; 

    const finalScoreInfo = {
      correctL,
      wrongL,
      scoreL,
      correctR,
      wrongR,
      scoreR,
      totalScore,
      timeSpent,
      totalListening: totalL,
      totalReading: totalR,
    };
    setScoreInfo(finalScoreInfo);
    setIsSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const userId = user.id || user._id;

    if (userId) {
        try {
            await fetch(`${API_BASE_URL}/api/results`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    userId: userId,
                    examId: examInfo._id || examInfo.id,
                    examName: examInfo.name,
                    correctListening: correctL,
                    wrongListening: wrongL,
                    totalListening: totalL,
                    correctReading: correctR,
                    wrongReading: wrongR,
                    totalReading: totalR,
                    scoreListening: scoreL,
                    scoreReading: scoreR,
                    totalScore: totalScore,
                    timeSpent: timeSpent,
                    userAnswers: answers 
                })
            });
        } catch (err) { console.error("Lỗi lưu lịch sử", err); }
    }
  }, [answers, examInfo, questions, timeLeft]);

  const handleAutoSubmit = useCallback(() => {
    alert("Hết giờ làm bài! Hệ thống đang tự động nộp bài...");
    void calculateScore();
  }, [calculateScore]);

  useEffect(() => {
    if (!examId) {
      alert("Không tìm thấy thông tin đề thi!");
      navigate("/exam");
      return;
    }

    fetch(`${API_BASE_URL}/api/exams`)
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
            if (firstAvailablePart) setActivePartId(firstAvailablePart.id);
          } else {
            alert("Đề thi này chưa có dữ liệu câu hỏi!");
          }
        }
      })
      .catch((err) => console.error("Lỗi khi tải đề thi:", err));
  }, [examId, navigate, selectedParts]); 

  useEffect(() => {
    if (isReviewMode) return; 
    if (timeLeft <= 0 && !isSubmitted) {
      const submitTimer = window.setTimeout(handleAutoSubmit, 0);
      return () => window.clearTimeout(submitTimer);
    }
    if (isSubmitted) return; 
    
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isSubmitted, isReviewMode, handleAutoSubmit]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelectAnswer = (questionNo, optionLetter) => {
    if (isSubmitted || isReviewMode) return; 
    setAnswers((prev) => ({ ...prev, [questionNo]: optionLetter }));
  };

  const handleManualSubmit = () => {
    if (isSubmitted || isReviewMode) {
       navigate("/history"); 
       return;
    }
    if (window.confirm("Bạn có chắc chắn muốn nộp bài ngay bây giờ?")) {
      void calculateScore();
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

  const passageGroups = [];
  let currentImageKey = null;
  let currentGroup = [];

  displayedQuestions.forEach(q => {
    const qImageKey = (q.PassageImages && q.PassageImages.length > 0) ? q.PassageImages.join("||") : `no_img_${q.QuestionNo}`;
    if (qImageKey !== currentImageKey) {
      if (currentGroup.length > 0) passageGroups.push({ images: currentGroup[0].PassageImages || [], questions: currentGroup });
      currentImageKey = qImageKey;
      currentGroup = [q];
    } else {
      currentGroup.push(q);
    }
  });
  if (currentGroup.length > 0) passageGroups.push({ images: currentGroup[0].PassageImages || [], questions: currentGroup });

  return (
    <div className="taking-exam-container">
      
      <div className="exam-content-col">
        {/* ================= GIAO DIỆN KẾT QUẢ KIỂM TRA ĐÃ ĐƯỢC TỐI ƯU HÓA HOÀN HẢO ================= */}
        {isSubmitted && (
          <div className="result-dashboard-card">
            <h2 style={{ textAlign: 'center', color: '#1e3a8a', margin: '0 0 5px 0', fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px' }}>
               {isReviewMode ? "🔍 CHI TIẾT BÀI LÀM CŨ" : "🎉 KẾT QUẢ KIỂM TRA"}
            </h2>
            <p style={{ textAlign: 'center', color: '#64748b', fontSize: '14px', margin: '0 0 25px 0' }}>
              Hệ thống tự động chấm điểm và quy đổi TOEIC theo công thức ước lượng trong bản test
            </p>
            
            <div className="result-dashboard-grid">
              
              {/* CỘT ĐIỂM TỔNG SỐ BÊN TRÁI */}
              <div className="score-summary-box">
                <div className="total-label">TỔNG ĐIỂM</div>
                <div className="total-score-value">{scoreInfo.totalScore}</div>
                <div className="total-max">/ 990 Điểm</div>
                
                <div style={{ width: '100%', height: '1px', background: '#e2e8f0', margin: '18px 0' }}></div>
                
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px', color: '#475569' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>⏱ Thời gian làm:</span>
                    <strong style={{ color: '#1e293b' }}>{Math.floor(scoreInfo.timeSpent / 60)} phút {scoreInfo.timeSpent % 60} giây</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>🎯 Tỷ lệ chính xác:</span>
                    <strong style={{ color: '#4f46e5' }}>{Math.round(((scoreInfo.correctL + scoreInfo.correctR) / questions.length) * 100)}%</strong>
                  </div>
                </div>
              </div>

              {/* CỘT THỐNG KÊ CHI TIẾT THEO KỸ NĂNG BÊN PHẢI */}
              <div className="section-score-container">
                
                {/* THẺ ĐIỂM LISTENING */}
                <div className="section-score-card card-listening">
                  <div>
                    <h4>🎧 Phần thi Listening</h4>
                    <div className="section-score-meta">
                      <span style={{ color: '#16a34a', fontWeight: '700' }}>{scoreInfo.correctL} câu đúng</span>
                      <span style={{ color: '#cbd5e1', margin: '0 8px' }}>|</span>
                      <span style={{ color: '#ef4444', fontWeight: '700' }}>{scoreInfo.wrongL} câu sai/bỏ qua</span>
                    </div>
                  </div>
                  <div className="section-score-value">
                    {scoreInfo.scoreL} <span className="section-score-max">/ 495</span>
                  </div>
                </div>

                {/* THẺ ĐIỂM READING */}
                <div className="section-score-card card-reading">
                  <div>
                    <h4>📖 Phần thi Reading</h4>
                    <div className="section-score-meta">
                      <span style={{ color: '#16a34a', fontWeight: '700' }}>{scoreInfo.correctR} câu đúng</span>
                      <span style={{ color: '#cbd5e1', margin: '0 8px' }}>|</span>
                      <span style={{ color: '#ef4444', fontWeight: '700' }}>{scoreInfo.wrongR} câu sai/bỏ qua</span>
                    </div>
                  </div>
                  <div className="section-score-value">
                    {scoreInfo.scoreR} <span className="section-score-max">/ 495</span>
                  </div>
                </div>

              </div>
            </div>
            
            <div style={{ textAlign: 'center', marginTop: '25px', fontSize: '13.5px', color: '#475569', background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontStyle: 'italic' }}>
              💡 Cuộn xuống dưới hoặc dùng bảng câu hỏi bên phải để nhảy nhanh đến câu muốn xem lời giải thích chi tiết nhé!
            </div>
          </div>
        )}

        <h2 style={{ color: "#0f2f6d", marginBottom: "15px" }}>{examInfo.name}</h2>

        <div className="part-tabs-container">
          {availableParts.map(part => (
            <button key={part.id} className={`part-tab-btn ${activePartId === part.id ? "active" : ""}`} onClick={() => setActivePartId(part.id)}>
              {part.title}
            </button>
          ))}
        </div>

        {(activePartId === 6 || activePartId === 7) ? (
          <div className="part-67-wrapper">
            {passageGroups.map((group, idx) => (
              <div key={idx} className="reading-split-container">
                <div className="passage-left-col">
                   <div className="passage-title">Câu hỏi {group.questions[0]?.QuestionNo} - {group.questions[group.questions.length - 1]?.QuestionNo} tham khảo thông tin sau:</div>
                   <div className="passage-images-gallery">
                     {group.images && group.images.length > 0 ? (
                       group.images.map((imgUrl, imgIdx) => <img key={imgIdx} src={imgUrl} alt={`Đoạn văn`} style={{maxWidth: '100%'}} />)
                     ) : (
                       <div style={{ padding: '20px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', border: '1px dashed #fca5a5' }}>(Không tìm thấy dữ liệu ảnh bài đọc)</div>
                     )}
                   </div>
                </div>

                <div className="questions-right-col">
                  {group.questions.map((q) => (
                    <div key={q.QuestionNo} id={`question-${q.QuestionNo}`} className="question-item">
                      <p className="question-text"><strong>{q.QuestionNo}</strong>. {q.QuestionText}</p>
                      
                      <div className="options-group">
                        {["A", "B", "C", "D"].map((opt) => {
                          if (!q[`Option${opt}`]) return null; 
                          
                          let labelClass = "option-label";
                          const isCorrectAns = q.CorrectAnswer?.trim().toUpperCase() === opt;
                          const isUserSelected = answers[q.QuestionNo] === opt;

                          if (isSubmitted) {
                            if (isCorrectAns) labelClass += " correct-ans";
                            else if (isUserSelected && !isCorrectAns) labelClass += " wrong-ans";
                          } else {
                            if (isUserSelected) labelClass += " selected";
                          }

                          return (
                            <label key={opt} className={labelClass}>
                              <input type="radio" disabled={isSubmitted} name={`question-${q.QuestionNo}`} value={opt} checked={isUserSelected} onChange={() => handleSelectAnswer(q.QuestionNo, opt)} />
                              <span className="option-circle">{opt}</span>
                              <span className="option-text">{q[`Option${opt}`]}</span>
                            </label>
                          );
                        })}
                      </div>

                      {isSubmitted && (
                        <div className="explanation-box">
                          <div className="explain-title">💡 Giải thích chi tiết:</div>
                          <div className="explain-content">
                            <ExplanationContent text={q.Explanation} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

        ) : (
          <div className="questions-list">
            {displayedQuestions.map((q, index) => {
              const showAudioPlayer = q.AudioUrl && (index === 0 || q.AudioUrl !== displayedQuestions[index - 1].AudioUrl);
              
              // 💡 ĐÃ TỐI ƯU UX: Sơ đồ đồ họa chia sẻ chung cho 3 câu Part 3/4 sẽ CHỈ HIỆN 1 LẦN, tránh lặp lại 3 tấm ảnh giống nhau
              const showGraphicImage = q.ImageUrl && (index === 0 || q.ImageUrl !== displayedQuestions[index - 1].ImageUrl);

              return (
                <div key={q.QuestionNo} id={`question-${q.QuestionNo}`} className="question-item">
                  {showAudioPlayer && (
                     <div className="question-audio-wrapper">
                         <audio controls style={{ width: "100%", height: "40px" }}><source src={q.AudioUrl} type="audio/mpeg" /></audio>
                     </div>
                  )}

                  {/* 🖼 HIỂN THỊ ĐỒ HỌA PART 3/4 KHÔNG LẶP LẠI */}
                  {showGraphicImage && (
                     <img src={q.ImageUrl} alt={`Sơ đồ đồ họa`} style={{maxWidth: "100%", maxHeight: "480px", display: 'block', margin: "10px 0 20px 0", borderRadius: "10px", boxShadow: '0 4px 15px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0'}} />
                  )}

                  <p className="question-text"><strong>Câu {q.QuestionNo}:</strong> {q.QuestionText}</p>
                  
                  <div className="options-group">
                    {["A", "B", "C", "D"].map((opt) => {
                      if (!q[`Option${opt}`]) return null; 
                      
                      let labelClass = "option-label";
                      const isCorrectAns = q.CorrectAnswer?.trim().toUpperCase() === opt;
                      const isUserSelected = answers[q.QuestionNo] === opt;

                      if (isSubmitted) {
                        if (isCorrectAns) labelClass += " correct-ans";
                        else if (isUserSelected && !isCorrectAns) labelClass += " wrong-ans";
                      } else {
                        if (isUserSelected) labelClass += " selected";
                      }

                      return (
                        <label key={opt} className={labelClass}>
                          <input type="radio" disabled={isSubmitted} name={`question-${q.QuestionNo}`} value={opt} checked={isUserSelected} onChange={() => handleSelectAnswer(q.QuestionNo, opt)} />
                          <span className="option-circle">{opt}</span>
                          <span className="option-text">{q[`Option${opt}`]}</span>
                        </label>
                      );
                    })}
                  </div>

                  {isSubmitted && (
                    <div className="explanation-box">
                      <div className="explain-title">💡 Giải thích chi tiết:</div>
                      <div className="explain-content">
                        <ExplanationContent text={q.Explanation} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="part-navigation-buttons">
          {prevPart ? <button className="nav-part-btn" onClick={() => { setActivePartId(prevPart.id); window.scrollTo(0, 0); }}>← Quay lại {prevPart.title}</button> : <div></div>}
          {nextPart ? <button className="nav-part-btn" onClick={() => { setActivePartId(nextPart.id); window.scrollTo(0, 0); }}>Tiếp tục {nextPart.title} →</button> : <div></div>}
        </div>
      </div>

      <div className="exam-sidebar-col">
        <div className="timer-box" style={{ background: '#f8fafc' }}>
          <div className="timer-label">{isReviewMode ? "CHẾ ĐỘ XEM LẠI" : isSubmitted ? "ĐÃ NỘP BÀI" : "THỜI GIAN CÒN LẠI"}</div>
          <div className="timer-value" style={{ color: '#94a3b8' }}>{isReviewMode ? "00:00" : formatTime(timeLeft)}</div>
        </div>

        <button className="submit-btn" style={{ background: '#10b981' }} onClick={handleManualSubmit}>
          {isSubmitted || isReviewMode ? "Quay về lịch sử" : "Nộp bài ngay"}
        </button>

        <div className="question-navigation">
          <h3 style={{ textAlign: "center", marginBottom: "15px", fontSize: "16px" }}>BẢNG CÂU HỎI</h3>
          
          {availableParts.map((part) => {
            const partQuestionNumbers = [];
            for (let i = part.start; i <= part.end; i++) {
              if (questions.find(q => q.QuestionNo === i)) partQuestionNumbers.push(i);
            }

            return (
              <div key={part.id} className="nav-part-section">
                <div className="nav-part-title">{part.title}</div>
                <div className="question-grid">
                  {partQuestionNumbers.map((qNo) => {
                    let boxClass = "q-box";
                    if (isSubmitted || isReviewMode) {
                       const correctAns = questions.find(q => q.QuestionNo === qNo)?.CorrectAnswer?.trim().toUpperCase();
                       const userAns = answers[qNo]?.trim().toUpperCase();
                       if (!userAns) boxClass += " unattempted"; 
                       else if (userAns === correctAns) boxClass += " correct"; 
                       else boxClass += " wrong"; 
                    } else {
                       if (answers[qNo]) boxClass += " answered";
                    }

                    return (
                      <div key={qNo} className={boxClass} onClick={() => handleSidebarClick(qNo, part.id)}>
                        {qNo}
                      </div>
                    );
                  })}
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
