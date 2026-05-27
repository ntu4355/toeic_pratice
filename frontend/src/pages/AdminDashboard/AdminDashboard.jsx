import { useState, useEffect, useRef } from 'react';
import './AdminDashboard.css';
import CreateExam from '../CreateExam/CreateExam';
import EditExamModal from "./EditExamModal";
import { API_BASE_URL, getAuthHeaders } from '../../config/api';

const AdminDashboard = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [exams, setExams] = useState([]);
  const [users, setUsers] = useState([]);
  const [editingExam, setEditingExam] = useState(null);
  const [trackedJobs, setTrackedJobs] = useState([]);
  const [jobNotice, setJobNotice] = useState("");
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
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => { setActiveTab('users'); fetchUsers(); }}>
          👥 Quản Lý User
        </button>
      </div>

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

              <div className="color-card card-cyan">
                <div className="card-icon">✅</div>
                <div className="card-info">
                  <h3>0</h3>
                  <p>Bài Tập Hoàn Thành</p>
                </div>
              </div>

              <div className="color-card card-yellow">
                <div className="card-icon">📊</div>
                <div className="card-info">
                  <h3>124</h3>
                  <p>Lượt Truy Cập</p>
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

        {/* CÁC TAB KHÁC GIỮ NGUYÊN LOGIC */}
        {activeTab === 'createExam' && <div className="tab-section"><CreateExam currentUser={currentUser} onJobStarted={handleJobStarted} /></div>}

        {activeTab === 'manageExams' && (
          <div className="tab-section">
            <h2 style={{color: '#5b51d8'}}>Danh sách Đề thi</h2>

            {/* TIẾN ĐỘ XỬ LÝ AI - hiển thị trong tab quản lý đề */}
            {trackedJobs.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ color: '#475569', fontSize: '14px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⚙️ Tiến độ xử lý AI
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

      {jobNotice && (
        <div className="admin-job-toast">
          {jobNotice}
        </div>
      )}



    </div>
  );
};

export default AdminDashboard;
