import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const ExamHistory = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [debugMessage, setDebugMessage] = useState("");

  useEffect(() => {
    const userRaw = localStorage.getItem("currentUser");
    if (!userRaw) {
      setDebugMessage("Không tìm thấy trạng thái đăng nhập. Vui lòng thử đăng xuất và đăng nhập lại!");
      setLoading(false);
      return;
    }

    const user = JSON.parse(userRaw);
    const userId = user.id || user._id;

    if (!userId) {
      setDebugMessage("Dữ liệu tài khoản lỗi cấu trúc ID.");
      setLoading(false);
      return;
    }
    
    fetch(`http://localhost:5000/api/results/user/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        setHistory(data);
        setLoading(false);
      })
      .catch((err) => {
        setDebugMessage("Lỗi kết nối máy chủ dữ liệu Backend.");
        setLoading(false);
      });
  }, []);

  const handleReviewExam = (item) => {
     navigate("/taking-exam", {
        state: {
           examId: item.examId,
           userAnswers: item.userAnswers || {}, 
           timeSpent: item.timeSpent,
           isReviewMode: true,
           scoreInfo: {
              correctL: item.correctListening,
              wrongL: 100 - item.correctListening, 
              scoreL: item.scoreListening,
              correctR: item.correctReading,
              wrongR: 100 - item.correctReading,
              scoreR: item.scoreReading,
              totalScore: item.totalScore,
              timeSpent: item.timeSpent
           }
        }
     });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '15px' }}>
         <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #4f46e5', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
         <span style={{ color: '#64748b', fontSize: '15px', fontWeight: '500' }}>Đang kết nối két sắt dữ liệu lịch sử bài thi...</span>
         <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1050px", margin: "40px auto", padding: "30px", background: "#ffffff", borderRadius: "16px", boxShadow: "0 10px 30px rgba(0,0,0,0.04)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '25px', borderBottom: '2px solid #f1f5f9', paddingBottom: '15px' }}>
         <div style={{ fontSize: '28px' }}>📈</div>
         <div>
            <h2 style={{ margin: 0, color: "#1e3a8a", fontSize: "24px", fontWeight: "800" }}>Lịch Sử Luyện Thi Cá Nhân</h2>
            <p style={{ margin: "4px 0 0 0", fontSize: "13.5px", color: "#64748b" }}>Xem lại điểm số, đáp án chi tiết và giải thích để ngày càng tiến bộ hơn</p>
         </div>
      </div>
      
      {debugMessage && (
        <div style={{ padding: "15px", background: "#fef2f2", border: "1px dashed #fca5a5", color: "#991b1b", borderRadius: "8px", marginBottom: "20px", fontSize: "14px" }}>
          ⚠️ <strong>Hệ thống báo lỗi:</strong> {debugMessage}
        </div>
      )}

      {history.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#64748b", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #cbd5e1" }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>📝</div>
          <p style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#475569" }}>Kho lịch sử của bạn đang trống!</p>
          <p style={{ margin: "5px 0 0 0", fontSize: "14px", color: "#94a3b8" }}>Hãy chọn một đề thi bất kỳ tại trang "Thi thử" và bấm hoàn thành nộp bài để xem điểm nhé.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: "12px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.01), 0 2px 4px -1px rgba(0,0,0,0.01)", border: "1px solid #e2e8f0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: '15px' }}>
            <thead>
              <tr style={{ background: "#f8fafc", color: "#475569", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "16px 20px", fontWeight: "700" }}>Ngày làm bài</th>
                <th style={{ padding: "16px 20px", fontWeight: "700" }}>Tên Đề thi</th>
                <th style={{ padding: "16px 20px", fontWeight: "700", color: "#2563eb" }}>🎧 Điểm Nghe</th>
                <th style={{ padding: "16px 20px", fontWeight: "700", color: "#16a34a" }}>📖 Điểm Đọc</th>
                <th style={{ padding: "16px 20px", fontWeight: "700", color: "#ca8a04" }}>🏆 Tổng Điểm</th>
                <th style={{ padding: "16px 20px", fontWeight: "700" }}>Thời gian</th>
                <th style={{ padding: "16px 20px", textAlign: "center", fontWeight: "700" }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item, idx) => (
                <tr key={item._id} style={{ borderBottom: "1px solid #f1f5f9", background: idx % 2 === 0 ? "#fff" : "#fbfcfd" }} className="history-row">
                  <td style={{ padding: "16px 20px", color: "#64748b", fontSize: '14px' }}>
                    {new Date(item.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td style={{ padding: "16px 20px", fontWeight: "700", color: "#1e293b" }}>{item.examName}</td>
                  <td style={{ padding: "16px 20px", color: "#2563eb", fontWeight: "700", fontSize: '16px' }}>{item.scoreListening}</td>
                  <td style={{ padding: "16px 20px", color: "#16a34a", fontWeight: "700", fontSize: '16px' }}>{item.scoreReading}</td>
                  <td style={{ padding: "16px 20px" }}>
                     <span style={{ display: 'inline-block', padding: '4px 10px', background: '#fef9c3', color: '#a16207', borderRadius: '20px', fontWeight: "800", fontSize: "16px" }}>
                        {item.totalScore}
                     </span>
                  </td>
                  <td style={{ padding: "16px 20px", color: "#475569", fontSize: '14px' }}>
                    ⏱ {Math.floor(item.timeSpent / 60)}p {item.timeSpent % 60}s
                  </td>
                  <td style={{ padding: "16px 20px", textAlign: "center" }}>
                     <button 
                        onClick={() => handleReviewExam(item)}
                        style={{ padding: "8px 16px", background: "linear-gradient(135deg, #4f46e5, #3730a3)", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13.5px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 12px rgba(79,70,229,0.2)", transition: 'transform 0.1s ease' }}
                        onMouseEnter={(e) => e.target.style.transform = 'scale(1.03)'}
                        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                     >
                        🔍 Xem lại đáp án
                     </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExamHistory;