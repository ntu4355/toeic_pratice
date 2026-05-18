import React, { useState, useRef } from 'react';
import './CreateExam.css';

// 💡 NHÚNG CÔNG CỤ SCAN DÙNG CHUNG VÀO ĐÂY
import PdfScannerTool from '../../components/PdfScannerTool'; // Nhớ điều chỉnh lại đường dẫn này cho đúng với thư mục của bạn nhé

const CreateExam = () => {
  const [step, setStep] = useState(1);
  const [examName, setExamName] = useState('');
  const [duration, setDuration] = useState(120);
  
  const [pdfFiles, setPdfFiles] = useState([]); 
  const [zipFile, setZipFile] = useState(null);
  const [listeningKeyFile, setListeningKeyFile] = useState(null);
  const [readingKeyFile, setReadingKeyFile] = useState(null);
  
  const pdfInputRef = useRef(null);
  const zipInputRef = useRef(null);
  
  // STATE lưu trữ các ảnh được cắt ra từ Component PdfScannerTool
  const [completedCrops, setCompletedCrops] = useState({}); 

  const onPdfChange = (e) => {
    const files = Array.from(e.target.files);
    const newFileObjects = files.map(file => ({
      name: file.name,
      url: URL.createObjectURL(file),
      rawFile: file 
    }));
    
    setPdfFiles(prev => [...prev, ...newFileObjects]);
    if (pdfInputRef.current) pdfInputRef.current.value = ""; 
  };

  const removePdf = (idx) => {
    setPdfFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const onZipChange = (e) => {
    if (e.target.files[0]) setZipFile(e.target.files[0]);
    if (zipInputRef.current) zipInputRef.current.value = "";
  };

  const goToCroppingRoom = (e) => {
    e.preventDefault();
    if (pdfFiles.length === 0 || !zipFile) return alert('Vui lòng chọn đầy đủ file Đề thi và Audio!');
    if (!listeningKeyFile || !readingKeyFile) return alert('Vui lòng tải lên đủ 2 file Đáp án (Listening & Reading)!');
    setStep(2);
  };

  const submitToBackend = async () => {
    setStep(3);
    try {
      const formData = new FormData();
      formData.append('name', examName);
      formData.append('duration', duration);
      formData.append('parts', JSON.stringify([1, 2, 3, 4, 5, 6, 7]));
      
      pdfFiles.forEach(item => formData.append('examFiles', item.rawFile));
      formData.append('audioZip', zipFile);

      if (listeningKeyFile) formData.append('listeningKey', listeningKeyFile);
      if (readingKeyFile) formData.append('readingKey', readingKeyFile);

      for (const taskId of Object.keys(completedCrops)) {
        const imagesArray = completedCrops[taskId] || [];
        for (let idx = 0; idx < imagesArray.length; idx++) {
          const response = await fetch(imagesArray[idx]);
          const blob = await response.blob();
          formData.append(taskId, blob, `${taskId}_${idx}.jpg`);
        }
      }

      const apiResponse = await fetch("http://localhost:5000/api/upload-exam", {
        method: "POST",
        body: formData
      });

      if (apiResponse.ok) {
        alert("🚀 Đã đẩy đề và Đáp án lên hệ thống thành công!");
        window.location.reload();
      } else {
        alert("Có lỗi xảy ra khi gửi dữ liệu!");
        setStep(2);
      }
    } catch (error) {
      alert("Không thể kết nối đến máy chủ Backend!");
      setStep(2);
    }
  };

  return (
    <div className="create-exam-container">
      
      {/* ================= BƯỚC 1: UP FILE ================= */}
      {step === 1 && (
        <form className="setup-form" onSubmit={goToCroppingRoom}>
          <h2 style={{color: '#5b51d8', marginBottom: '25px', textAlign: 'center'}}>📊 Quản Lý Upload Đề Thi & Đáp Án</h2>
          <div className="form-group">
            <label>Tên Đề Thi TOEIC</label>
            <input type="text" value={examName} onChange={(e) => setExamName(e.target.value)} required placeholder="Ví dụ: ETS 2026 Test 1" />
          </div>
          <div className="form-group">
            <label>Thời gian làm bài (Phút)</label>
            <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} required />
          </div>
          <div className="form-group" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
            <label>📁 Tải lên File PDF Đề Thi (File chứa câu hỏi)</label>
            <input type="file" accept="application/pdf" multiple onChange={onPdfChange} ref={pdfInputRef} />
            {pdfFiles.length > 0 && (
              <ul className="selected-files-list">
                {pdfFiles.map((item, index) => (
                  <li key={index} className="selected-file-item">
                    <span className="file-name">📄 {item.name}</span>
                    <button type="button" className="btn-clean-remove" onClick={() => removePdf(index)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="form-group" style={{ background: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <label>🔑 Tải lên File PDF Đáp Án Listening (Key + Transcript)</label>
            <input type="file" accept="application/pdf" onChange={(e) => setListeningKeyFile(e.target.files[0])} required />
          </div>

          <div className="form-group" style={{ background: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <label>🔑 Tải lên File PDF Đáp Án Reading (Key + Giải thích)</label>
            <input type="file" accept="application/pdf" onChange={(e) => setReadingKeyFile(e.target.files[0])} required />
          </div>

          <div className="form-group" style={{ background: '#eff6ff', padding: '15px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <label>🎵 Tải lên File ZIP Audio</label>
            <input type="file" accept=".zip" onChange={onZipChange} required={!zipFile} ref={zipInputRef} />
            {zipFile && (
               <div className="selected-file-item" style={{marginTop: '10px'}}>
                  <span className="file-name">🎵 {zipFile.name}</span>
                  <button type="button" className="btn-clean-remove" onClick={() => setZipFile(null)}>✕</button>
               </div>
            )}
          </div>
          <button type="submit" className="btn-next-step">Tiếp tục: Vào Phòng Scan Đề ➡️</button>
        </form>
      )}

      {/* ================= BƯỚC 2: CÔNG CỤ SCAN PDF ================= */}
      {step === 2 && (
        <div style={{ maxWidth: '1000px', margin: '0 auto', background: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
           
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <button type="button" onClick={() => setStep(1)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', fontWeight: 'bold', color: '#475569' }}>🔙 Trở lại Bước 1</button>
              <h3 style={{ margin: 0, color: '#1e293b' }}>Phòng Scan & Gắn Ảnh</h3>
           </div>

           {/* 💡 SỬ DỤNG COMPONENT SCAN PDF DÙNG CHUNG */}
           <PdfScannerTool
             pdfFiles={pdfFiles}
             completedCrops={completedCrops}
             setCompletedCrops={setCompletedCrops}
           />

           <div style={{ marginTop: '20px' }}>
              <button type="button" onClick={submitToBackend} style={{ padding: '12px 30px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>🚀 Hoàn tất & Gửi AI Chấm</button>
           </div>
        </div>
      )}

      {/* ================= BƯỚC 3: MÀN HÌNH LOADING CHỜ AI ================= */}
      {step === 3 && (
        <div className="loading-screen">
          <div style={{textAlign: 'center'}}>
            <div style={{fontSize: '50px', marginBottom: '20px'}}>🤖</div>
            <h2>AI Đang xử lý Đề thi và Đáp án... Bạn vui lòng không đóng trình duyệt.</h2>
            <p style={{marginTop: '10px', fontSize: '16px'}}>Quá trình này có thể mất 3-5 phút tùy vào độ dài của file Giải thích.</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default CreateExam;