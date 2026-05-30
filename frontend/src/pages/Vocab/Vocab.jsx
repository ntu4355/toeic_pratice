import { useEffect, useMemo, useRef, useState } from "react";
import "./Vocab.css";

const createId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const normalizeWordKey = (word) => (
  `${String(word.english || "").trim().toLowerCase()}::${String(word.vietnamese || "").trim().toLowerCase()}`
);

const createDefaultDeck = (wordIds = []) => ({
  id: createId(),
  name: "Bộ mặc định",
  description: "Nơi lưu nhanh các từ mới cần ôn.",
  wordIds,
  createdAt: new Date().toISOString(),
});

const normalizeSavedData = (data) => {
  if (data?.version === 2 && Array.isArray(data.wordBank) && Array.isArray(data.decks)) {
    return data;
  }

  const legacyWords = Array.isArray(data) ? data : [];
  const wordBank = legacyWords.map((word) => ({
    id: createId(),
    english: String(word.english || "").trim(),
    vietnamese: String(word.vietnamese || "").trim(),
    createdAt: new Date().toISOString(),
  })).filter((word) => word.english && word.vietnamese);

  return {
    version: 2,
    wordBank,
    decks: [createDefaultDeck(wordBank.map((word) => word.id))],
  };
};

const loadVocabWorkspace = (storageKey) => {
  try {
    const savedWorkspace = localStorage.getItem(storageKey);
    if (savedWorkspace) return normalizeSavedData(JSON.parse(savedWorkspace));

    const savedLegacyWords = localStorage.getItem("toeic_vocab");
    if (savedLegacyWords) return normalizeSavedData(JSON.parse(savedLegacyWords));
  } catch {
    return normalizeSavedData(null);
  }

  return {
    version: 2,
    wordBank: [],
    decks: [createDefaultDeck()],
  };
};

