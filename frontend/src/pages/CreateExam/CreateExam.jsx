import "./CreateExam.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const CreateExam = ({ currentUser }) => {
  const navigate = useNavigate();

  // Kiểm tra quyền admin
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
  const [examData, setExamData] = useState({
    name: "",
    description: "",
    parts: [],
  });

  const [currentPart, setCurrentPart] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);

  const addPart = () => {
    const newPart = {
      id: Date.now(),
      title: `Part ${examData.parts.length + 1}`,
      questions: [],
    };
    setExamData({
      ...examData,
      parts: [...examData.parts, newPart],
    });
  };

  const deletePart = (partId) => {
    setExamData({
      ...examData,
      parts: examData.parts.filter((p) => p.id !== partId),
    });
    setCurrentPart(null);
  };

  const addQuestion = (partId) => {
    const updatedParts = examData.parts.map((part) => {
      if (part.id === partId) {
        return {
          ...part,
          questions: [
            ...part.questions,
            {
              id: Date.now(),
              content: "",
              options: [
                { id: 1, text: "" },
                { id: 2, text: "" },
                { id: 3, text: "" },
                { id: 4, text: "" },
              ],
              correctAnswer: 1,
            },
          ],
        };
      }
      return part;
    });
    setExamData({ ...examData, parts: updatedParts });
  };

  const deleteQuestion = (partId, questionId) => {
    const updatedParts = examData.parts.map((part) => {
      if (part.id === partId) {
        return {
          ...part,
          questions: part.questions.filter((q) => q.id !== questionId),
        };
      }
      return part;
    });
    setExamData({ ...examData, parts: updatedParts });
    setCurrentQuestion(null);
  };

  const updateQuestion = (partId, questionId, field, value) => {
    const updatedParts = examData.parts.map((part) => {
      if (part.id === partId) {
        return {
          ...part,
          questions: part.questions.map((q) => {
            if (q.id === questionId) {
              return { ...q, [field]: value };
            }
            return q;
          }),
        };
      }
      return part;
    });
    setExamData({ ...examData, parts: updatedParts });
  };

  const updateOption = (partId, questionId, optionId, text) => {
    const updatedParts = examData.parts.map((part) => {
      if (part.id === partId) {
        return {
          ...part,
          questions: part.questions.map((q) => {
            if (q.id === questionId) {
              return {
                ...q,
                options: q.options.map((opt) => {
                  if (opt.id === optionId) {
                    return { ...opt, text };
                  }
                  return opt;
                }),
              };
            }
            return q;
          }),
        };
      }
      return part;
    });
    setExamData({ ...examData, parts: updatedParts });
  };

  const handleSave = () => {
    if (!examData.name) {
      alert("Vui lòng nhập tên đề thi");
      return;
    }
    if (examData.parts.length === 0) {
      alert("Vui lòng thêm ít nhất 1 part");
      return;
    }
    console.log("Exam Data:", examData);
    alert("Đề thi đã được lưu thành công!");
  };

  const currentPartData = examData.parts.find((p) => p.id === currentPart);
  const currentQuestionData = currentPartData?.questions.find(
    (q) => q.id === currentQuestion
  );

  return (
    <div className="create-exam">
      <div className="create-exam-header">
        <h1>Tạo Đề Thi TOEIC</h1>
      </div>

      <div className="create-exam-container">
        <div className="exam-form-left">
          <div className="form-group">
            <label>Tên Đề Thi:</label>
            <input
              type="text"
              placeholder="Ví dụ: TOEIC Practice Test 1"
              value={examData.name}
              onChange={(e) =>
                setExamData({ ...examData, name: e.target.value })
              }
            />
          </div>

          <div className="form-group">
            <label>Mô Tả:</label>
            <textarea
              placeholder="Mô tả về đề thi..."
              rows="4"
              value={examData.description}
              onChange={(e) =>
                setExamData({ ...examData, description: e.target.value })
              }
            />
          </div>

          <div className="parts-section">
            <div className="section-header">
              <h3>Các Part ({examData.parts.length})</h3>
              <button className="add-btn" onClick={addPart}>
                + Thêm Part
              </button>
            </div>

            <div className="parts-list">
              {examData.parts.map((part) => (
                <div
                  key={part.id}
                  className={`part-item ${currentPart === part.id ? "active" : ""}`}
                  onClick={() => setCurrentPart(part.id)}
                >
                  <div className="part-item-header">
                    <h4>{part.title}</h4>
                    <span className="question-count">
                      {part.questions.length} câu
                    </span>
                  </div>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePart(part.id);
                    }}
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button className="save-btn" onClick={handleSave}>
              💾 Lưu Đề Thi
            </button>
          </div>
        </div>

        <div className="exam-form-right">
          {currentPartData ? (
            <div className="questions-editor">
              <div className="editor-header">
                <h3>{currentPartData.title}</h3>
                <button
                  className="add-btn"
                  onClick={() => addQuestion(currentPartData.id)}
                >
                  + Thêm Câu Hỏi
                </button>
              </div>

              <div className="questions-list">
                {currentPartData.questions.map((question) => (
                  <div
                    key={question.id}
                    className={`question-item ${
                      currentQuestion === question.id ? "active" : ""
                    }`}
                    onClick={() => setCurrentQuestion(question.id)}
                  >
                    <div className="question-preview">
                      <span className="q-number">
                        Câu {currentPartData.questions.indexOf(question) + 1}
                      </span>
                      <p className="q-text">
                        {question.content || "(Chưa có nội dung)"}
                      </p>
                    </div>
                    <button
                      className="delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteQuestion(currentPartData.id, question.id);
                      }}
                    >
                      Xóa
                    </button>
                  </div>
                ))}
              </div>

              {currentQuestionData && (
                <div className="question-editor">
                  <h4>Chỉnh Sửa Câu Hỏi</h4>

                  <div className="form-group">
                    <label>Nội Dung Câu Hỏi:</label>
                    <textarea
                      value={currentQuestionData.content}
                      onChange={(e) =>
                        updateQuestion(
                          currentPartData.id,
                          currentQuestion,
                          "content",
                          e.target.value
                        )
                      }
                      placeholder="Nhập câu hỏi..."
                      rows="4"
                    />
                  </div>

                  <div className="options-section">
                    <label>Đáp Án:</label>
                    {currentQuestionData.options.map((option, idx) => (
                      <div key={option.id} className="option-input">
                        <label className="option-label">
                          <input
                            type="radio"
                            name={`correct-${currentQuestion}`}
                            checked={
                              currentQuestionData.correctAnswer === option.id
                            }
                            onChange={() =>
                              updateQuestion(
                                currentPartData.id,
                                currentQuestion,
                                "correctAnswer",
                                option.id
                              )
                            }
                          />
                          <span className="option-letter">
                            {String.fromCharCode(65 + idx)}
                          </span>
                        </label>
                        <input
                          type="text"
                          value={option.text}
                          onChange={(e) =>
                            updateOption(
                              currentPartData.id,
                              currentQuestion,
                              option.id,
                              e.target.value
                            )
                          }
                          placeholder={`Đáp án ${String.fromCharCode(65 + idx)}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <p>Vui lòng chọn một part để bắt đầu chỉnh sửa câu hỏi</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateExam;
