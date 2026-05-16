import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import './CreateExam.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const TASKS = [
  { id: 'part1_image_1', label: 'Part 1 - Ảnh Câu 1' },
  { id: 'part1_image_2', label: 'Part 1 - Ảnh Câu 2' },
  { id: 'part1_image_3', label: 'Part 1 - Ảnh Câu 3' },
  { id: 'part1_image_4', label: 'Part 1 - Ảnh Câu 4' },
  { id: 'part1_image_5', label: 'Part 1 - Ảnh Câu 5' },
  { id: 'part1_image_6', label: 'Part 1 - Ảnh Câu 6' },
  { id: 'part6_131_134', label: 'Part 6 - Đoạn văn (131-134)' },
  { id: 'part6_135_138', label: 'Part 6 - Đoạn văn (135-138)' },
  { id: 'part6_139_142', label: 'Part 6 - Đoạn văn (139-142)' },
  { id: 'part6_143_146', label: 'Part 6 - Đoạn văn (143-146)' },
  { id: 'part7_147_148', label: 'Part 7 - Đoạn đơn (147-148)' },
  { id: 'part7_149_150', label: 'Part 7 - Đoạn đơn (149-150)' },
  { id: 'part7_151_152', label: 'Part 7 - Đoạn đơn (151-152)' },
  { id: 'part7_153_154', label: 'Part 7 - Đoạn đơn (153-154)' },
  { id: 'part7_155_156', label: 'Part 7 - Đoạn đơn (155-156)' },
  { id: 'part7_157_158', label: 'Part 7 - Đoạn đơn (157-158)' },
  { id: 'part7_159_160', label: 'Part 7 - Đoạn đơn (159-160)' },
  { id: 'part7_161_165', label: 'Part 7 - Đoạn kép (161-165)' },
  { id: 'part7_166_170', label: 'Part 7 - Đoạn kép (166-170)' },
  { id: 'part7_171_175', label: 'Part 7 - Đoạn kép (171-175)' },
  { id: 'part7_176_180', label: 'Part 7 - Đoạn Kép (176-180)' },
  { id: 'part7_181_185', label: 'Part 7 - Đoạn Kép (181-185)' },
  { id: 'part7_186_190', label: 'Part 7 - Đoạn Ba (186-190)' },
  { id: 'part7_191_195', label: 'Part 7 - Đoạn Ba (191-195)' },
  { id: 'part7_196_200', label: 'Part 7 - Đoạn Ba (196-200)' },
];

