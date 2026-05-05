import "./Exam.css";
import { useState } from "react";

const exams = [
  {
    id: 1,
    name: "Practice Set TOEIC 2019 Test 1",
    duration: 120,
    views: 516105,
    comments: 199,
    parts: 7,
    questions: 200,
    isCompleted: false,
  },
  {
    id: 2,
    name: "Practice Set TOEIC 2019 Test 2",
    duration: 120,
    views: 344940,
    comments: 127,
    parts: 7,
    questions: 200,
    isCompleted: false,
  },
  {
    id: 3,
    name: "Practice Set TOEIC 2019 Test 3",
    duration: 120,
    views: 287622,
    comments: 118,
    parts: 7,
    questions: 200,
    isCompleted: false,
  },
  {
    id: 4,
    name: "Practice Set TOEIC 2019 Test 4",
    duration: 120,
    views: 239673,
    comments: 125,
    parts: 7,
    questions: 200,
    isCompleted: false,
  },
  {
    id: 5,
    name: "Practice Set TOEIC 2019 Test 5",
    duration: 120,
    views: 228960,
    comments: 86,
    parts: 7,
    questions: 200,
    isCompleted: false,
  },
  {
    id: 6,
    name: "Practice Set TOEIC 2019 Test 6",
    duration: 120,
    views: 211206,
    comments: 73,
    parts: 7,
    questions: 200,
    isCompleted: true,
  },
  {
    id: 7,
    name: "Practice Set TOEIC 2019 Test 7",
    duration: 120,
    views: 196371,
    comments: 112,
    parts: 7,
    questions: 200,
    isCompleted: true,
  },
  {
    id: 8,
    name: "Practice Set TOEIC 2019 Test 8",
    duration: 120,
    views: 189390,
    comments: 77,
    parts: 7,
    questions: 200,
    isCompleted: false,
  },
  {
    id: 9,
    name: "Practice Set TOEIC 2019 Test 9",
    duration: 120,
    views: 183642,
    comments: 63,
    parts: 7,
    questions: 200,
    isCompleted: true,
  },
  {
    id: 10,
    name: "Practice Set TOEIC 2019 Test 10",
    duration: 120,
    views: 201678,
    comments: 111,
    parts: 7,
    questions: 200,
    isCompleted: true,
  },
];

const parts = [
  {
    id: 1,
    title: "Part 1",
    count: 6,
    tags: [
      "Tranh tả người",
      "Tranh tả vật",
      "Tranh tả cả người và vật",
    ],
  },
  {
    id: 2,
    title: "Part 2",
    count: 25,
    tags: ["Câu hỏi WHAT", "Câu hỏi WHO", "Câu hỏi WHY", "YES/NO"],
  },
  {
    id: 3,
    title: "Part 3",
    count: 39,
    tags: [
      "Câu hỏi về chủ đề, mục đích",
      "Câu hỏi về hành động tương lai",
      "Chủ đề: Company - General Office Work",
      "Transportation",
    ],
  },
  {
    id: 4,
    title: "Part 4",
    count: 30,
    tags: [
      "Câu hỏi về chủ đề, mục đích",
      "Dạng bài: Announcement",
      "Dạng bài: Talk",
    ],
  },
  {
    id: 5,
    title: "Part 5",
    count: 30,
    tags: ["Từ loại", "Ngữ pháp", "Vị trí từ trong câu"],
  },
  {
    id: 6,
    title: "Part 6",
    count: 16,
    tags: ["Hoàn thành đoạn văn", "Kết nối câu", "Từ nối"],
  },
  {
    id: 7,
    title: "Part 7",
    count: 54,
    tags: ["Single passage", "Multiple passages", "Matching"],
  },
];

const Exam = () => {
  const [selectedExam, setSelectedExam] = useState(null);
  const [selectedParts, setSelectedParts] = useState(() => new Set());

  const togglePart = (id) => {
    setSelectedParts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllParts = () => {
    setSelectedParts(new Set(parts.map((p) => p.id)));
  };

  const clearAllParts = () => setSelectedParts(new Set());

  const handleStart = () => {
    if (selectedParts.size === 0) {
      alert("Vui lòng chọn ít nhất 1 part để bắt đầu.");
      return;
    }
    const exam = exams.find((e) => e.id === selectedExam);
    const chosen = parts.filter((p) => selectedParts.has(p.id)).map((p) => p.title);
    alert(`Bắt đầu thi: ${exam.name}\nCác phần: ${chosen.join(", ")}`);
  };

  const handleBackToExams = () => {
    setSelectedExam(null);
    setSelectedParts(new Set());
  };

  return (
    <div className="exam">
      {selectedExam === null ? (
        <>
          <h1>Chọn đề thi TOEIC</h1>
          <div className="exams-grid">
            {exams.map((exam) => (
              <div key={exam.id} className="exam-card">
                <div className="exam-card-content">
                  <h3 className="exam-title">{exam.name}</h3>
                </div>
                <button
                  className={`exam-btn ${exam.isCompleted ? "completed" : ""}`}
                  onClick={() => setSelectedExam(exam.id)}
                >
                  {exam.isCompleted ? "Xem kết quả" : "Chi tiết"}
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="exam-header">
            <button className="back-btn" onClick={handleBackToExams}>
              ← Quay lại
            </button>
            <h1>Chọn phần muốn làm - {exams.find((e) => e.id === selectedExam)?.name}</h1>
          </div>

          <div className="exam-controls">
            <div className="controls-left">
              <button className="control-btn" onClick={selectAllParts}>Chọn tất cả</button>
              <button className="control-btn" onClick={clearAllParts}>Bỏ chọn</button>
            </div>
            <div className="controls-right">
              <button className="start-btn" onClick={handleStart}>
                Bắt đầu ({selectedParts.size})
              </button>
            </div>
          </div>

          <div className="parts-list">
            {parts.map((part) => (
              <section key={part.id} className="part">
                <label className="part-left">
                  <input
                    type="checkbox"
                    checked={selectedParts.has(part.id)}
                    onChange={() => togglePart(part.id)}
                  />
                </label>
                <div className="part-main">
                  <div className="part-header">
                    <h3>{part.title} ({part.count} câu)</h3>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Exam;
