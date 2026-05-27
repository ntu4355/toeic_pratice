import { useEffect, useMemo, useRef, useState } from 'react';
// IMPORT TOOL SCAN PDF MÀ CHÚNG TA VỪA TẠO
import PdfScannerTool from '../../components/PdfScannerTool'; // Đổi đường dẫn cho phù hợp thư mục của bạn
import { API_BASE_URL, getAuthHeaders } from '../../config/api';

const EXPECTED_PART_COUNTS = {
  1: 6,
  2: 25,
  3: 39,
  4: 30,
  5: 30,
  6: 16,
  7: 54,
};

const getSortedQuestions = (questions = []) => (
  [...questions].sort((a, b) => Number(a.QuestionNo || 0) - Number(b.QuestionNo || 0))
);

const buildExamStats = (examDetail, fallbackExam) => {
  const hasQuestionDetail = Array.isArray(examDetail?.questions) || Array.isArray(fallbackExam?.questions);
  const questions = getSortedQuestions(examDetail?.questions || fallbackExam?.questions || []);
  const partCounts = Object.keys(EXPECTED_PART_COUNTS).reduce((acc, part) => {
    acc[part] = 0;
    return acc;
  }, {});

  questions.forEach((question) => {
    const part = Number(question.Part);
    if (partCounts[part] !== undefined) partCounts[part] += 1;
  });

  const missingParts = Object.entries(EXPECTED_PART_COUNTS)
    .map(([part, expected]) => ({
      part: Number(part),
      expected,
      current: partCounts[part] || 0,
      missing: Math.max(expected - (partCounts[part] || 0), 0),
    }))
    .filter((item) => item.missing > 0);

  const missingAnswerNumbers = questions
    .filter((question) => !String(question.CorrectAnswer || '').trim())
    .map((question) => question.QuestionNo)
    .filter(Boolean);

  return {
    hasQuestionDetail,
    questionCount: questions.length || fallbackExam?.questionCount || 0,
    partCounts,
    missingParts,
    missingAnswerNumbers,
  };
};

