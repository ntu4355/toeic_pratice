import { useState, useEffect, useRef } from 'react';
import './AdminDashboard.css';
import CreateExam from '../CreateExam/CreateExam';
import EditExamModal from "./EditExamModal";
import { API_BASE_URL, getAuthHeaders } from '../../config/api';
import AdminReviewModal from './AdminReviewModal';

const AdminDashboard = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [exams, setExams] = useState([]);
  const [users, setUsers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [replyTexts, setReplyTexts] = useState({});
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editingExam, setEditingExam] = useState(null);
  const [trackedJobs, setTrackedJobs] = useState([]);
  const [jobNotice, setJobNotice] = useState("");
  const [reviewJobId, setReviewJobId] = useState(null); // ID của Job đang chờ duyệt
  const jobPollersRef = useRef({});
  const noticeTimerRef = useRef(null);
  

  // Kéo dữ liệu đề thi từ MongoDB
  const fetchExams = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/exams`);
      const data = await response.json();
      setExams(data);
    } catch (error) {
      console.error("Lỗi khi tải danh sách đề thi:", error);
    }
  };
  
  // LOGIC MỚI: Kéo dữ liệu người dùng từ MongoDB (Thay thế localStorage)
  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error("Lỗi khi tải danh sách người dùng:", error);
    }
  };

  // Lấy danh sách yêu cầu hỗ trợ (chỉ admin)
  const fetchContacts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/contacts`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        console.error('Lỗi tải contacts:', response.statusText);
        return;
      }
      const data = await response.json();
      setTickets(data);
    } catch (error) {
      console.error('Lỗi khi tải danh sách yêu cầu hỗ trợ:', error);
    }
  };

  const stopJobPolling = (jobId) => {
    const timer = jobPollersRef.current[jobId];
    if (timer) {
      window.clearInterval(timer);
      delete jobPollersRef.current[jobId];
    }
  };

  const pollJobStatus = async (jobId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) return;

      const data = await response.json();
      setTrackedJobs((prev) => prev.map((job) => job._id === jobId ? { ...job, ...data } : job));

      if (data.status === 'done' || data.status === 'failed') {
        stopJobPolling(jobId);
        if (data.status === 'done') void fetchExams();
      }
    } catch (error) {
      console.error("Lỗi khi tải tiến độ job:", error);
    }
  };

  const handleJobStarted = ({ jobId, examName, type, message }) => {
    if (!jobId) return;

    const fallbackName = examName || "đề thi mới";
    const jobLabel = type === 'update_exam' ? 'cập nhật đề' : 'tạo đề';

    setTrackedJobs((prev) => {
      const nextJob = {
        _id: jobId,
        examName: fallbackName,
        type,
        status: 'pending',
        progress: 0,
        message: message || `Đang ${jobLabel} "${fallbackName}"...`,
      };

      if (prev.some((job) => job._id === jobId)) {
        return prev.map((job) => job._id === jobId ? { ...job, ...nextJob } : job);
      }
      return [nextJob, ...prev];
    });

    setJobNotice(`Đã nhận quá trình ${jobLabel} "${fallbackName}". Bạn có thể tiếp tục làm việc khác.`);
    // Tự chuyển sang tab Quản lý đề để admin thấy tiến độ ngay
    setActiveTab('manageExams');
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setJobNotice(""), 5000);

    void pollJobStatus(jobId);
    if (!jobPollersRef.current[jobId]) {
      jobPollersRef.current[jobId] = window.setInterval(() => {
        void pollJobStatus(jobId);
      }, 3000);
    }
  };

  const dismissTrackedJob = (jobId) => {
    stopJobPolling(jobId);
    setTrackedJobs((prev) => prev.filter((job) => job._id !== jobId));
  };

  useEffect(() => {
    const pollers = jobPollersRef.current;
    const timer = window.setTimeout(() => {
      void fetchExams();
      void fetchUsers(); // Gọi thẳng lên Backend để lấy User thật
    }, 0);

    return () => {
      window.clearTimeout(timer);
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      Object.values(pollers).forEach((poller) => window.clearInterval(poller));
      Object.keys(pollers).forEach((jobId) => delete pollers[jobId]);
    };
  }, []);

  // Khi admin mở tab contacts, poll định kỳ để nhận tin nhắn mới
  useEffect(() => {
    if (activeTab !== 'contacts') return;
    void fetchContacts();
    const id = setInterval(() => {
      void fetchContacts();
    }, 5000);
    return () => clearInterval(id);
  }, [activeTab]);

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="admin-access-denied">
        <h2>🛑 Quyền truy cập bị từ chối</h2>
        <p>Bạn cần đăng nhập bằng tài khoản Quản trị viên để xem trang này.</p>
      </div>
    );
  }

  const handleDeleteExam = async (id) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa đề thi này không? Dữ liệu sẽ mất vĩnh viễn!")) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/exams/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          alert("Xóa thành công!");
          fetchExams(); 
        } else {
          alert("Có lỗi xảy ra khi xóa!");
        }
      } catch (error) {
        console.error("Lỗi xóa đề:", error);
      }
    }
  };

  // Cập nhật trạng thái ticket (read / resolved)
  const handleUpdateStatus = async (id, status) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/contacts/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        setTickets((prev) => prev.map((t) => t._id === id ? { ...t, status } : t));
      } else {
        console.error('Không thể cập nhật trạng thái ticket');
      }
    } catch (error) {
      console.error('Lỗi khi cập nhật trạng thái ticket:', error);
    }
  };

  const handleSendReply = async (id) => {
    const reply = (replyTexts[id] || "").trim();
    if (!reply) return alert('Vui lòng nhập phản hồi trước khi gửi.');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/contacts/${id}/messages`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: reply }),
      });
      const updated = await response.json();
      if (response.ok && updated) {
        setTickets((prev) => prev.map((t) => t._id === id ? updated : t));
        setReplyTexts((p) => ({ ...p, [id]: '' }));
        setEditingReplyId(null);
      } else {
        console.error('Lỗi khi gửi phản hồi', updated);
      }
    } catch (error) {
      console.error('Lỗi khi gửi phản hồi:', error);
    }
  };

  return (
    <div className="admin-dashboard-horizontal">
      
      {/* BANNER PHÍA TRÊN */}
      <div className="admin-banner-gradient">
        <div className="admin-banner-content">
          <h1>👨‍💼 Admin Dashboard</h1>
          <p>Chào mừng, {currentUser?.fullName || currentUser?.name || "Admin TOEIC"}</p>
        </div>
      </div>

      {/* THANH MENU NGANG (TABS) */}
      <div className="admin-tabs-row">
        <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          📊 Tổng Quan
        </button>
        <button className={`tab-btn ${activeTab === 'createExam' ? 'active' : ''}`} onClick={() => setActiveTab('createExam')}>
          ➕ Tạo Đề Thi
        </button>
        <button className={`tab-btn ${activeTab === 'manageExams' ? 'active' : ''}`} onClick={() => { setActiveTab('manageExams'); fetchExams(); }}>
          📁 Quản Lý Đề
        </button>
        <button className={`tab-btn ${activeTab === 'contacts' ? 'active' : ''}`} onClick={() => { setActiveTab('contacts'); fetchContacts(); }}>
          📨 Hỗ Trợ
        </button>
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => { setActiveTab('users'); fetchUsers(); }}>
          👥 Quản Lý User
        </button>
      </div>

      {/* 🚀 VỊ TRÍ MỚI: TIẾN ĐỘ XỬ LÝ AI - HIỂN THỊ XUYÊN SUỐT CÁC TAB */}
      {trackedJobs.length > 0 && (
        <div style={{ maxWidth: '1200px', margin: '0 auto 20px auto', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
          <h4 style={{ color: '#475569', fontSize: '14px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚙️ Tiến độ xử lý AI đang chạy ngầm
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {trackedJobs.map((job) => {
              const isDone = job.status === 'done';
              const isFailed = job.status === 'failed';
              const isProcessing = job.status === 'processing' || job.status === 'pending';
              const progress = job.progress || 0;

              const actionLabel = job.type === 'update_exam'
                ? isDone ? '✅ Đã cập nhật đề' : isFailed ? '❌ Lỗi cập nhật đề' : '🔄 Đang cập nhật đề'
                : isDone ? '✅ Đã tạo đề' : isFailed ? '❌ Lỗi tạo đề' : '🔄 Đang tạo đề';

              const cardBg = isDone ? '#f0fdf4' : isFailed ? '#fef2f2' : '#eff6ff';
              const borderColor = isDone ? '#86efac' : isFailed ? '#fca5a5' : '#93c5fd';
              const barColor = isDone ? '#22c55e' : isFailed ? '#ef4444' : '#4f46e5';

              return (
                <div key={job._id} style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div>
                      <span style={{ fontWeight: '700', fontSize: '14px', color: '#1e293b' }}>{actionLabel}</span>
                      <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '13px' }}>"{job.examName || 'đề thi'}"</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: '700', fontSize: '15px', color: barColor }}>{progress}%</span>
                      
                      {/* NÚT VÀO DUYỆT ĐỀ (CHỈ HIỆN KHI DONE) */}
                      {isDone && (
                        <button 
                          onClick={() => setReviewJobId(job._id)}
                          style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', marginLeft: '5px' }}>
                          👀 VÀO DUYỆT ĐỀ
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => dismissTrackedJob(job._id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#94a3b8', lineHeight: 1, padding: '0 2px' }}
                        title="Ẩn"
                      >×</button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div style={{
                      height: '100%',
                      width: `${progress}%`,
                      background: barColor,
                      borderRadius: '99px',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>

                  <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                    {isFailed && job.error ? `⚠️ ${job.error}` : job.message}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KHU VỰC NỘI DUNG */}
      <div className="admin-content-area">
        
        {/* TAB 1: TỔNG QUAN */}
        {activeTab === 'overview' && (
          <div className="tab-overview-horizontal">
            {/* 4 Thẻ màu Gradient */}
            <div className="color-cards-grid">
              <div className="color-card card-purple">
                <div className="card-icon">📋</div>
                <div className="card-info">
                  <h3>{exams.length}</h3>
                  <p>Tổng Đề Thi</p>
                </div>
              </div>
              
              <div className="color-card card-pink">
                <div className="card-icon">👥</div>
                <div className="card-info">
                  <h3>{users.length}</h3>
                  <p>Người Dùng</p>
                </div>
              </div>
            </div>

            {/* 2 Khung nội dung bên dưới */}
            <div className="bottom-widgets-row">
              <div className="widget-box">
                <h4 className="widget-title">📑 Đề Thi Gần Đây</h4>
                {exams.length === 0 ? (
                   <p className="widget-empty">Chưa có đề thi nào.</p>
                ) : (
                   <ul className="widget-list">
                     {exams.slice(0, 3).map(ex => (
                       <li key={ex._id}>{ex.name}</li>
                     ))}
                   </ul>
                )}
              </div>
              <div className="widget-box">
                <h4 className="widget-title">📈 Thống Kê Hôm Nay</h4>
                <div className="stat-line">
                  <span>User mới:</span> <strong>0</strong>
                </div>
                <div className="stat-line">
                  <span>Đề thi mới:</span> <strong>0</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="tab-section">
            <h2>Thông báo hỗ trợ từ User</h2>
            {tickets.length === 0 ? (
              <p>Chưa có thông báo hỗ trợ.</p>
            ) : (
              <div className="contacts-list">
                {tickets.map((t) => (
                  <div key={t._id} className={`contact-item ${t.status || ''}`}>
                    <div className="contact-top">
                      <div className="contact-meta">
                        <div style={{ fontWeight: 800 }}>{t.name} <span style={{ color: '#64748b', fontWeight: 600 }}>({t.email})</span></div>
                        <div className="contact-subject">{t.subject}</div>
                        <div className="contact-message">{t.message}</div>
                      </div>

                      <div className="contact-actions">
                        {t.status !== 'read' && (
                          <button type="button" className="btn-mark" onClick={() => handleUpdateStatus(t._id, 'read')}>Đánh dấu đã đọc</button>
                        )}
                        <button type="button" className="btn-reply" onClick={() => { setEditingReplyId(prev => prev === t._id ? null : t._id); setReplyTexts(prev => ({ ...prev, [t._id]: prev[t._id] ?? '' })); }}>
                          Trả lời
                        </button>
                        <button type="button" className="btn-resolve" onClick={() => handleUpdateStatus(t._id, 'resolved')}>Đã giải quyết</button>
                      </div>
                    </div>

                    <div className="contact-messages">
                      {(t.messages && t.messages.length ? t.messages : [{ sender: 'user', text: t.message, createdAt: t.createdAt }]).map((m, i) => (
                        <div key={i} className={`chat-message ${m.sender === 'admin' ? 'chat-admin' : 'chat-user'}`}>
                          <div className="chat-text">{m.text}</div>
                          <div className="chat-time">{new Date(m.createdAt).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>

                    {editingReplyId === t._id && (
                      <div className="contact-reply-editor">
                        <textarea className="reply-input" value={replyTexts[t._id] || ''} onChange={(e) => setReplyTexts((p) => ({ ...p, [t._id]: e.target.value }))} placeholder="Viết phản hồi cho user..." />
                        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                          <button type="button" className="btn-reply-send" onClick={() => handleSendReply(t._id)}>Gửi phản hồi</button>
                          <button type="button" className="btn-cancel" onClick={() => setEditingReplyId(null)}>Hủy</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'createExam' && <div className="tab-section"><CreateExam currentUser={currentUser} onJobStarted={handleJobStarted} /></div>}

        {activeTab === 'manageExams' && (
          <div className="tab-section">
            <h2 style={{color: '#5b51d8'}}>Danh sách Đề thi</h2>

            {exams.length === 0 ? (
              <p>Chưa có đề thi nào trong Database.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Tên đề thi</th>
                    <th>Thời gian</th>
                    <th>Tổng số câu</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map(exam => (
                    <tr key={exam._id}>
                      <td style={{fontWeight: 'bold', color: '#333'}}>{exam.name}</td>
                      <td>{exam.duration} phút</td>
                      <td><span className="badge-blue">{exam.questionCount ?? exam.questions?.length ?? 0} câu</span></td>
                      <td>
                        <button className="btn-edit" onClick={() => setEditingExam(exam)}>Sửa</button>
                        <button className="btn-delete" onClick={() => handleDeleteExam(exam._id)}>Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="tab-section">
            <h2 style={{color: '#5b51d8'}}>Danh sách Người dùng</h2>
            {users.length === 0 ? (
              <p>Chưa có người dùng nào trong Database.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr><th>Tên hiển thị</th><th>Email</th><th>Quyền (Role)</th></tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td><span className={`role-badge ${user.role}`}>{user.role === 'admin' ? 'Quản trị viên' : 'Học viên'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* LỚP PHỦ MODAL CHỈNH SỬA ĐỀ THI BẰNG COMPONENT MỚI */}
      {editingExam && (
        <EditExamModal 
          exam={editingExam} 
          onClose={() => setEditingExam(null)} 
          onRefresh={fetchExams}
          onJobStarted={handleJobStarted}
        />
      )}

      {/* CỬA VÀO PHÒNG DUYỆT ĐỀ ADMIN REVIEW */}
      {reviewJobId && (
        <AdminReviewModal 
          jobId={reviewJobId} 
          onClose={() => setReviewJobId(null)} 
          onApproveSuccess={() => {
            fetchExams(); // Tải lại danh sách đề thi chính thức
            dismissTrackedJob(reviewJobId); // Ẩn job sau khi duyệt xong
          }} 
        />
      )}

      {jobNotice && (
        <div className="admin-job-toast">
          {jobNotice}
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;