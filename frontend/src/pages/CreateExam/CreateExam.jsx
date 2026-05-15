import React, { useState } from 'react';
import './CreateExam.css';

const CreateExam = () => {
  const [examName, setExamName] = useState('');
  const [duration, setDuration] = useState(120);
  
  const [audioFile, setAudioFile] = useState(null);
  const [documentFiles, setDocumentFiles] = useState([]); // Mảng chứa nhiều file PDF
  const [part1Images, setPart1Images] = useState({ 1: null, 2: null, 3: null, 4: null, 5: null, 6: null });
  
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePart1ImageChange = (qNo, file) => {
    setPart1Images(prev => ({ ...prev, [qNo]: file }));
  };

  // Hàm thêm file PDF vào danh sách
  const handlePdfChange = (e) => {
    const files = Array.from(e.target.files);
    setDocumentFiles(prev => [...prev, ...files]);
  };

  // Hàm xóa file PDF khỏi danh sách
  const removePdf = (indexToRemove) => {
    setDocumentFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  // Hàm xóa file Audio
  const removeAudio = () => {
    setAudioFile(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!examName) return alert('Vui lòng nhập tên đề thi!');

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('name', examName);
    formData.append('duration', duration);
    
    // Mặc định luôn là full test (7 parts) để Backend tự sinh Part 1 và Part 2
    formData.append('parts', JSON.stringify([1, 2, 3, 4, 5, 6, 7])); 

    if (audioFile) formData.append('files', audioFile);
    
    // Gửi tất cả các file PDF trong mảng lên Backend
    documentFiles.forEach(file => {
      formData.append('files', file);
    });

    // Đính kèm 6 ảnh của Part 1
    Object.keys(part1Images).forEach(qNo => {
      if (part1Images[qNo]) {
        formData.append(`part1_image_${qNo}`, part1Images[qNo]);
      }
    });

    try {
      const response = await fetch('http://localhost:5000/api/upload-exam', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        alert('Tuyệt vời! Đã nộp file lên hệ thống. Cỗ máy AI đang chạy ngầm để bóc tách đề thi!');
        // Reset form
        setExamName(''); setDuration(120); setAudioFile(null); setDocumentFiles([]);
        setPart1Images({ 1: null, 2: null, 3: null, 4: null, 5: null, 6: null });
      } else {
        alert('Có lỗi: ' + data.message);
      }
    } catch (error) {
      console.error(error);
      alert('Không thể kết nối đến máy chủ Backend.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="create-exam-container">
      <h2>Tạo Đề Thi Mới (Full Test 200 Câu)</h2>
      <form onSubmit={handleSubmit} className="create-exam-form">
        <div className="form-group">
          <label>Tên Đề Thi</label>
          <input type="text" placeholder="VD: ETS 2026 - Test 1" value={examName} onChange={e => setExamName(e.target.value)} required />
        </div>
        
        <div className="form-group">
          <label>Thời gian làm bài (Phút)</label>
          <input type="number" value={duration} onChange={e => setDuration(e.target.value)} required />
        </div>

        {/* KHUNG TẢI 6 ẢNH CHO PART 1 LUÔN HIỂN THỊ */}
        <div className="part1-images-section">
          <h4>Hình ảnh cho Part 1 (6 Câu đầu tiên)</h4>
          <p style={{fontSize: '12px', color: '#666', marginTop: '-10px'}}>Dùng Snipping Tool cắt 6 ảnh từ file đề thi và tải lên đây</p>
          <div className="images-grid">
            {[1, 2, 3, 4, 5, 6].map(num => (
              <div key={num} className="image-box">
                <label>Ảnh câu {num}</label>
                <input type="file" accept="image/*" onChange={(e) => handlePart1ImageChange(num, e.target.files[0])} />
              </div>
            ))}
          </div>
        </div>

        {/* KHUNG TẢI FILE AUDIO VÀ NHIỀU FILE PDF */}
        <div className="upload-section">
          {/* Box Audio */}
          <div className="upload-box">
            <label>File Audio ZIP (.zip)</label>
            <input type="file" accept=".zip,.mp3,.wav" onChange={e => setAudioFile(e.target.files[0])} />
            
            {audioFile && (
              <div className="file-list">
                <div className="file-item">
                  <span className="file-name">🎵 {audioFile.name}</span>
                  <button type="button" className="remove-btn" onClick={removeAudio} title="Xóa file này">&times;</button>
                </div>
              </div>
            )}
          </div>
          
          {/* Box PDF (Hỗ trợ Multiple) */}
          <div className="upload-box">
            <label>File Đề Thi (.pdf)</label>
            <p style={{fontSize: '12px', color: '#666', marginTop: '-10px'}}>Có thể tải nhiều file cùng lúc (VD: 1 file LC, 1 file RC)</p>
            <input type="file" accept=".pdf" multiple onChange={handlePdfChange} />
            
            {documentFiles.length > 0 && (
              <div className="file-list">
                {documentFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <span className="file-name">📄 {file.name}</span>
                    <button type="button" className="remove-btn" onClick={() => removePdf(index)} title="Xóa file này">&times;</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button type="submit" className="submit-btn" disabled={isProcessing}>
          {isProcessing ? '⏳ Hệ thống đang tiếp nhận...' : 'Bắt Đầu Xử Lý Đề Thi'}
        </button>
      </form>
    </div>
  );
};

export default CreateExam;