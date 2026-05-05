import "./AdminDashboard.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateExam from "../CreateExam/CreateExam";

const AdminDashboard = ({ currentUser }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

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

  const stats = [
    {
      id: 1,
      title: "Tổng Đề Thi",
      value: 10,
      icon: "📋",
      color: "blue",
    },
    {
      id: 2,
      title: "Người Dùng",
      value: 45,
      icon: "👥",
      color: "green",
    },
    {
      id: 3,
      title: "Bài Tập Hoàn Thành",
      value: 320,
      icon: "✅",
      color: "purple",
    },
    {
      id: 4,
      title: "Lượt Truy Cập",
      value: 2580,
      icon: "📊",
      color: "orange",
    },
  ];

  const exams = [
    {
      id: 1,
      name: "TOEIC Practice Test 1",
      parts: 7,
      questions: 200,
      created: "2024-01-15",
    },
    {
      id: 2,
      name: "TOEIC Practice Test 2",
      parts: 7,
      questions: 200,
      created: "2024-01-20",
    },
    {
      id: 3,
      name: "TOEIC Practice Test 3",
      parts: 7,
      questions: 200,
      created: "2024-02-01",
    },
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
          <button
            className={`tab-btn ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            📊 Tổng Quan
          </button>
          <button
            className={`tab-btn ${activeTab === "create" ? "active" : ""}`}
            onClick={() => setActiveTab("create")}
          >
            ➕ Tạo Đề Thi
          </button>
          <button
            className={`tab-btn ${activeTab === "manage" ? "active" : ""}`}
            onClick={() => setActiveTab("manage")}
          >
            📝 Quản Lý Đề
          </button>
          <button
            className={`tab-btn ${activeTab === "users" ? "active" : ""}`}
            onClick={() => setActiveTab("users")}
          >
            👥 Quản Lý User
          </button>
        </div>

        <div className="dashboard-content">
          {activeTab === "overview" && (
            <div className="overview-section">
              <div className="stats-grid">
                {stats.map((stat) => (
                  <div
                    key={stat.id}
                    className={`stat-card stat-${stat.color}`}
                  >
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
                    {exams.map((exam) => (
                      <div key={exam.id} className="exam-row">
                        <div className="exam-info">
                          <p className="exam-name">{exam.name}</p>
                          <span className="exam-meta">
                            {exam.parts} phần | {exam.questions} câu
                          </span>
                        </div>
                        <span className="exam-date">{exam.created}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="overview-box">
                  <h3>📈 Thống Kê Hôm Nay</h3>
                  <div className="stats-list">
                    <div className="stat-item">
                      <span>User mới:</span>
                      <strong>5</strong>
                    </div>
                    <div className="stat-item">
                      <span>Bài tập hoàn thành:</span>
                      <strong>24</strong>
                    </div>
                    <div className="stat-item">
                      <span>Lượt truy cập:</span>
                      <strong>182</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "create" && (
            <div className="create-section">
              <CreateExam currentUser={currentUser} />
            </div>
          )}

          {activeTab === "manage" && (
            <div className="manage-section">
              <div className="manage-header">
                <h2>Quản Lý Đề Thi</h2>
                <button className="btn-add">+ Thêm Đề</button>
              </div>

              <table className="manage-table">
                <thead>
                  <tr>
                    <th>Tên Đề Thi</th>
                    <th>Part</th>
                    <th>Câu Hỏi</th>
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
                      <td>{exam.created}</td>
                      <td className="actions">
                        <button className="btn-edit">✏️ Sửa</button>
                        <button className="btn-delete">🗑️ Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "users" && (
            <div className="users-section">
              <h2>Quản Lý Người Dùng</h2>
              <div className="users-list">
                <div className="user-card">
                  <div className="user-avatar">👤</div>
                  <div className="user-info">
                    <h4>Nguyễn Văn A</h4>
                    <p>user1@toeic.com</p>
                    <span className="user-role">User</span>
                  </div>
                  <button className="btn-action">⋮</button>
                </div>

                <div className="user-card">
                  <div className="user-avatar">👤</div>
                  <div className="user-info">
                    <h4>Trần Thị B</h4>
                    <p>user2@toeic.com</p>
                    <span className="user-role">User</span>
                  </div>
                  <button className="btn-action">⋮</button>
                </div>

                <div className="user-card">
                  <div className="user-avatar">👤</div>
                  <div className="user-info">
                    <h4>Lê Văn C</h4>
                    <p>user3@toeic.com</p>
                    <span className="user-role">User</span>
                  </div>
                  <button className="btn-action">⋮</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
