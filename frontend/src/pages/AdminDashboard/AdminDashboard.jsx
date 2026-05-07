import "./AdminDashboard.css";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CreateExam from "../CreateExam/CreateExam";

const AdminDashboard = ({ currentUser }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  
  // State lưu dữ liệu thực tế
  const [exams, setExams] = useState([]);
  const [users, setUsers] = useState([]);

  // State quản lý việc Edit đề thi
  const [editingExam, setEditingExam] = useState(null);

  // Kéo dữ liệu từ localStorage mỗi khi chuyển tab
  useEffect(() => {
    if (activeTab === "overview" || activeTab === "manage") {
      const storedExams = JSON.parse(localStorage.getItem("toeic_exams") || "[]");
      setExams(storedExams);
    }
    if (activeTab === "users") {
      const storedUsers = JSON.parse(localStorage.getItem("toeic_users") || "[]");
      setUsers(storedUsers);
    }
  }, [activeTab]);

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="access-denied">
        <div className="denied-content">
          <h2>🔒 Truy cập bị từ chối</h2>
          <p>Chỉ admin mới có thể truy cập trang này.</p>
          <button className="btn-home" onClick={() => navigate("/")}>
            ← Quay lại trang chủ
          </button>
        </div>
      </div>
    );
  }

  // ==== CÁC HÀM XỬ LÝ QUẢN LÝ ĐỀ THI ====

  // Xóa đề thi
  const handleDeleteExam = (id) => {
    const isConfirm = window.confirm("Bạn có chắc chắn muốn xóa đề thi này không? Hành động này không thể hoàn tác.");
    if (isConfirm) {
      // Lọc bỏ đề thi có id trùng khớp
      const updatedExams = exams.filter((exam) => exam.id !== id);
      setExams(updatedExams);
      // Lưu lại vào localStorage
      localStorage.setItem("toeic_exams", JSON.stringify(updatedExams));
    }
  };

  // Mở modal sửa đề
  const handleEditClick = (exam) => {
    setEditingExam(exam);
  };

  // Xử lý thay đổi dữ liệu trong form sửa
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditingExam((prev) => ({
      ...prev,
      [name]: name === "duration" || name === "parts" ? parseInt(value) || 0 : value,
    }));
  };

  // Lưu đề thi đã sửa
  const handleSaveEdit = (e) => {
    e.preventDefault();
    // Tính lại số câu hỏi dựa trên số parts
    const questionsCount = editingExam.parts === 7 ? 200 : 100;
    const finalUpdatedExam = { ...editingExam, questions: questionsCount };

    // Cập nhật lại mảng exams
    const updatedExams = exams.map((exam) =>
      exam.id === editingExam.id ? finalUpdatedExam : exam
    );

    setExams(updatedExams);
    localStorage.setItem("toeic_exams", JSON.stringify(updatedExams));
    setEditingExam(null); // Đóng modal
    alert("Đã cập nhật thông tin đề thi thành công!");
  };

  // ======================================

  const stats = [
    { id: 1, title: "Tổng Đề Thi", value: exams.length, icon: "📋", color: "blue" },
    { id: 2, title: "Người Dùng", value: users.length > 0 ? users.length : 2, icon: "👥", color: "green" },
    { id: 3, title: "Bài Tập Hoàn Thành", value: 0, icon: "✅", color: "purple" },
    { id: 4, title: "Lượt Truy Cập", value: 124, icon: "📊", color: "orange" },
  ];

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <div className="admin-header-content">
          <h1>👨‍💼 Admin Dashboard</h1>
          <p>Chào mừng, {currentUser.fullName}</p>
        </div>
      </div>

      <div className="dashboard-container">
        <div className="dashboard-tabs">
          <button className={`tab-btn ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>📊 Tổng Quan</button>
          <button className={`tab-btn ${activeTab === "create" ? "active" : ""}`} onClick={() => setActiveTab("create")}>➕ Tạo Đề Thi</button>
          <button className={`tab-btn ${activeTab === "manage" ? "active" : ""}`} onClick={() => setActiveTab("manage")}>📝 Quản Lý Đề</button>
          <button className={`tab-btn ${activeTab === "users" ? "active" : ""}`} onClick={() => setActiveTab("users")}>👥 Quản Lý User</button>
        </div>

        <div className="dashboard-content">
          {/* TAB TỔNG QUAN */}
          {activeTab === "overview" && (
            <div className="overview-section">
              <div className="stats-grid">
                {stats.map((stat) => (
                  <div key={stat.id} className={`stat-card stat-${stat.color}`}>
                    <div className="stat-icon">{stat.icon}</div>
                    <div className="stat-info">
                      <h3>{stat.value}</h3>
                      <p>{stat.title}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="overview-grid">
                <div className="overview-box">
                  <h3>📋 Đề Thi Gần Đây</h3>
                  <div className="exams-list">
                    {exams.slice(0, 5).map((exam) => (
                      <div key={exam.id} className="exam-row">
                        <div className="exam-info">
                          <p className="exam-name">{exam.name}</p>
                          <span className="exam-meta">{exam.parts} phần | {exam.questions} câu</span>
                        </div>
                        <span className="exam-date">{exam.created || "Mới"}</span>
                      </div>
                    ))}
                    {exams.length === 0 && <p style={{color: '#666'}}>Chưa có đề thi nào.</p>}
                  </div>
                </div>

                <div className="overview-box">
                  <h3>📈 Thống Kê Hôm Nay</h3>
                  <div className="stats-list">
                    <div className="stat-item"><span>User mới:</span><strong>{users.length}</strong></div>
                    <div className="stat-item"><span>Đề thi mới:</span><strong>{exams.length}</strong></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB TẠO ĐỀ THI */}
          {activeTab === "create" && (
            <div className="create-section">
              <CreateExam currentUser={currentUser} />
            </div>
          )}

          {/* TAB QUẢN LÝ ĐỀ THI */}
          {activeTab === "manage" && (
            <div className="manage-section">
              <div className="manage-header">
                <h2>Quản Lý Đề Thi</h2>
                <button className="btn-add" onClick={() => setActiveTab("create")}>+ Thêm Đề</button>
              </div>

              <table className="manage-table">
                <thead>
                  <tr>
                    <th>Tên Đề Thi</th>
                    <th>Part</th>
                    <th>Câu Hỏi</th>
                    <th>Thời gian</th>
                    <th>Ngày Tạo</th>
                    <th>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((exam) => (
                    <tr key={exam.id}>
                      <td>{exam.name}</td>
                      <td>{exam.parts}</td>
                      <td>{exam.questions}</td>
                      <td>{exam.duration} phút</td>
                      <td>{exam.created || "Mặc định"}</td>
                      <td className="actions">
                        <button className="btn-edit" onClick={() => handleEditClick(exam)}>✏️ Sửa</button>
                        <button className="btn-delete" onClick={() => handleDeleteExam(exam.id)}>🗑️ Xóa</button>
                      </td>
                    </tr>
                  ))}
                  {exams.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{textAlign: "center", padding: "20px"}}>Chưa có đề thi nào.</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* MODAL CHỈNH SỬA ĐỀ THI */}
              {editingExam && (
                <div className="modal-overlay">
                  <div className="modal-content">
                    <h3>Chỉnh Sửa Đề Thi</h3>
                    <form className="modal-form" onSubmit={handleSaveEdit}>
                      <div className="form-group">
                        <label>Tên Đề Thi</label>
                        <input
                          type="text"
                          name="name"
                          value={editingExam.name}
                          onChange={handleEditChange}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Thời gian (phút)</label>
                        <input
                          type="number"
                          name="duration"
                          value={editingExam.duration}
                          onChange={handleEditChange}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Số lượng Part</label>
                        <select
                          name="parts"
                          value={editingExam.parts}
                          onChange={handleEditChange}
                        >
                          <option value="7">7 Parts (200 câu)</option>
                          <option value="4">4 Parts (100 câu)</option>
                          <option value="3">3 Parts (100 câu)</option>
                        </select>
                      </div>
                      
                      <div className="modal-actions">
                        <button type="button" className="btn-cancel-modal" onClick={() => setEditingExam(null)}>
                          Hủy
                        </button>
                        <button type="submit" className="btn-save-modal">
                          Lưu Thay Đổi
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB QUẢN LÝ USER */}
          {activeTab === "users" && (
            <div className="users-section">
              <h2>Quản Lý Người Dùng</h2>
              <div className="users-list">
                {users.map((user, idx) => (
                   <div key={idx} className="user-card">
                   <div className="user-avatar">👤</div>
                   <div className="user-info">
                     <h4>{user.fullName}</h4>
                     <p>{user.email}</p>
                     <span className="user-role">{user.role}</span>
                   </div>
                   <button className="btn-action">⋮</button>
                 </div>
                ))}
                {users.length === 0 && <p>Chưa có dữ liệu người dùng.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;