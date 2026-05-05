import "./Announcement.css";

const announcements = [
  {
    title: "Thông báo",
    date: "23/12/2020",
    subtitle:
      "Thông báo về chương trình học bổng khuyến học, khuyến tài do ông Văn Phú Chính tài trợ",
  },
  {
    title: "Đợt thi tháng 12/2020",
    date: "16/12/2020",
    subtitle: "Lịch thi và danh sách phòng thi Chuẩn đầu ra Ngoại ngữ"
  },
  {
    title: "Lịch thi KTHP Tiếng Anh",
    date: "14/12/2020",
    subtitle: "Các lớp Tiếng Anh không chuyên và học lại yêu cầu",
  },
  {
    title: "Lịch thi KTHP Tiếng Anh",
    date: "14/12/2020",
    subtitle: "Các lớp Tiếng Anh không chuyên và học lại yêu cầu",
  },
];

const Announcement = () => {
  return (
    <section className="announcement-container">
      <div className="announcement-card announcement-card--list">
        <div className="announcement-header">
          <span className="announcement-badge">🌸</span>
          <div>
            <h2>Thông báo</h2>
          </div>
        </div>

        <div className="announcement-items">
          {announcements.map((item, index) => (
            <article key={index} className="announcement-item">
              <div>
                <h3 className="announcement-item-title">{item.title}</h3>
                <p className="announcement-item-subtitle">{item.subtitle}</p>
                <span className="announcement-date">📅 {item.date}</span>
              </div>
              <div className="announcement-item-meta">
                <button className="announcement-link">Xem chi tiết</button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="announcement-card announcement-card--detail">
        <div className="announcement-header">
          <span className="announcement-badge">🌸</span>
          <div>
            <h2 className="announcement-small-title">Thông báo thi TOEIC</h2>
          </div>
        </div>

        <div className="announcement-detail">
          <p className="announcement-detail-intro">
            KẾ HOẠCH TỔ CHỨC THI CẤP CHỨNG CHỈ TOEIC QUỐC TẾ (ĐỢT THI THÁNG
            5/2021)
          </p>
          <ul className="announcement-detail-list">
            <li>
              <strong>Đối tượng dự thi:</strong> Học viên, sinh viên của Trường
              có nhu cầu dự thi để được cấp chứng chỉ TOEIC quốc tế; các đối
              tượng khác có nhu cầu.
            </li>
            <li>
              <strong>Hình thức thi:</strong> Bài thi TOEIC hai kỹ năng trên máy
              tính: TOEIC Listening & Reading.
            </li>
            <li>
              <strong>Thời gian làm bài:</strong> 120 phút.
            </li>
            <li>
              <strong>Địa điểm thi:</strong> Trường ĐH Đông Á, 33 Xô Viết - Nghệ
              Tĩnh, Hải Châu, Đà Nẵng.
            </li>
          </ul>
          <button className="announcement-action">Đăng kí ngay!</button>
        </div>
      </div>
    </section>
  );
};

export default Announcement;
