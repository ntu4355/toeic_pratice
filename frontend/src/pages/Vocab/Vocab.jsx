import { useState, useEffect, useRef } from "react";
import "./Vocab.css";

const Vocab = () => {
  // Lấy dữ liệu thẻ từ vựng từ localStorage
  const [vocabList, setVocabList] = useState(() => {
    const savedVocab = localStorage.getItem("toeic_vocab");
    return savedVocab ? JSON.parse(savedVocab) : [];
  });

  const [english, setEnglish] = useState("");
  const [vietnamese, setVietnamese] = useState("");
  
  // State cho Flashcard 3D
  const [flippedCards, setFlippedCards] = useState({});

  // States cho tính năng Auto-complete (Gợi ý từ tiếng Anh)
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef(null);

  // States cho tính năng Gợi ý nghĩa (Dịch sang tiếng Việt)
  const [viSuggestion, setViSuggestion] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);

  // Lưu vocabList vào localStorage mỗi khi có thay đổi
  useEffect(() => {
    localStorage.setItem("toeic_vocab", JSON.stringify(vocabList));
  }, [vocabList]);

  // Effect gọi Datamuse API khi đang gõ tiếng Anh
  useEffect(() => {
    if (!english.trim()) {
      setSuggestions([]);
      setViSuggestion(""); // Xóa gợi ý tiếng Việt nếu ô tiếng Anh trống
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const response = await fetch(`https://api.datamuse.com/sug?s=${english}&max=5`);
        const data = await response.json();
        setSuggestions(data);
      } catch (error) {
        console.error("Lỗi khi tải gợi ý từ vựng:", error);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchSuggestions();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [english]);

  // Đóng dropdown tiếng Anh khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Hàm gọi API Google Translate để dịch từ tiếng Anh sang tiếng Việt (Đã Fix Lỗi)
  const fetchTranslation = async (wordToTranslate) => {
    if (!wordToTranslate) return;
    setIsTranslating(true);
    setViSuggestion("");
    
    try {
      // Sử dụng Google Translate API (nhanh và chính xác hơn)
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(wordToTranslate)}`
      );
      const data = await response.json();
      
      // Dữ liệu Google trả về nằm trong data[0][0][0]
      if (data && data[0] && data[0][0] && data[0][0][0]) {
        const translatedText = data[0][0][0];
        
        // Kiểm tra: Nếu bản dịch y hệt từ gốc thì coi như không tìm thấy nghĩa
        if (translatedText.toLowerCase() !== wordToTranslate.toLowerCase()) {
          setViSuggestion(translatedText.toLowerCase());
        } else {
          setViSuggestion("Không tìm thấy nghĩa chuẩn");
        }
      }
    } catch (error) {
      console.error("Lỗi khi dịch từ:", error);
      setViSuggestion("Lỗi kết nối từ điển");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleAddWord = (e) => {
    e.preventDefault();
    if (english.trim() && vietnamese.trim()) {
      setVocabList([
        { english: english.trim(), vietnamese: vietnamese.trim() },
        ...vocabList,
      ]);
      // Reset toàn bộ form sau khi thêm thành công
      setEnglish("");
      setVietnamese("");
      setViSuggestion("");
      setFlippedCards({}); 
      setShowSuggestions(false);
    }
  };

  // Khi chọn một từ tiếng Anh từ gợi ý xổ xuống
  const handleSelectSuggestion = (word) => {
    setEnglish(word);
    setShowSuggestions(false);
    
    // Tự động dịch từ đó sang tiếng Việt bằng Google Translate
    fetchTranslation(word);
    
    // Đưa con trỏ chuột sang ô tiếng Việt
    document.getElementById("vietnamese").focus();
  };

  const handleDeleteWord = (e, index) => {
    e.stopPropagation();
    setVocabList(vocabList.filter((_, i) => i !== index));
  };

  const toggleFlip = (index) => {
    setFlippedCards((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  return (
    <section className="vocab-page">
      <div className="vocab-container">
        <h1>Thẻ Từ Vựng TOEIC</h1>

        <form className="vocab-form" onSubmit={handleAddWord}>
          <div className="form-group">
            <label htmlFor="english">Từ tiếng Anh</label>
            <div className="input-wrapper" ref={dropdownRef}>
              <input
                type="text"
                id="english"
                value={english}
                onChange={(e) => {
                  setEnglish(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  // Tự động dịch nếu người dùng tự gõ tay xong và chuyển sang ô khác
                  if (english.trim() && !showSuggestions) fetchTranslation(english.trim());
                }}
                placeholder="Nhập từ tiếng Anh (VD: accom...)"
                required
                autoComplete="off"
              />
              {/* Menu xổ xuống gợi ý từ tiếng Anh */}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="autocomplete-dropdown">
                  {suggestions.map((item, index) => (
                    <li 
                      key={index} 
                      className="autocomplete-item"
                      onClick={() => handleSelectSuggestion(item.word)}
                    >
                      <span className="autocomplete-icon">🔍</span>
                      {item.word}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
            {/* Vùng hiển thị gợi ý nghĩa tiếng Việt */}
            {isTranslating && <div className="translate-loading">⏳ Đang tìm nghĩa tiếng Việt...</div>}
            {!isTranslating && viSuggestion && viSuggestion !== "Không tìm thấy nghĩa chuẩn" && viSuggestion !== "Lỗi kết nối từ điển" && (
              <div className="translation-suggestion">
                <span>💡 Gợi ý nghĩa:</span>
                <span 
                  className="translate-chip"
                  onClick={() => setVietnamese(viSuggestion)}
                  title="Bấm để dùng nghĩa này"
                >
                  {viSuggestion} ✍️
                </span>
              </div>
            )}
            {!isTranslating && (viSuggestion === "Không tìm thấy nghĩa chuẩn" || viSuggestion === "Lỗi kết nối từ điển") && (
              <div className="translation-suggestion" style={{color: '#dc3545'}}>
                <span>⚠️ {viSuggestion}. Vui lòng tự nhập nghĩa!</span>
              </div>
            )}
          </div>
          <button type="submit" className="add-btn">
            Tạo thẻ từ vựng
          </button>
        </form>

        <div className="vocab-list">
          <div className="vocab-header">
            <h2>Hộp thẻ ôn tập ({vocabList.length} từ)</h2>
          </div>
          
          {vocabList.length === 0 ? (
            <p className="empty-message">
              Bạn chưa có từ vựng nào. Hãy thêm từ đầu tiên để tạo Flashcard!
            </p>
          ) : (
            <div className="vocab-cards-grid">
              {vocabList.map((word, index) => (
                <div 
                  key={index} 
                  className={`vocab-card ${flippedCards[index] ? "flipped" : ""}`}
                  onClick={() => toggleFlip(index)}
                >
                  <div className="vocab-card-inner">
                    <div className="vocab-card-front">
                      <h3>{word.english}</h3>
                      <p className="flip-hint">👆 Chạm để xem nghĩa</p>
                      <button className="delete-card-btn" onClick={(e) => handleDeleteWord(e, index)}>✕</button>
                    </div>
                    <div className="vocab-card-back">
                      <h3>{word.vietnamese}</h3>
                      <p className="flip-hint">👆 Chạm để quay lại</p>
                      <button className="delete-card-btn" onClick={(e) => handleDeleteWord(e, index)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Vocab;