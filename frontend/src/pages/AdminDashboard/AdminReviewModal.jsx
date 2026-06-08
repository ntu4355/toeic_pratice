import React, { useState, useEffect } from 'react';
import { API_BASE_URL, getAuthHeaders } from '../../config/api';

const AdminReviewModal = ({ jobId, onClose, onApproveSuccess }) => {
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(true);

    // Lấy dữ liệu đề nháp từ Backend
    useEffect(() => {
        const fetchDraft = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/admin/draft-exams/${jobId}`, {
                    headers: getAuthHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    setDraft(data);
                } else {
                    alert("Không tìm thấy dữ liệu đề nháp!");
                    onClose();
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchDraft();
    }, [jobId]);

    // Bấm nút Xuất Bản Đề
    const handleApprove = async () => {
        if (!window.confirm("Sếp đã kiểm tra kỹ và muốn xuất bản đề thi này lên hệ thống chính thức?")) return;
        
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/draft-exams/${jobId}/approve`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                alert("🎉 Tuyệt vời! Đề thi đã được xuất bản lên hệ thống thành công!");
                onApproveSuccess();
                onClose();
            } else {
                alert("Lỗi khi xuất bản đề.");
            }
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) return <div style={overlayStyle}><div style={modalStyle}><h2>⏳ Đang tải dữ liệu phòng duyệt đề...</h2></div></div>;
    if (!draft) return null;

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
                    <h2 style={{ color: '#2563eb', margin: 0 }}>🕵️ PHÒNG DUYỆT ĐỀ: {draft.name}</h2>
                    <button onClick={onClose} style={closeBtnStyle}>❌ Đóng</button>
                </div>

                <div style={{ padding: '15px 0', color: '#475569' }}>
                    <p>Mắt thần AI đã bóc tách được <strong>{draft.questions?.length || 0} câu hỏi</strong>. Sếp hãy lướt xem qua, nếu thấy ưng ý thì bấm duyệt để đẩy lên sàn thi đấu chính thức nhé!</p>
                </div>

                <div style={questionListStyle}>
                    {draft.questions?.map((q, idx) => (
                        <div key={idx} style={questionCardStyle}>
                            <h4 style={{ margin: '0 0 10px 0', color: '#1e293b' }}>
                                Câu {q.QuestionNo} {q.Part ? `(Part ${q.Part})` : ''}
                            </h4>
                            {q.ImageUrl && <img src={q.ImageUrl} alt="Question" style={{ maxHeight: '100px', display: 'block', marginBottom: '10px' }} />}
                            {q.PassageImages?.length > 0 && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                    {q.PassageImages.map((imgUrl, imageIndex) => (
                                        <img key={imageIndex} src={imgUrl} alt="Passage" style={{ maxHeight: '120px', maxWidth: '180px', objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: '6px' }} />
                                    ))}
                                </div>
                            )}
                            {q.PassageText && (
                                <p style={{ margin: '0 0 8px 0', whiteSpace: 'pre-wrap', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', fontSize: '13px' }}>
                                    <strong>Passage:</strong> {q.PassageText}
                                </p>
                            )}
                            <p style={{ margin: '0 0 5px 0', whiteSpace: 'pre-wrap' }}><strong>Nội dung:</strong> {q.QuestionText || '(Không có Text)'}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '14px' }}>
                                <div><strong>A:</strong> {q.OptionA}</div>
                                <div><strong>B:</strong> {q.OptionB}</div>
                                <div><strong>C:</strong> {q.OptionC}</div>
                                {q.OptionD && <div><strong>D:</strong> {q.OptionD}</div>}
                            </div>
                            <p style={{ marginTop: '10px', color: '#10b981', fontWeight: 'bold' }}>Đáp án đúng: {q.CorrectAnswer || 'Chưa có'}</p>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: '20px', display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={cancelBtnStyle}>Quay lại</button>
                    <button onClick={handleApprove} style={approveBtnStyle}>🚀 XUẤT BẢN ĐỀ THI</button>
                </div>
            </div>
        </div>
    );
};

// CSS Inline cho Modal gọn nhẹ
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 };
const modalStyle = { backgroundColor: 'white', width: '90%', maxWidth: '1000px', maxHeight: '90vh', borderRadius: '12px', padding: '25px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
const questionListStyle = { flex: 1, overflowY: 'auto', paddingRight: '10px', display: 'flex', flexDirection: 'column', gap: '15px' };
const questionCardStyle = { border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', background: '#f8fafc' };
const closeBtnStyle = { background: 'transparent', border: 'none', fontSize: '16px', cursor: 'pointer' };
const approveBtnStyle = { padding: '12px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' };
const cancelBtnStyle = { padding: '12px 24px', background: '#cbd5e1', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' };

export default AdminReviewModal;
