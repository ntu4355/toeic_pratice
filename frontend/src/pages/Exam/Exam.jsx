import "./Exam.css";

const exams = [
  {
    title: "Test 1",
    description1: "200 câu",
    description2: "7 part || 120 phút",
  },
  {
    title: "Test 2",
    description1: "200 câu",
    description2: "7 part || 120 phút",
  },
  {
    title: "Test 3",
    description1: "200 câu",
    description2: "7 part || 120 phút",
  },
  {
    title: "Test 4",
    description1: "200 câu",
    description2: "7 part || 120 phút",
  },
  {
    title: "Test 5",
    description1: "200 câu",
    description2: "7 part || 120 phút",
  },
  {
    title: "Test 6",
    description1: "200 câu",
    description2: "7 part || 120 phút",
  },
  {
    title: "Test 7",
    description1: "200 câu",
    description2: "7 part || 120 phút",
  },
  {
    title: "Test 8",
    description1: "200 câu",
    description2: "7 part || 120 phút",
  },
  {
    title: "Test 9",
    description1: "200 câu",
    description2: "7 part || 120 phút",
  },
  {
    title: "Test 10",
    description1: "200 câu",
    description2: "7 part || 120 phút",
  },
];

const Exam = () => {
  return (
    <div className="exam">
      <h1>Danh sách đề thi mẫu</h1>
      <div className="exam-list">
        {exams.map((exam, index) => (
          <article key={index} className="exam-item">
            <div>
              <h3>{exam.title}</h3>
              <p>{exam.description1}</p>
              <p>{exam.description2}</p>
            </div>
            <div>
              <button className="exam-link">Tham gia thi</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default Exam;