const Vocab = ({ currentUser }) => {
  const userKey = currentUser?.id || currentUser?._id || currentUser?.email || "guest";
  const storageKey = `toeic_vocab_workspace_${userKey}`;

  const [workspace, setWorkspace] = useState(() => loadVocabWorkspace(storageKey));
  const [activeDeckId, setActiveDeckId] = useState(() => workspace.decks[0]?.id || "");
  const [deckName, setDeckName] = useState("");
  const [deckDescription, setDeckDescription] = useState("");
  const [english, setEnglish] = useState("");
  const [vietnamese, setVietnamese] = useState("");
  const [selectedWordIds, setSelectedWordIds] = useState([]);
  const [targetDeckId, setTargetDeckId] = useState("");
  const [flippedCards, setFlippedCards] = useState({});
  
  // State học cho Tab Bộ thẻ
  const [studyIndex, setStudyIndex] = useState(0);
  const [isStudyFlipped, setIsStudyFlipped] = useState(false);

  // State học cho Tab Tổng quát (MỚI)
  const [overviewStudyIndex, setOverviewStudyIndex] = useState(0);
  const [isOverviewStudyFlipped, setIsOverviewStudyFlipped] = useState(false);

  const [mainTab, setMainTab] = useState("decks"); // "decks" | "overview"
  const [overviewSearch, setOverviewSearch] = useState("");
  const [overviewForm, setOverviewForm] = useState({ english: "", vietnamese: "" });
  // Gợi ý từ vựng cho form tổng quát
  const [ovSuggestions, setOvSuggestions] = useState([]);
  const [ovShowSuggestions, setOvShowSuggestions] = useState(false);
  const [ovViSuggestion, setOvViSuggestion] = useState("");
  const [ovIsTranslating, setOvIsTranslating] = useState(false);
  const ovDropdownRef = useRef(null);
  // Popup thêm vào bộ thẻ
  const [addToDeckWordId, setAddToDeckWordId] = useState(null);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef(null);

  const [viSuggestion, setViSuggestion] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(workspace));
  }, [storageKey, workspace]);

  useEffect(() => {
    const trimmedEnglish = english.trim();

    const timeoutId = setTimeout(async () => {
      if (!trimmedEnglish) {
        setSuggestions([]);
        setViSuggestion("");
        return;
      }

      try {
        const response = await fetch(`https://api.datamuse.com/sug?s=${trimmedEnglish}&max=5`);
        const data = await response.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Lỗi khi tải gợi ý từ vựng:", error);
      }
    }, trimmedEnglish ? 300 : 0);

    return () => clearTimeout(timeoutId);
  }, [english]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Effect gợi ý từ cho overview form
  useEffect(() => {
    const trimmed = overviewForm.english.trim();
    const tid = setTimeout(async () => {
      if (!trimmed) { setOvSuggestions([]); setOvViSuggestion(""); return; }
      try {
        const res = await fetch(`https://api.datamuse.com/sug?s=${trimmed}&max=5`);
        const data = await res.json();
        setOvSuggestions(Array.isArray(data) ? data : []);
      } catch { /* ignore */ }
    }, trimmed ? 300 : 0);
    return () => clearTimeout(tid);
  }, [overviewForm.english]);

  // Click outside overview dropdown
  useEffect(() => {
    const handler = (e) => { if (ovDropdownRef.current && !ovDropdownRef.current.contains(e.target)) setOvShowSuggestions(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchOvTranslation = async (word) => {
    if (!word) return;
    setOvIsTranslating(true); setOvViSuggestion("");
    try {
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(word)}`);
      const data = await res.json();
      const txt = data?.[0]?.[0]?.[0];
      setOvViSuggestion(txt && txt.toLowerCase() !== word.toLowerCase() ? txt.toLowerCase() : "Không tìm thấy nghĩa chuẩn");
    } catch { setOvViSuggestion("Lỗi kết nối từ điển"); }
    finally { setOvIsTranslating(false); }
  };

  const handleOvSelectSuggestion = (word) => {
    setOverviewForm(prev => ({ ...prev, english: word }));
    setOvShowSuggestions(false);
    void fetchOvTranslation(word);
  };

  const handleAddWordToDeck = (wordId, deckId) => {
    if (!deckId) return;
    setWorkspace(prev => ({
      ...prev,
      decks: prev.decks.map(deck =>
        deck.id === deckId && !deck.wordIds.includes(wordId)
          ? { ...deck, wordIds: [wordId, ...deck.wordIds] }
          : deck
      ),
    }));
    setAddToDeckWordId(null);
  };

  const activeDeck = useMemo(
    () => workspace.decks.find((deck) => deck.id === activeDeckId) || workspace.decks[0],
    [activeDeckId, workspace.decks],
  );

  const activeWords = useMemo(() => {
    const ids = new Set(activeDeck?.wordIds || []);
    return workspace.wordBank.filter((word) => ids.has(word.id));
  }, [activeDeck, workspace.wordBank]);

  const studyWord = activeWords[studyIndex] || null;

  const fetchTranslation = async (wordToTranslate) => {
    if (!wordToTranslate) return;
    setIsTranslating(true);
    setViSuggestion("");

    try {
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(wordToTranslate)}`,
      );
      const data = await response.json();
      const translatedText = data?.[0]?.[0]?.[0];

      if (translatedText && translatedText.toLowerCase() !== wordToTranslate.toLowerCase()) {
        setViSuggestion(translatedText.toLowerCase());
      } else {
        setViSuggestion("Không tìm thấy nghĩa chuẩn");
      }
    } catch (error) {
      console.error("Lỗi khi dịch từ:", error);
      setViSuggestion("Lỗi kết nối từ điển");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSelectSuggestion = (word) => {
    setEnglish(word);
    setShowSuggestions(false);
    void fetchTranslation(word);
    document.getElementById("vietnamese")?.focus();
  };

  const handleCreateDeck = (event) => {
    event.preventDefault();
    const trimmedName = deckName.trim();
    if (!trimmedName) return;

    const newDeck = {
      id: createId(),
      name: trimmedName,
      description: deckDescription.trim() || "Bộ thẻ tự tạo.",
      wordIds: [],
      createdAt: new Date().toISOString(),
    };

    setWorkspace((prev) => ({
      ...prev,
      decks: [newDeck, ...prev.decks],
    }));
    setActiveDeckId(newDeck.id);
    setTargetDeckId("");
    setDeckName("");
    setDeckDescription("");
    setSelectedWordIds([]);
    setStudyIndex(0);
    setIsStudyFlipped(false);
  };

  const handleDeleteDeck = (deckId) => {
    if (!deckId) return;
    if (workspace.decks.length <= 1) {
      alert("Bạn cần giữ lại ít nhất một bộ thẻ.");
      return;
    }

    if (!window.confirm("Xóa bộ thẻ này? Các từ trong kho từ vẫn được giữ lại.")) return;

    const remainingDecks = workspace.decks.filter((deck) => deck.id !== deckId);
    setWorkspace((prev) => ({
      ...prev,
      decks: prev.decks.filter((deck) => deck.id !== deckId),
    }));
    if (deckId === activeDeck?.id) {
      setActiveDeckId(remainingDecks[0]?.id || "");
    }
    setSelectedWordIds([]);
    setStudyIndex(0);
    setIsStudyFlipped(false);
  };

  const handleAddWord = (event) => {
    event.preventDefault();
    const trimmedEnglish = english.trim();
    const trimmedVietnamese = vietnamese.trim();
    if (!trimmedEnglish || !trimmedVietnamese || !activeDeck) return;

    const existingWord = workspace.wordBank.find((word) => (
      word.english.toLowerCase() === trimmedEnglish.toLowerCase()
      && word.vietnamese.toLowerCase() === trimmedVietnamese.toLowerCase()
    ));
    const wordId = existingWord?.id || createId();
    const newWord = existingWord || {
      id: wordId,
      english: trimmedEnglish,
      vietnamese: trimmedVietnamese,
      createdAt: new Date().toISOString(),
    };

    setWorkspace((prev) => ({
      ...prev,
      wordBank: existingWord ? prev.wordBank : [newWord, ...prev.wordBank],
      decks: prev.decks.map((deck) => {
        if (deck.id !== activeDeck.id || deck.wordIds.includes(wordId)) return deck;
        return { ...deck, wordIds: [wordId, ...deck.wordIds] };
      }),
    }));

    setEnglish("");
    setVietnamese("");
    setViSuggestion("");
    setShowSuggestions(false);
    setFlippedCards({});
  };

  const toggleSelectedWord = (wordId) => {
    setSelectedWordIds((prev) => (
      prev.includes(wordId) ? prev.filter((id) => id !== wordId) : [...prev, wordId]
    ));
  };

  const handleCopySelectedWords = () => {
    if (!targetDeckId || selectedWordIds.length === 0) return;

    setWorkspace((prev) => ({
      ...prev,
      decks: prev.decks.map((deck) => {
        if (deck.id !== targetDeckId) return deck;
        const mergedIds = Array.from(new Set([...selectedWordIds, ...deck.wordIds]));
        return { ...deck, wordIds: mergedIds };
      }),
    }));

    setSelectedWordIds([]);
    setTargetDeckId("");
  };

  const handleRemoveWordFromDeck = (event, wordId) => {
    event.stopPropagation();
    if (!activeDeck) return;

    setWorkspace((prev) => ({
      ...prev,
      decks: prev.decks.map((deck) => (
        deck.id === activeDeck.id
          ? { ...deck, wordIds: deck.wordIds.filter((id) => id !== wordId) }
          : deck
      )),
    }));
    setSelectedWordIds((prev) => prev.filter((id) => id !== wordId));
    setFlippedCards((prev) => ({ ...prev, [wordId]: false }));
  };

  const toggleFlip = (wordId) => {
    setFlippedCards((prev) => ({
      ...prev,
      [wordId]: !prev[wordId],
    }));
  };

  const goToStudyCard = (nextIndex) => {
    if (activeWords.length === 0) return;
    const normalizedIndex = (nextIndex + activeWords.length) % activeWords.length;
    setStudyIndex(normalizedIndex);
    setIsStudyFlipped(false);
  };

  // ── OVERVIEW HANDLERS ──────────────────────────────────────────────────────
  const filteredOverviewWords = useMemo(() => {
    const q = overviewSearch.trim().toLowerCase();
    if (!q) return workspace.wordBank.slice().sort((a, b) => a.english.localeCompare(b.english));
    return workspace.wordBank
      .filter(w => w.english.toLowerCase().includes(q) || w.vietnamese.toLowerCase().includes(q))
      .sort((a, b) => a.english.localeCompare(b.english));
  }, [workspace.wordBank, overviewSearch]);

  const handleOverviewAddWord = (e) => {
    e.preventDefault();
    const eng = overviewForm.english.trim();
    const viet = overviewForm.vietnamese.trim();
    if (!eng || !viet) return;
    const exists = workspace.wordBank.find(w =>
      w.english.toLowerCase() === eng.toLowerCase() &&
      w.vietnamese.toLowerCase() === viet.toLowerCase()
    );
    if (exists) { alert("Từ này đã tồn tại trong kho!"); return; }
    const newWord = { id: createId(), english: eng, vietnamese: viet, createdAt: new Date().toISOString() };
    setWorkspace(prev => ({ ...prev, wordBank: [newWord, ...prev.wordBank] }));
    setOverviewForm({ english: "", vietnamese: "" });
    setOvViSuggestion(""); setOvSuggestions([]);
  };

  const handleOverviewDeleteWord = (wordId) => {
    if (!window.confirm("Xóa từ này khỏi toàn bộ kho? Từ cũng sẽ bị xóa khỏi tất cả bộ thẻ.")) return;
    setWorkspace(prev => ({
      ...prev,
      wordBank: prev.wordBank.filter(w => w.id !== wordId),
      decks: prev.decks.map(deck => ({ ...deck, wordIds: deck.wordIds.filter(id => id !== wordId) })),
    }));
  };

  const goToOverviewStudyCard = (nextIndex) => {
    if (filteredOverviewWords.length === 0) return;
    const normalizedIndex = (nextIndex + filteredOverviewWords.length) % filteredOverviewWords.length;
    setOverviewStudyIndex(normalizedIndex);
    setIsOverviewStudyFlipped(false);
  };

  // Đảm bảo index học của Overview không bị vượt rào khi tìm kiếm
  const safeOverviewStudyIndex = Math.min(overviewStudyIndex, Math.max(0, filteredOverviewWords.length - 1));
  const overviewStudyWord = filteredOverviewWords[safeOverviewStudyIndex] || null;

  // ── GIAO DIỆN TAB TỔNG QUÁT (MỚI: DẠNG HỌC THẺ) ────────────────────────────────────────────────
  const overviewTab = mainTab === "overview" ? (
    <div className="overview-panel">
      {/* Thêm từ mới - CÓ GỢI Ý */}
      <div className="overview-add-card" style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: "0 0 14px", color: "#0f2f6d", fontSize: "15px", fontWeight: 800 }}>➕ Thêm từ mới vào kho chung</h3>
        <form onSubmit={handleOverviewAddWord}>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label>Từ tiếng Anh</label>
              <div className="input-wrapper" ref={ovDropdownRef}>
                <input
                  type="text" required placeholder="Nhập từ tiếng Anh"
                  value={overviewForm.english}
                  onChange={e => { setOverviewForm(prev => ({ ...prev, english: e.target.value })); setOvShowSuggestions(true); }}
                  onFocus={() => setOvShowSuggestions(true)}
                  onBlur={() => { if (overviewForm.english.trim()) void fetchOvTranslation(overviewForm.english.trim()); }}
                  autoComplete="off"
                />
                {ovShowSuggestions && ovSuggestions.length > 0 && (
                  <ul className="autocomplete-dropdown">
                    {ovSuggestions.map(item => (
                      <li key={item.word} className="autocomplete-item"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleOvSelectSuggestion(item.word)}>
                        {item.word}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>Nghĩa tiếng Việt</label>
              <input
                type="text" required placeholder="Nhập nghĩa tiếng Việt"
                value={overviewForm.vietnamese}
                onChange={e => setOverviewForm(prev => ({ ...prev, vietnamese: e.target.value }))}
              />
              {ovIsTranslating ? <div className="translate-loading">Đang tìm nghĩa tiếng Việt...</div> : null}
              {!ovIsTranslating && ovViSuggestion && ovViSuggestion !== "Không tìm thấy nghĩa chuẩn" && ovViSuggestion !== "Lỗi kết nối từ điển" && (
                <button type="button" className="translate-chip"
                  onClick={() => setOverviewForm(prev => ({ ...prev, vietnamese: ovViSuggestion }))}>
                  Dùng gợi ý: {ovViSuggestion}
                </button>
              )}
              {!ovIsTranslating && (ovViSuggestion === "Không tìm thấy nghĩa chuẩn" || ovViSuggestion === "Lỗi kết nối từ điển") && (
                <div className="translation-warning">{ovViSuggestion}. Vui lòng tự nhập nghĩa.</div>
              )}
            </div>
          </div>
          <button type="submit" className="overview-add-btn">Thêm vào kho</button>
        </form>
      </div>

      {/* Tìm kiếm */}
      <div style={{ position: "relative", marginBottom: "30px" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 16 }}>🔍</span>
        <input
          type="text"
          placeholder={`Tìm kiếm trong toàn bộ ${workspace.wordBank.length} từ...`}
          value={overviewSearch}
          onChange={e => {
            setOverviewSearch(e.target.value);
            setOverviewStudyIndex(0); // Reset thẻ học về từ đầu tiên khi search
          }}
          className="overview-search"
        />
        {overviewSearch && (
          <button onClick={() => { setOverviewSearch(""); setOverviewStudyIndex(0); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1 }}>×</button>
        )}
      </div>

      {/* KHU VỰC HỌC THẺ TỔNG QUÁT */}
      <section className="study-panel">
        <div className="study-copy">
          <span className="vocab-eyebrow">Global Study Mode</span>
          <h2>Học toàn bộ kho từ vựng</h2>
          <p>{filteredOverviewWords.length > 0 ? `${safeOverviewStudyIndex + 1}/${filteredOverviewWords.length} từ trong kho (Đang hiển thị)` : "Không tìm thấy từ vựng nào."}</p>
        </div>

        {overviewStudyWord ? (
          <div className="study-card-wrap">
            <div
              className={`study-card ${isOverviewStudyFlipped ? "flipped" : ""}`}
              onClick={() => setIsOverviewStudyFlipped((prev) => !prev)}
            >
              <div className="study-card-inner">
                {/* Mặt trước: Tiếng Anh */}
                <div className="study-card-front">
                  <span>Từ tiếng Anh</span>
                  <strong>{overviewStudyWord.english}</strong>
                  <small>Bấm để lật thẻ</small>
                </div>
                
                {/* Mặt sau: Tiếng Việt */}
                <div className="study-card-back">
                  <span>Nghĩa tiếng Việt</span>
                  <strong>{overviewStudyWord.vietnamese}</strong>
                  <small>Bấm để lật thẻ</small>
                </div>
              </div>
            </div>
            
            <div className="study-controls">
              <button type="button" onClick={() => goToOverviewStudyCard(safeOverviewStudyIndex - 1)}>Trước</button>
              <button type="button" onClick={() => setIsOverviewStudyFlipped((prev) => !prev)}>Lật thẻ</button>
              <button type="button" onClick={() => goToOverviewStudyCard(safeOverviewStudyIndex + 1)}>Sau</button>
            </div>
          </div>
        ) : (
          <div className="empty-message">Kho từ vựng hiện đang trống.</div>
        )}
      </section>

      {/* DANH SÁCH THẺ DẠNG GRID */}
      <section className="vocab-list" style={{ marginTop: '40px' }}>
        <div className="vocab-header">
          <div>
            <h2>Danh sách thẻ ({filteredOverviewWords.length})</h2>
            <p>Quản lý toàn bộ thẻ từ vựng trong hệ thống của bạn.</p>
          </div>
        </div>

        {filteredOverviewWords.length === 0 ? (
          <p className="empty-message">Chưa có từ nào.</p>
        ) : (
          <div className="vocab-cards-grid">
            {filteredOverviewWords.map((word) => (
              <article
                key={word.id}
                className={`vocab-card ${flippedCards[word.id] ? "flipped" : ""}`}
                onClick={() => toggleFlip(word.id)}
              >
                {/* Nút xóa */}
                <button type="button" className="delete-card-btn"
                  onClick={e => { e.stopPropagation(); handleOverviewDeleteWord(word.id); }}>
                  Xóa
                </button>

                {/* Nút thêm vào bộ thẻ */}
                <button type="button" className="add-to-deck-btn"
                  onClick={e => { e.stopPropagation(); setAddToDeckWordId(prev => prev === word.id ? null : word.id); }}>
                  ➕ Bộ thẻ
                </button>

                {/* Popup chọn bộ thẻ */}
                {addToDeckWordId === word.id && (
                  <div className="add-to-deck-popup" onClick={e => e.stopPropagation()}>
                    <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 800, color: "#56749d" }}>Thêm vào bộ thẻ:</p>
                    {workspace.decks.map(deck => {
                      const alreadyIn = deck.wordIds.includes(word.id);
                      return (
                        <button key={deck.id} type="button"
                          className={`deck-pick-btn ${alreadyIn ? "already-in" : ""}`}
                          disabled={alreadyIn}
                          onClick={() => handleAddWordToDeck(word.id, deck.id)}>
                          {alreadyIn ? "✓ " : ""}{deck.name}
                        </button>
                      );
                    })}
                    <button type="button" className="deck-pick-cancel"
                      onClick={() => setAddToDeckWordId(null)}>Đóng</button>
                  </div>
                )}

                <div className="vocab-card-inner">
                  <div className="vocab-card-front">
                    <span>Từ tiếng Anh</span>
                    <h3>{word.english}</h3>
                    <p>Bấm để xem nghĩa</p>
                  </div>
                  <div className="vocab-card-back">
                    <span>Nghĩa tiếng Việt</span>
                    <h3>{word.vietnamese}</h3>
                    <p>Bấm để lật lại thẻ</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  ) : null;

  // ── GIAO DIỆN TAB BỘ THẺ ────────────────────────────────────────────────
  const decksTab = mainTab === "decks" ? (
    <div className="decks-tab-content">
      <div className="active-deck-panel">
        <div>
          <span className="vocab-eyebrow">Đang học</span>
          <h2>{activeDeck?.name || "Chưa có bộ thẻ"}</h2>
          <p>{activeDeck?.description}</p>
        </div>
        <button type="button" className="deck-danger-btn" onClick={() => handleDeleteDeck(activeDeck?.id)}>
          Xóa bộ
        </button>
      </div>

      <form className="vocab-form" onSubmit={handleAddWord}>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="english">Từ tiếng Anh</label>
            <div className="input-wrapper" ref={dropdownRef}>
              <input
                type="text"
                id="english"
                value={english}
                onChange={(event) => {
                  setEnglish(event.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  if (english.trim()) void fetchTranslation(english.trim());
                }}
                placeholder="Nhập từ tiếng Anh"
                required
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="autocomplete-dropdown">
                  {suggestions.map((item) => (
                    <li
                      key={item.word}
                      className="autocomplete-item"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelectSuggestion(item.word)}
                    >
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
              onChange={(event) => setVietnamese(event.target.value)}
              placeholder="Nhập nghĩa tiếng Việt"
              required
            />
            {isTranslating ? <div className="translate-loading">Đang tìm nghĩa tiếng Việt...</div> : null}
            {!isTranslating && viSuggestion && viSuggestion !== "Không tìm thấy nghĩa chuẩn" && viSuggestion !== "Lỗi kết nối từ điển" && (
              <button
                type="button"
                className="translate-chip"
                onClick={() => setVietnamese(viSuggestion)}
              >
                Dùng gợi ý: {viSuggestion}
              </button>
            )}
            {!isTranslating && (viSuggestion === "Không tìm thấy nghĩa chuẩn" || viSuggestion === "Lỗi kết nối từ điển") && (
              <div className="translation-warning">{viSuggestion}. Vui lòng tự nhập nghĩa.</div>
            )}
          </div>
        </div>
        <button type="submit" className="add-btn">Thêm vào bộ đang chọn</button>
      </form>

      <section className="study-panel">
        <div className="study-copy">
          <span className="vocab-eyebrow">Study mode</span>
          <h2>Khu học từ vựng trọng tâm</h2>
          <p>{activeWords.length > 0 ? `${studyIndex + 1}/${activeWords.length} từ trong bộ đang học` : "Bộ này chưa có từ để học."}</p>
        </div>

        {studyWord ? (
          <div className="study-card-wrap">
            <div
              className={`study-card ${isStudyFlipped ? "flipped" : ""}`}
              onClick={() => setIsStudyFlipped((prev) => !prev)}
            >
              <div className="study-card-inner">
                {/* Mặt trước: Tiếng Anh */}
                <div className="study-card-front">
                  <span>Từ tiếng Anh</span>
                  <strong>{studyWord.english}</strong>
                  <small>Bấm để lật thẻ</small>
                </div>
                
                {/* Mặt sau: Tiếng Việt */}
                <div className="study-card-back">
                  <span>Nghĩa tiếng Việt</span>
                  <strong>{studyWord.vietnamese}</strong>
                  <small>Bấm để lật thẻ</small>
                </div>
              </div>
            </div>
            
            <div className="study-controls">
              <button type="button" onClick={() => goToStudyCard(studyIndex - 1)}>Trước</button>
              <button type="button" onClick={() => setIsStudyFlipped((prev) => !prev)}>Lật thẻ</button>
              <button type="button" onClick={() => goToStudyCard(studyIndex + 1)}>Sau</button>
            </div>
          </div>
        ) : (
          <div className="empty-message">Thêm từ vào bộ này để bắt đầu học.</div>
        )}
      </section>

      <section className="vocab-list">
        <div className="vocab-header">
          <div>
            <h2>Từ trong bộ ({activeWords.length})</h2>
            <p>Các từ đang có trong bộ thẻ đang chọn.</p>
          </div>
        </div>

        {activeWords.length === 0 ? (
          <p className="empty-message">Bộ thẻ này chưa có từ nào.</p>
        ) : (
          <div className="vocab-cards-grid">
            {activeWords.map((word) => (
              <article
                key={word.id}
                className={`vocab-card ${flippedCards[word.id] ? "flipped" : ""}`}
                onClick={() => toggleFlip(word.id)}
              >
                <button
                  type="button"
                  className="delete-card-btn"
                  onClick={(event) => handleRemoveWordFromDeck(event, word.id)}
                >
                  Xóa
                </button>
                <div className="vocab-card-inner">
                  <div className="vocab-card-front">
                    <span>Từ tiếng Anh</span>
                    <h3>{word.english}</h3>
                    <p>Bấm để xem nghĩa</p>
                  </div>
                  <div className="vocab-card-back">
                    <span>Nghĩa tiếng Việt</span>
                    <h3>{word.vietnamese}</h3>
                    <p>Bấm để lật lại thẻ</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  ) : null;

  return (
    <section className="vocab-page">
      <div className="vocab-hero">
        <div>
          <span className="vocab-eyebrow">Vocabulary decks</span>
          <h1>Bộ thẻ từ vựng TOEIC</h1>
          <p>Tạo bộ thẻ riêng, gom nhiều từ vào cùng một chủ đề và học bằng flashcard.</p>
        </div>
        <div className="vocab-hero-stats" aria-label="Thống kê từ vựng">
          <div>
            <span>Bộ thẻ</span>
            <strong>{workspace.decks.length}</strong>
          </div>
          <div>
            <span>Từ trong kho</span>
            <strong>{workspace.wordBank.length}</strong>
          </div>
          <div>
            <span>Trong bộ đang học</span>
            <strong>{activeWords.length}</strong>
          </div>
        </div>
      </div>

      <div className="vocab-workspace">
        <aside className="deck-sidebar">
          <form className="deck-form" onSubmit={handleCreateDeck}>
            <h2>Tạo bộ thẻ</h2>
            <label htmlFor="deck-name">Tên bộ</label>
            <input
              id="deck-name"
              type="text"
              value={deckName}
              onChange={(event) => setDeckName(event.target.value)}
              placeholder="Ví dụ: Business verbs"
            />
            <label htmlFor="deck-description">Ghi chú</label>
            <textarea
              id="deck-description"
              value={deckDescription}
              onChange={(event) => setDeckDescription(event.target.value)}
              placeholder="Mục tiêu hoặc chủ đề của bộ thẻ"
              rows="3"
            />
            <button type="submit">Tạo bộ mới</button>
          </form>

          <div className="deck-list">
            <h2>Danh sách bộ</h2>
            {workspace.decks.map((deck) => (
              <button
                type="button"
                key={deck.id}
                className={`deck-list-item ${deck.id === activeDeck?.id ? "active" : ""}`}
                onClick={() => {
                  setActiveDeckId(deck.id);
                  setSelectedWordIds([]);
                  setStudyIndex(0);
                  setIsStudyFlipped(false);
                }}
              >
                <span>{deck.name}</span>
                <small>{deck.wordIds.length} từ</small>
              </button>
            ))}
          </div>
        </aside>

        <div className="vocab-main">
          {/* Tab switcher */}
          <div className="vocab-tab-bar">
            <button
              type="button"
              className={`vocab-tab-btn ${mainTab === "decks" ? "active" : ""}`}
              onClick={() => setMainTab("decks")}
            >
              🗂️ Bộ thẻ của tôi
            </button>
            <button
              type="button"
              className={`vocab-tab-btn ${mainTab === "overview" ? "active" : ""}`}
              onClick={() => setMainTab("overview")}
            >
              📋 Tổng quát <span className="vocab-tab-count">{workspace.wordBank.length}</span>
            </button>
          </div>

          {/* ── TAB TỔNG QUÁT ─────────────────────────────────────────── */}
          {overviewTab}

          {/* ── TAB BỘ THẺ ─────────────────────────────────────────────── */}
          {decksTab}
        </div>
      </div>
    </section>
  );
};

export default Vocab;