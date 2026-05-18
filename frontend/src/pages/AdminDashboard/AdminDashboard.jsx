import React, { useState, useEffect } from 'react';
import './AdminDashboard.css';
import CreateExam from '../CreateExam/CreateExam';
import EditExamModal from "./EditExamModal";

const AdminDashboard = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [exams, setExams] = useState([]);
  const [users, setUsers] = useState([]);
  const [editingExam, setEditingExam] = useState(null);

  // Kéo dữ liệu đề thi từ MongoDB
  const fetchExams = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/exams');
      const data = await response.json();
      setExams(data);
    } catch (error) {
      console.error("Lỗi khi tải danh sách đề thi:", error);
    }
  };
  
  // LOGIC MỚI: Kéo dữ liệu người dùng từ MongoDB (Thay thế localStorage)
  const fetchUsers = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/users');
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error("Lỗi khi tải danh sách người dùng:", error);
    }
  };

  useEffect(() => {
    fetchExams();
    fetchUsers(); // Gọi thẳng lên Backend để lấy User thật
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
        const response = await fetch(`http://localhost:5000/api/exams/${id}`, { method: 'DELETE' });
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
          <p>Chào mừng, {currentUser?.name || "Admin TOEIC"}</p>
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
        {activeTab === 'createExam' && <div className="tab-section"><CreateExam /></div>}

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
                      <td><span className="badge-blue">{exam.questions?.length || 0} câu</span></td>
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
        />
      )}

    </div>
  );
};

export default AdminDashboard;