const CreateExam = () => {
  const [step, setStep] = useState(1);
  const [examName, setExamName] = useState('');
  const [duration, setDuration] = useState(120);
  
  const [pdfFiles, setPdfFiles] = useState([]); 
  const [zipFile, setZipFile] = useState(null);
  
  const pdfInputRef = useRef(null);
  const zipInputRef = useRef(null);
  
  // Trạng thái cho Phòng cắt ảnh
  const [currentPdfIndex, setCurrentPdfIndex] = useState(0); 
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [inputPage, setInputPage] = useState(1); // TÍNH NĂNG MỚI: State cho ô nhập số trang
  const [crop, setCrop] = useState();
  
  const [completedCrops, setCompletedCrops] = useState({}); 
  const [activeTaskId, setActiveTaskId] = useState(TASKS[0].id);

  // Đồng bộ ô nhập liệu mỗi khi lật trang bằng nút Prev/Next
  useEffect(() => {
    setInputPage(pageNumber);
  }, [pageNumber]);

  // TÍNH NĂNG MỚI: Xử lý khi người dùng tự gõ số trang
  const handlePageInputChange = (e) => {
    const val = e.target.value;
    setInputPage(val); // Cho phép hiển thị cả ô trống khi người dùng đang xóa số cũ
    const parsed = parseInt(val, 10);
    // Nếu gõ số hợp lệ (nằm trong khoảng 1 -> numPages) thì lật trang luôn
    if (!isNaN(parsed) && parsed >= 1 && parsed <= (numPages || 1)) {
      setPageNumber(parsed);
    }
  };

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
    if (currentPdfIndex >= pdfFiles.length - 1) {
       setCurrentPdfIndex(Math.max(0, pdfFiles.length - 2));
    }
  };

  const onZipChange = (e) => {
    if (e.target.files[0]) setZipFile(e.target.files[0]);
    if (zipInputRef.current) zipInputRef.current.value = "";
  };

  const onDocumentLoadSuccess = ({ numPages }) => setNumPages(numPages);

  const goToCroppingRoom = (e) => {
    e.preventDefault();
    if (pdfFiles.length === 0 || !zipFile) return alert('Vui lòng chọn đầy đủ file!');
    setStep(2);
  };

  const saveCropForTask = () => {
    if (!crop || !crop.width || !crop.height) {
      return alert("Vui lòng dùng chuột quét (vẽ khung) lên vùng đề thi trước!");
    }

    const pdfCanvas = document.querySelector('.react-pdf__Page__canvas');
    if (!pdfCanvas) return;

    const scaleX = pdfCanvas.width / pdfCanvas.clientWidth;
    const scaleY = pdfCanvas.height / pdfCanvas.clientHeight;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = crop.width * scaleX;
    cropCanvas.height = crop.height * scaleY;
    const ctx = cropCanvas.getContext('2d');

    ctx.drawImage(
      pdfCanvas,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      crop.width * scaleX,
      crop.height * scaleY
    );

    const base64Image = cropCanvas.toDataURL('image/jpeg');

    setCompletedCrops(prev => ({
      ...prev,
      [activeTaskId]: [...(prev[activeTaskId] || []), base64Image]
    }));

    setCrop(null); 
  };

  const removeCropImage = (taskId, imgIndex) => {
    setCompletedCrops(prev => {
      const updatedImages = (prev[taskId] || []).filter((_, idx) => idx !== imgIndex);
      const newCrops = { ...prev };
      
      if (updatedImages.length > 0) {
        newCrops[taskId] = updatedImages;
      } else {
        delete newCrops[taskId]; 
      }
      return newCrops;
    });
  };

  const submitToBackend = async () => {
    setStep(3);
    try {
      const formData = new FormData();
      formData.append('name', examName);
      formData.append('duration', duration);
      formData.append('parts', JSON.stringify([1, 2, 3, 4, 5, 6, 7]));
      
      pdfFiles.forEach(item => formData.append('files', item.rawFile));
      formData.append('files', zipFile);

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
        alert("🚀 Đã đẩy đề lên hệ thống thành công!");
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
      
      {step === 1 && (
        <form className="setup-form" onSubmit={goToCroppingRoom}>
          <h2 style={{color: '#5b51d8', marginBottom: '25px', textAlign: 'center'}}>📊 Đẩy Đề Thi Fullstack Lên Hệ Thống</h2>
          <div className="form-group">
            <label>Tên Đề Thi TOEIC</label>
            <input type="text" value={examName} onChange={(e) => setExamName(e.target.value)} required placeholder="Ví dụ: ETS 2026 Test 1" />
          </div>
          <div className="form-group">
            <label>Thời gian làm bài (Phút)</label>
            <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} required />
          </div>
          <div className="form-group">
            <label>📁 Tải lên File PDF Đề Thi (Có thể chọn nhiều file)</label>
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
          <div className="form-group">
            <label>🎵 Tải lên File ZIP Audio</label>
            <input type="file" accept=".zip" onChange={onZipChange} required={!zipFile} ref={zipInputRef} />
            {zipFile && (
               <div className="selected-file-item" style={{marginTop: '10px'}}>
                  <span className="file-name">🎵 {zipFile.name}</span>
                  <button type="button" className="btn-clean-remove" onClick={() => setZipFile(null)}>✕</button>
               </div>
            )}
          </div>
          <button type="submit" className="btn-next-step">Tiếp tục: Vào Phòng Scan & Cắt Ảnh ➡️</button>
        </form>
      )}

      {step === 2 && (
        <div className="cropping-room">
          <div className="cropping-header">
            <button className="btn-outline" onClick={() => setStep(1)}>🔙 Trở lại</button>
            <h3>✂️ Hệ Thống Scan Đề Thi</h3>
            <div className="pdf-switcher">
              {pdfFiles.length > 1 && (
                <select value={currentPdfIndex} onChange={(e) => { setCurrentPdfIndex(Number(e.target.value)); setPageNumber(1); setInputPage(1); }}>
                  {pdfFiles.map((item, idx) => <option key={idx} value={idx}>{item.name}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="cropping-layout">
            <div className="pdf-section">
              <div className="pdf-nav">
                <button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}>⬅️ Trước</button>
                
                {/* TÍNH NĂNG MỚI: Ô NHẬP SỐ TRANG */}
                <div className="page-input-wrapper">
                  <span>Trang</span>
                  <input 
                    type="number" 
                    className="page-input" 
                    value={inputPage} 
                    onChange={handlePageInputChange} 
                    min={1} 
                    max={numPages || 1} 
                  />
                  <span>/ {numPages || '--'}</span>
                </div>

                <button type="button" disabled={pageNumber >= numPages} onClick={() => setPageNumber(pageNumber + 1)}>Sau ➡️</button>
              </div>
              <div className="pdf-canvas-wrapper">
                <Document file={pdfFiles[currentPdfIndex]?.url} onLoadSuccess={onDocumentLoadSuccess} loading={<div className="loading-txt">Đang tải PDF...</div>}>
                  <ReactCrop crop={crop} onChange={c => setCrop(c)}>
                    <Page pageNumber={pageNumber} renderTextLayer={false} renderAnnotationLayer={false} width={700} />
                  </ReactCrop>
                </Document>
              </div>
            </div>

            <div className="task-section">
              <h4>Danh sách vị trí cần ảnh:</h4>
              <div className="task-scroll-area">
                {TASKS.map((task) => {
                  const hasImages = completedCrops[task.id] && completedCrops[task.id].length > 0;
                  return (
                    <div key={task.id} className={`task-item-box ${activeTaskId === task.id ? 'active' : ''} ${hasImages ? 'done' : ''}`} onClick={() => setActiveTaskId(task.id)}>
                      <div className="task-info">
                        {hasImages ? '✅ ' : '⏳ '} {task.label}
                      </div>
                      
                      {hasImages && (
                        <div className="task-previews-container">
                          {completedCrops[task.id].map((imgUrl, imgIdx) => (
                            <div key={imgIdx} className="crop-preview-wrapper">
                              <img src={imgUrl} alt="preview" className="crop-preview-mini" />
                              <span className="btn-img-remove" onClick={(e) => {
                                e.stopPropagation(); 
                                removeCropImage(task.id, imgIdx);
                              }}>✕</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn-save" onClick={saveCropForTask}>📸 Lưu ảnh vào mục đang chọn</button>
              <button type="button" className="btn-final" onClick={submitToBackend}>🚀 Hoàn tất & Gửi AI</button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="loading-screen">
          <div style={{textAlign: 'center'}}>
            <div style={{fontSize: '50px', marginBottom: '20px'}}>🤖</div>
            <h2>AI Đang xử lý đề... Bạn vui lòng không đóng trình duyệt.</h2>
          </div>
        </div>
      )}

    </div>
  );
};

export default CreateExam;