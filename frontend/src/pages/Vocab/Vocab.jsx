import { useState } from "react";
import "./Vocab.css";

const Vocab = () => {
  const [vocabList, setVocabList] = useState([]);
  const [english, setEnglish] = useState("");
  const [vietnamese, setVietnamese] = useState("");

  const handleAddWord = (e) => {
    e.preventDefault();
    if (english.trim() && vietnamese.trim()) {
      setVocabList([
        ...vocabList,
        { english: english.trim(), vietnamese: vietnamese.trim() },
      ]);
      setEnglish("");
      setVietnamese("");
    }
  };

  const handleDeleteWord = (index) => {
    setVocabList(vocabList.filter((_, i) => i !== index));
  };

  return (
    <section className="vocab-page">
      <div className="vocab-container">
        <h1>Quản lý Từ vựng TOEIC</h1>

        <form className="vocab-form" onSubmit={handleAddWord}>
          <div className="form-group">
            <label htmlFor="english">Từ tiếng Anh</label>
            <input
              type="text"
              id="english"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              placeholder="Nhập từ tiếng Anh..."
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="vietnamese">Nghĩa tiếng Việt</label>
            <input
              type="text"
              id="vietnamese"
              value={vietnamese}
              onChange={(e) => setVietnamese(e.target.value)}
              placeholder="Nhập nghĩa tiếng Việt..."
              required
            />
          </div>
          <button type="submit" className="add-btn">
            Thêm từ
          </button>
        </form>

        <div className="vocab-list">
          <h2>Danh sách từ vựng ({vocabList.length})</h2>
          {vocabList.length === 0 ? (
            <p className="empty-message">
              Chưa có từ vựng nào. Hãy thêm từ đầu tiên!
            </p>
          ) : (
            <table className="vocab-table">
              <thead>
                <tr>
                  <th>Từ tiếng Anh</th>
                  <th>Nghĩa tiếng Việt</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {vocabList.map((word, index) => (
                  <tr key={index}>
                    <td>{word.english}</td>
                    <td>{word.vietnamese}</td>
                    <td>
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteWord(index)}
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
};

export default Vocab;
