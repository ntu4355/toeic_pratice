import { useState, useRef } from 'react';
// IMPORT TOOL SCAN PDF MÀ CHÚNG TA VỪA TẠO
import PdfScannerTool from '../../components/PdfScannerTool'; // Đổi đường dẫn cho phù hợp thư mục của bạn
import { API_BASE_URL, getAuthHeaders } from '../../config/api';

const EditExamModal = ({ exam, onClose, onRefresh }) => {
  const [step, setStep] = useState(1); 
  const [examName, setExamName] = useState(exam.name);
  const [duration, setDuration] = useState(exam.duration);
  
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

  const removeExamPdf = (indexToRemove) => {
    const newFiles = examPdfFiles.filter((_, idx) => idx !== indexToRemove);
    setExamPdfFiles(newFiles);
    if (newFiles.length === 0 && examPdfRef.current) examPdfRef.current.value = "";
  };
  const removeListenFile = () => { setListeningKeyFile(null); if (listenRef.current) listenRef.current.value = ""; };
  const removeReadFile = () => { setReadingKeyFile(null); if (readRef.current) readRef.current.value = ""; };
  const removeZipFile = () => { setZipFile(null); if (zipRef.current) zipRef.current.value = ""; };

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const formData = new FormData();
      formData.append('name', examName);
      formData.append('duration', duration);
      
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
      alert(data.message); 
      onRefresh(); 
      onClose();   
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
             <button type="button" onClick={() => setStep(2)} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#5b51d8', color: '#fff', fontWeight: '600', cursor: 'pointer' }}>Tiếp tục: Vào Phòng Scan Ảnh →</button>
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