const EditExamModal = ({ exam, onClose, onRefresh, onJobStarted }) => {
  const [step, setStep] = useState(1); 
  const [examName, setExamName] = useState(exam.name);
  const [duration, setDuration] = useState(exam.duration);
  const [examDetail, setExamDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  
  const [examPdfFiles, setExamPdfFiles] = useState([]); 
  const [listeningKeyFile, setListeningKeyFile] = useState(null);
  const [readingKeyFile, setReadingKeyFile] = useState(null);
  const [zipFile, setZipFile] = useState(null);

  // STATE NÀY SẼ LƯU CÁC ẢNH ĐƯỢC CẮT TỪ TOOL SCAN (Dạng Base64 y hệt bên CreateExam)
  const [completedCrops, setCompletedCrops] = useState({}); 

  const [isUpdating, setIsUpdating] = useState(false);

  const examPdfRef = useRef(null);
  const listenRef = useRef(null);
  const readRef = useRef(null);
  const zipRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const fetchExamDetail = async () => {
      setIsLoadingDetail(true);
      setDetailError("");

      try {
        const response = await fetch(`${API_BASE_URL}/api/exams/${exam._id}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Không thể tải chi tiết đề thi.");
        }

        if (isMounted) setExamDetail(data);
      } catch (error) {
        if (isMounted) setDetailError(error.message || "Không thể tải chi tiết đề thi.");
      } finally {
        if (isMounted) setIsLoadingDetail(false);
      }
    };

    if (exam?._id) void fetchExamDetail();

    return () => {
      isMounted = false;
    };
  }, [exam?._id]);

  const examStats = useMemo(() => buildExamStats(examDetail, exam), [examDetail, exam]);

  const removeExamPdf = (indexToRemove) => {
    const newFiles = examPdfFiles.filter((_, idx) => idx !== indexToRemove);
    setExamPdfFiles(newFiles);
    if (newFiles.length === 0 && examPdfRef.current) examPdfRef.current.value = "";
  };
  const removeListenFile = () => { setListeningKeyFile(null); if (listenRef.current) listenRef.current.value = ""; };
  const removeReadFile = () => { setReadingKeyFile(null); if (readRef.current) readRef.current.value = ""; };
  const removeZipFile = () => { setZipFile(null); if (zipRef.current) zipRef.current.value = ""; };

  const handleUpdate = async () => {
    const trimmedName = examName.trim();
    const normalizedDuration = Number(duration);

    if (!trimmedName) {
      alert("Vui lòng nhập tên đề thi.");
      return;
    }

    if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0) {
      alert("Thời gian làm bài phải lớn hơn 0 phút.");
      return;
    }

    setIsUpdating(true);
    try {
      const formData = new FormData();
      formData.append('name', trimmedName);
      formData.append('duration', normalizedDuration);
      
      if (examPdfFiles && examPdfFiles.length > 0) {
        examPdfFiles.forEach(file => formData.append('examFiles', file));
      }
      if (listeningKeyFile) formData.append('listeningKey', listeningKeyFile);
      if (readingKeyFile) formData.append('readingKey', readingKeyFile);
      if (zipFile) formData.append('audioZip', zipFile);

      // ĐÍNH KÈM ẢNH ĐÃ SCAN VÀO FORM (Chuyển base64 thành Blob)
      for (const taskId of Object.keys(completedCrops)) {
        const imagesArray = completedCrops[taskId] || [];
        for (let idx = 0; idx < imagesArray.length; idx++) {
          const response = await fetch(imagesArray[idx]);
          const blob = await response.blob();
          // Gắn tên trường theo chuẩn taskId (VD: part1_image_1) để Backend tự bắt
          formData.append(taskId, blob, `${taskId}_${idx}.jpg`); 
        }
      }

      const response = await fetch(`${API_BASE_URL}/api/exams/${exam._id}/append-files`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.message || "Có lỗi xảy ra khi cập nhật đề thi!");
        return;
      }

      if (data.jobId) {
        onJobStarted?.({
          jobId: data.jobId,
          examName: trimmedName,
          type: 'update_exam',
          message: data.message,
        });
        onRefresh();
        onClose();
      } else {
        alert(data.message);
        onRefresh();
        onClose();
      }
    } catch {
      alert("Lỗi kết nối đến máy chủ!");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      {/* Mở rộng Form ra 1000px khi vào Phòng Cắt Ảnh */}
      <div style={{ background: '#fff', borderRadius: '16px', width: step === 1 ? '550px' : '1000px', maxHeight: '95vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', transition: 'width 0.3s ease' }}>
        
        <div style={{ background: 'linear-gradient(135deg, #5b51d8, #8b5cf6)', padding: '20px 25px', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', color: 'white' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '600' }}>✏️ Cập Nhật Đề Thi (Bước {step}/2)</h2>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', opacity: 0.9 }}>{exam.name}</p>
        </div>

        <div style={{ padding: step === 1 ? '25px' : '15px 25px' }}>
          
          {/* ================= BƯỚC 1: TẢI FILE ================= */}
          {step === 1 && (
            <>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>Tên đề thi</label>
                  <input type="text" value={examName} onChange={e => setExamName(e.target.value)} required style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>Thời gian (phút)</label>
                  <input type="number" value={duration} onChange={e => setDuration(e.target.value)} required style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ margin: 0, color: '#0f172a', fontSize: '16px', fontWeight: 700 }}>Tình trạng đề hiện tại</h4>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13px' }}>
                      {isLoadingDetail ? 'Đang tải dữ liệu câu hỏi...' : detailError || `Đang có ${examStats.questionCount} câu trong hệ thống.`}
                    </p>
                  </div>
                  <div style={{ background: '#eef2ff', color: '#4338ca', borderRadius: '8px', padding: '8px 12px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {examStats.questionCount}/200 câu
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  {Object.entries(EXPECTED_PART_COUNTS).map(([part, expected]) => {
                    const current = examStats.hasQuestionDetail ? examStats.partCounts[part] || 0 : null;
                    const isMissing = examStats.hasQuestionDetail && current < expected;
                    return (
                      <div key={part} style={{ border: `1px solid ${isMissing ? '#fde68a' : '#bbf7d0'}`, background: isMissing ? '#fffbeb' : '#f0fdf4', borderRadius: '8px', padding: '8px 6px', textAlign: 'center' }}>
                        <div style={{ color: isMissing ? '#92400e' : '#166534', fontWeight: 700, fontSize: '12px' }}>Part {part}</div>
                        <div style={{ color: '#334155', fontSize: '12px', marginTop: '2px' }}>{current ?? '--'}/{expected}</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                    <div style={{ color: '#334155', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>Part còn thiếu</div>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '12.5px', lineHeight: 1.5 }}>
                      {examStats.missingParts.length === 0
                        ? (examStats.hasQuestionDetail ? 'Đủ số lượng câu theo cấu trúc TOEIC.' : 'Đang chờ dữ liệu chi tiết.')
                        : examStats.missingParts.map((item) => `Part ${item.part} thiếu ${item.missing}`).join(', ')}
                    </p>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                    <div style={{ color: '#334155', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}>Câu chưa có đáp án</div>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '12.5px', lineHeight: 1.5 }}>
                      {examStats.missingAnswerNumbers.length === 0
                        ? (examStats.hasQuestionDetail ? 'Tất cả câu hiện có đã có đáp án.' : 'Đang chờ dữ liệu chi tiết.')
                        : `${examStats.missingAnswerNumbers.slice(0, 12).join(', ')}${examStats.missingAnswerNumbers.length > 12 ? `... (+${examStats.missingAnswerNumbers.length - 12})` : ''}`}
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#1e293b', fontSize: '16px' }}>📦 Khu vực bổ sung File</h4>
                
                <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '8px', border: '1px dashed #fde047', marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#ca8a04', marginBottom: '8px' }}>📄 Đề Thi (Chọn NHIỀU file PDF):</label>
                  <input type="file" accept="application/pdf" multiple ref={examPdfRef} onChange={e => setExamPdfFiles(Array.from(e.target.files))} />
                  {examPdfFiles.length > 0 && (
                     <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {examPdfFiles.map((file, idx) => (
                           <div key={idx} style={{ display: 'flex', alignItems: 'center', background: '#fef08a', padding: '6px 10px', borderRadius: '6px', fontSize: '13px', color: '#854d0e', fontWeight: '500' }}>
                              📄 {file.name}
                              <button type="button" onClick={() => removeExamPdf(idx)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                           </div>
                        ))}
                     </div>
                  )}
                </div>

                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px dashed #bbf7d0', marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#16a34a', marginBottom: '8px' }}>🎧 Đáp án Listening (PDF):</label>
                  {!listeningKeyFile ? <input type="file" accept="application/pdf" ref={listenRef} onChange={e => setListeningKeyFile(e.target.files[0])} />
                  : <div style={{ display: 'flex', alignItems: 'center', background: '#dcfce7', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', color: '#166534', fontWeight: '500' }}>✅ {listeningKeyFile.name} <button onClick={removeListenFile} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</button></div>}
                </div>

                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px dashed #bbf7d0', marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#16a34a', marginBottom: '8px' }}>📖 Đáp án Reading (PDF):</label>
                  {!readingKeyFile ? <input type="file" accept="application/pdf" ref={readRef} onChange={e => setReadingKeyFile(e.target.files[0])} />
                  : <div style={{ display: 'flex', alignItems: 'center', background: '#dcfce7', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', color: '#166534', fontWeight: '500' }}>✅ {readingKeyFile.name} <button onClick={removeReadFile} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</button></div>}
                </div>

                <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px dashed #bfdbfe' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#2563eb', marginBottom: '8px' }}>🎵 Audio (ZIP):</label>
                  {!zipFile ? <input type="file" accept=".zip" ref={zipRef} onChange={e => setZipFile(e.target.files[0])} />
                  : <div style={{ display: 'flex', alignItems: 'center', background: '#dbeafe', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', color: '#1e40af', fontWeight: '500' }}>✅ {zipFile.name} <button onClick={removeZipFile} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</button></div>}
                </div>
              </div>
            </>
          )}

          {/* ================= BƯỚC 2: CÔNG CỤ SCAN ẢNH ================= */}
          {step === 2 && (
             <PdfScannerTool 
                pdfFiles={examPdfFiles} 
                completedCrops={completedCrops} 
                setCompletedCrops={setCompletedCrops} 
             />
          )}
        </div>

        {/* ================= FOOTER ĐIỀU HƯỚNG ================= */}
        <div style={{ padding: '15px 25px', background: '#f1f5f9', borderTop: '1px solid #e2e8f0', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {step === 2 ? (
            <button type="button" onClick={() => setStep(1)} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: '600', cursor: 'pointer' }}>← Quay lại Bước 1</button>
          ) : (
            <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: '600', cursor: 'pointer' }}>Hủy bỏ</button>
          )}

          {step === 1 ? (
             <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
               <button
                 type="button"
                 onClick={() => setStep(2)}
                 disabled={examPdfFiles.length === 0 || isUpdating}
                 style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #c4b5fd', background: '#fff', color: '#5b51d8', fontWeight: '600', cursor: examPdfFiles.length === 0 || isUpdating ? 'not-allowed' : 'pointer', opacity: examPdfFiles.length === 0 || isUpdating ? 0.55 : 1 }}
               >
                 Vào phòng scan ảnh
               </button>
               <button
                 type="button"
                 onClick={handleUpdate}
                 disabled={isUpdating}
                 style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: '600', cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.7 : 1 }}
               >
                 {isUpdating ? 'Đang lưu...' : 'Lưu cập nhật'}
               </button>
             </div>
          ) : (
             <button type="button" onClick={handleUpdate} disabled={isUpdating} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', fontWeight: '600', cursor: isUpdating ? 'not-allowed' : 'pointer', opacity: isUpdating ? 0.7 : 1 }}>
               {isUpdating ? '⏳ Đang tải ảnh lên máy chủ...' : '✅ Hoàn tất & Gửi cho AI phân tích'}
             </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default EditExamModal;
