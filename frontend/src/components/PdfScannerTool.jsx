import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

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
    { id: 'part7_153_155', label: 'Part 7 - Đoạn đơn (153-155)' },
    { id: 'part7_156_157', label: 'Part 7 - Đoạn đơn (156-157)' },
    { id: 'part7_158_160', label: 'Part 7 - Đoạn đơn (158-160)' },
    {  id: 'part7_161_163', label: 'Part 7 - Đoạn đơn (161-163)' },
    { id: 'part7_164_167', label: 'Part 7 - Đoạn đơn (164-167)' },
    { id: 'part7_168_171', label: 'Part 7 - Đoạn đơn (168-171)' },
    { id: 'part7_172_175', label: 'Part 7 - Đoạn đơn (172-175)' },
    { id: 'part7_176_180', label: 'Part 7 - Đoạn Kép (176-180)' },
    { id: 'part7_181_185', label: 'Part 7 - Đoạn Kép (181-185)' },
    { id: 'part7_186_190', label: 'Part 7 - Đoạn Ba (186-190)' },
    { id: 'part7_191_195', label: 'Part 7 - Đoạn Ba (191-195)' },
    { id: 'part7_196_200', label: 'Part 7 - Đoạn Ba (196-200)' },
];

const PdfScannerTool = ({ pdfFiles, completedCrops, setCompletedCrops }) => {
  const [currentPdfIndex, setCurrentPdfIndex] = useState(0); 
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [inputPage, setInputPage] = useState(1);
  const [crop, setCrop] = useState();
  const [activeTaskId, setActiveTaskId] = useState(TASKS[0].id);

  useEffect(() => {
    setInputPage(pageNumber);
  }, [pageNumber]);

  const handlePageInputChange = (e) => {
    const val = e.target.value;
    setInputPage(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= (numPages || 1)) {
      setPageNumber(parsed);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => setNumPages(numPages);

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
      crop.x * scaleX, crop.y * scaleY, crop.width * scaleX, crop.height * scaleY,
      0, 0, crop.width * scaleX, crop.height * scaleY
    );

    const base64Image = cropCanvas.toDataURL('image/jpeg', 1.0);

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

  if (!pdfFiles || pdfFiles.length === 0) {
     return (
        <div style={{ padding: '40px', border: '2px dashed #cbd5e1', borderRadius: '8px', background: '#fff', textAlign: 'center' }}>
           <p style={{ color: '#64748b' }}>Bạn chưa tải lên Đề Thi (PDF) ở Bước 1.</p>
           <p style={{ color: '#334155', fontSize: '14px' }}>Vui lòng quay lại Bước 1, thêm ít nhất 1 file Đề thi để hệ thống có thể bật công cụ quét ảnh!</p>
        </div>
     );
  }

  return (
    /* 🌟 ĐÃ KÉO DÀI CHIỀU CAO LÊN 760PX CỰC KỲ KHANG TRANG */
    <div className="cropping-room" style={{ height: '760px', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      <div className="cropping-header" style={{ paddingBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px', fontWeight: '700' }}>✂️ Quét Ảnh từ File PDF Vừa Tải Lên</h3>
        <div className="pdf-switcher">
          {pdfFiles.length > 1 && (
            <select value={currentPdfIndex} onChange={(e) => { setCurrentPdfIndex(Number(e.target.value)); setPageNumber(1); setInputPage(1); }} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '14px', outline: 'none' }}>
              {pdfFiles.map((item, idx) => <option key={idx} value={idx}>{item.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="cropping-layout" style={{ flex: 1, display: 'flex', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: '#f8fafc', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
        
        {/* KHU VỰC HIỂN THỊ FILE PDF (BÊN TRÁI) */}
        <div className="pdf-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#e2e8f0' }}>
          <div className="pdf-nav" style={{ padding: '10px 15px', background: '#ffffff', borderBottom: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>⬅️ Trước</button>
            <div className="page-input-wrapper" style={{ margin: '0 15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13.5px', color: '#475569', fontWeight: '500' }}>Trang</span>
              <input type="number" className="page-input" value={inputPage} onChange={handlePageInputChange} min={1} max={numPages || 1} style={{ width: '55px', padding: '5px', textAlign: 'center', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: '600', outline: 'none' }} />
              <span style={{ fontSize: '13.5px', color: '#475569', fontWeight: '500' }}>/ {numPages || '--'}</span>
            </div>
            <button type="button" disabled={pageNumber >= numPages} onClick={() => setPageNumber(pageNumber + 1)} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Sau ➡️</button>
          </div>
          
          {/* Vùng cuộn PDF rộng rãi */}
          <div className="pdf-canvas-wrapper" style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
            <Document file={pdfFiles[currentPdfIndex]?.url || URL.createObjectURL(pdfFiles[currentPdfIndex])} onLoadSuccess={onDocumentLoadSuccess} loading={<div style={{ padding: '20px', color: '#475569', fontWeight: '500' }}>Đang mở két sách PDF...</div>}>
              <ReactCrop crop={crop} onChange={c => setCrop(c)}>
                <Page pageNumber={pageNumber} renderTextLayer={false} renderAnnotationLayer={false} width={680} devicePixelRatio={3} />
              </ReactCrop>
            </Document>
          </div>
        </div>

        {/* KHU VỰC DANH SÁCH NHIỆM VỤ (BÊN PHẢI) */}
        <div className="task-section" style={{ width: '310px', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
          <h4 style={{ padding: '14px 18px', margin: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '14px', fontWeight: '700', color: '#334155' }}>Danh sách vị trí cần ảnh:</h4>
          
          {/* Danh sách cuộn mượt mà có custom scrollbar ẩn nhẹ */}
          <div className="task-scroll-area" style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {TASKS.map((task) => {
              const hasImages = completedCrops[task.id] && completedCrops[task.id].length > 0;
              return (
                <div 
                  key={task.id} 
                  className={`task-item-box ${activeTaskId === task.id ? 'active' : ''} ${hasImages ? 'done' : ''}`} 
                  onClick={() => setActiveTaskId(task.id)} 
                  style={{ 
                    padding: '10px 12px', 
                    borderRadius: '8px', 
                    border: activeTaskId === task.id ? '2px solid #4f46e5' : '1px solid #e2e8f0', 
                    cursor: 'pointer', 
                    background: activeTaskId === task.id ? '#f5f3ff' : hasImages ? '#f0fdf4' : '#fff',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div className="task-info" style={{ fontSize: '13px', fontWeight: activeTaskId === task.id || hasImages ? '600' : '500', color: activeTaskId === task.id ? '#4f46e5' : hasImages ? '#15803d' : '#475569' }}>
                    {hasImages ? '✅ ' : '⏳ '} {task.label}
                  </div>
                  {hasImages && (
                    <div className="task-previews-container" style={{ display: 'flex', gap: '6px', marginTop: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                      {completedCrops[task.id].map((imgUrl, imgIdx) => (
                        <div key={imgIdx} className="crop-preview-wrapper" style={{ position: 'relative', flexShrink: 0 }}>
                          <img src={imgUrl} alt="preview" className="crop-preview-mini" style={{ height: '36px', width: '55px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                          <span className="btn-img-remove" onClick={(e) => { e.stopPropagation(); removeCropImage(task.id, imgIdx); }} style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#ef4444', color: 'white', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>✕</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Nút cắt ảnh cố định ở chân cột */}
          <div style={{ padding: '15px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
             <button type="button" className="btn-save" onClick={saveCropForTask} style={{ width: '100%', padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.15)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.target.style.background = '#059669'} onMouseLeave={(e) => e.target.style.background = '#10b981'}>
                📸 Cắt & Lưu Vào Mục Đang Chọn
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfScannerTool;