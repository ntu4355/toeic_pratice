import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../../config/api";
import heroImage from "../../assets/hero.png";
import "./Home.css";

const learningTracks = [
  {
    title: "Listening",
    range: "Part 1-4",
    detail: "Nghe tranh, hỏi đáp, hội thoại và bài nói ngắn.",
    tone: "blue",
  },
  {
    title: "Reading",
    range: "Part 5-7",
    detail: "Ngữ pháp, điền câu và đọc hiểu nhiều đoạn.",
    tone: "indigo",
  },
  {
    title: "Vocabulary",
    range: "Từ vựng",
    detail: "Lưu từ mới, luyện nghĩa và kiểm tra lại nhanh.",
    tone: "cyan",
  },
];

const formatDate = (value) => {
  if (!value) return "Mới cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Mới cập nhật";
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const Home = ({ currentUser }) => {
  const [exams, setExams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const fetchExams = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/exams`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Không thể tải danh sách đề thi.");
        }

        if (isMounted) setExams(Array.isArray(data) ? data : []);
      } catch (fetchError) {
        if (isMounted) setError(fetchError.message || "Không thể tải danh sách đề thi.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchExams();

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const totalQuestions = exams.reduce(
      (sum, exam) => sum + Number(exam.questionCount || exam.questions?.length || 0),
      0,
    );

    return [
      { label: "Đề thi", value: exams.length || "--" },
      { label: "Câu hỏi", value: totalQuestions || "--" },
      { label: "Thời lượng", value: "120p" },
      { label: "Kỹ năng", value: "L&R" },
    ];
  }, [exams]);

  const latestExams = exams.slice(0, 4);

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero-content">
          <span className="home-kicker">TOEIC practice workspace</span>
          <h1>Luyện TOEIC thông minh hơn, rõ tiến độ hơn.</h1>
          <p>
            Chọn đề, luyện từng phần và theo dõi kết quả trong một không gian học tập gọn gàng.
          </p>

          <div className="home-actions">
            <Link className="home-action home-action--primary" to="/exam">
              Làm đề thi thử
            </Link>
            <Link className="home-action home-action--secondary" to="/vocab">
              Ôn từ vựng
            </Link>
            {currentUser?.role === "user" && (
              <Link className="home-action home-action--ghost" to="/history">
                Lịch sử thi
              </Link>
            )}
          </div>
        </div>

        <div className="home-hero-visual" aria-hidden="true">
          <div className="home-score-panel">
            <div>
              <span className="home-panel-label">Target score</span>
              <strong>750+</strong>
            </div>
            <div className="home-panel-grid">
              <span>Listening</span>
              <b>495</b>
              <span>Reading</span>
              <b>495</b>
            </div>
          </div>
          <img src={heroImage} alt="" className="home-hero-image" />
        </div>
      </section>

      <section className="home-stats" aria-label="Thống kê nhanh">
        {stats.map((item) => (
          <div className="home-stat" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section className="home-section home-section--exams">
        <div className="home-section-heading">
          <div>
            <span className="home-section-eyebrow">Practice tests</span>
            <h2>Đề thi mới nhất</h2>
          </div>
          <Link className="home-text-link" to="/exam">
            Xem tất cả
          </Link>
        </div>

        {isLoading ? (
          <div className="home-exam-grid">
            {[1, 2, 3, 4].map((item) => (
              <div className="home-exam-card home-exam-card--loading" key={item} />
            ))}
          </div>
        ) : error ? (
          <div className="home-empty-state">{error}</div>
        ) : latestExams.length === 0 ? (
          <div className="home-empty-state">Chưa có đề thi nào trong hệ thống.</div>
        ) : (
          <div className="home-exam-grid">
            {latestExams.map((exam) => (
              <article className="home-exam-card" key={exam._id || exam.id}>
                <div>
                  <span className="home-exam-date">{formatDate(exam.createdAt)}</span>
                  <h3>{exam.name}</h3>
                </div>
                <div className="home-exam-meta">
                  <span>{exam.duration || 120} phút</span>
                  <span>{exam.questionCount ?? exam.questions?.length ?? 0} câu</span>
                </div>
                <Link className="home-exam-button" to="/exam">
                  Bắt đầu
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="home-section">
        <div className="home-section-heading">
          <div>
            <span className="home-section-eyebrow">Study plan</span>
            <h2>Lộ trình luyện tập</h2>
          </div>
        </div>

        <div className="home-track-grid">
          {learningTracks.map((track) => (
            <article className={`home-track-card home-track-card--${track.tone}`} key={track.title}>
              <span>{track.range}</span>
              <h3>{track.title}</h3>
              <p>{track.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
};

export default Home;
