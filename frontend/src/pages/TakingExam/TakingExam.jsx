import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./TakingExam.css";

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

const TakingExam = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const examId = location.state?.examId;
  const isReviewMode = location.state?.isReviewMode || false;
  
  // 💡 MỚI: Nếu xem lại bài, ép selectedParts = [] để mở khóa hiển thị toàn bộ 7 Part cho User xem đáp án
  const selectedParts = isReviewMode ? [] : (location.state?.selectedParts || []); 

  const [examInfo, setExamInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [timeLeft, setTimeLeft] = useState(7200);
  const [answers, setAnswers] = useState(location.state?.userAnswers || {});
  const [activePartId, setActivePartId] = useState(null);

  const [isSubmitted, setIsSubmitted] = useState(isReviewMode);
  
  // 💡 MỚI: Lấy trực tiếp điểm thật truyền từ ExamHistory sang (nếu có), không để máy tự chấm lại
  const [scoreInfo, setScoreInfo] = useState(location.state?.scoreInfo || { 
    correctL: 0, wrongL: 0, scoreL: 0,
    correctR: 0, wrongR: 0, scoreR: 0,
    totalScore: 0, timeSpent: 0 
  });

  // TẢI ĐỀ THI TỪ MONGODB
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
            if (firstAvailablePart) setActivePartId(firstAvailablePart.id);
          } else {
            alert("Đề thi này chưa có dữ liệu câu hỏi!");
          }
        }
      })
      .catch((err) => console.error("Lỗi khi tải đề thi:", err));
      
      // 💡 ĐÃ FIX BỆNH SỐ 2: Xóa selectedParts khỏi mảng bên dưới để nó không trigger load lại màn hình nữa
  }, [examId, navigate]); 

  // QUẢN LÝ BỘ ĐẾM THỜI GIAN
  useEffect(() => {
    if (isReviewMode) return; 
    if (timeLeft <= 0 && !isSubmitted) {
      handleAutoSubmit();
    }
    if (isSubmitted) return; 
    
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isSubmitted, isReviewMode]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSelectAnswer = (questionNo, optionLetter) => {
    if (isSubmitted || isReviewMode) return; 
    setAnswers((prev) => ({ ...prev, [questionNo]: optionLetter }));
  };

  // TÍNH ĐIỂM (CHỈ CHẠY KHI ĐANG LÀM BÀI MỚI VÀ BẤM NỘP)
  const calculateScore = async () => {
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
    const timeSpent = (examInfo.duration * 60) - timeLeft; 

    const finalScoreInfo = { correctL, wrongL, scoreL, correctR, wrongR, scoreR, totalScore, timeSpent };
    setScoreInfo(finalScoreInfo);
    setIsSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const userId = user.id || user._id;

    if (userId) {
        try {
            await fetch('http://localhost:5000/api/results', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    examId: examInfo._id || examInfo.id,
                    examName: examInfo.name,
                    correctListening: correctL,
                    correctReading: correctR,
                    scoreListening: scoreL,
                    scoreReading: scoreR,
                    totalScore: totalScore,
                    timeSpent: timeSpent,
                    userAnswers: answers 
                })
            });
        } catch (err) { console.error("Lỗi lưu lịch sử", err); }
    }
  };

  const handleAutoSubmit = () => {
    alert("Hết giờ làm bài! Hệ thống đang tự động nộp bài...");
    calculateScore();
  };

  const handleManualSubmit = () => {
    if (isSubmitted || isReviewMode) {
       navigate("/history"); 
       return;
    }
    if (window.confirm("Bạn có chắc chắn muốn nộp bài ngay bây giờ?")) {
      calculateScore();
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
        {isSubmitted && (
          <div style={{ background: '#fff', borderRadius: '12px', padding: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginBottom: '30px', borderTop: '5px solid #2563eb' }}>
            <h2 style={{ textAlign: 'center', color: '#1e3a8a', marginBottom: '25px', fontSize: '24px' }}>
               {isReviewMode ? "🔍 XEM LẠI BÀI THI CŨ" : "🎉 KẾT QUẢ BÀI THI"}
            </h2>
            
            <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
              
              <div style={{ flex: '1', minWidth: '250px', background: '#f8fafc', padding: '20px', borderRadius: '12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '16px', color: '#64748b', fontWeight: 'bold' }}>TỔNG ĐIỂM</div>
                <div style={{ fontSize: '48px', color: '#2563eb', fontWeight: '900', margin: '10px 0' }}>{scoreInfo.totalScore}</div>
                <div style={{ fontSize: '14px', color: '#94a3b8' }}>/ 990</div>
                
                <hr style={{ margin: '20px 0', borderColor: '#e2e8f0' }}/>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#475569' }}>
                  <span>⏱ Thời gian làm bài:</span>
                  <strong>{Math.floor(scoreInfo.timeSpent / 60)} phút {scoreInfo.timeSpent % 60} giây</strong>
                </div>
              </div>

              <div style={{ flex: '2', minWidth: '350px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ background: '#eff6ff', padding: '15px 20px', borderRadius: '10px', borderLeft: '5px solid #3b82f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ color: '#1e40af', margin: '0 0 5px 0' }}>🎧 Listening</h4>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      <span style={{ color: '#16a34a', fontWeight: 'bold' }}>{scoreInfo.correctL} đúng</span> | <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{scoreInfo.wrongL} sai/bỏ qua</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1d4ed8' }}>{scoreInfo.scoreL} <span style={{fontSize: '14px', color: '#94a3b8'}}>/ 495</span></div>
                </div>

                <div style={{ background: '#f0fdf4', padding: '15px 20px', borderRadius: '10px', borderLeft: '5px solid #22c55e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ color: '#166534', margin: '0 0 5px 0' }}>📖 Reading</h4>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      <span style={{ color: '#16a34a', fontWeight: 'bold' }}>{scoreInfo.correctR} đúng</span> | <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{scoreInfo.wrongR} sai/bỏ qua</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#15803d' }}>{scoreInfo.scoreR} <span style={{fontSize: '14px', color: '#94a3b8'}}>/ 495</span></div>
                </div>
              </div>

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
                          <div 
                            className="explain-content" 
                            dangerouslySetInnerHTML={{ 
                              __html: (q.Explanation || "(Chưa có giải thích cho câu này)")
                                .replace(/\n/g, '<br/>')
                                .replace(/(\([A-D]\))/g, '<br/><strong style="color: #d97706; font-size: 15px;">$1</strong>') 
                            }} 
                          />
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

              return (
                <div key={q.QuestionNo} id={`question-${q.QuestionNo}`} className="question-item">
                  {showAudioPlayer && (
                     <div className="question-audio-wrapper">
                         <audio controls style={{ width: "100%", height: "40px" }}><source src={q.AudioUrl} type="audio/mpeg" /></audio>
                     </div>
                  )}

                  <p className="question-text"><strong>Câu {q.QuestionNo}:</strong> {q.QuestionText}</p>
                  
                  {q.ImageUrl && <img src={q.ImageUrl} alt={`Question ${q.QuestionNo}`} style={{maxWidth: "100%", maxHeight: "500px", marginBottom: "15px", borderRadius: "8px"}} />}
                  
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
                      <div 
                        className="explain-content" 
                        dangerouslySetInnerHTML={{ 
                          __html: (q.Explanation || "(Chưa có giải thích cho câu này)")
                            .replace(/\n/g, '<br/>')
                            .replace(/(\([A-D]\))/g, '<br/><strong style="color: #d97706; font-size: 15px;">$1</strong>') 
                        }} 
                      />
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