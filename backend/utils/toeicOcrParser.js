// backend/utils/toeicOcrParser.js

const normalizeText = (value) => String(value || "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
const cleanInline = (value) => normalizeText(value).replace(/\s+/g, " ").trim();

export const parseAnswerKeyByRegex = (text) => {
    const keys = {};
    const source = normalizeText(text);
    if (!source) return keys;

    // BỘ LỌC SIÊU MẠNH: Bắt mọi kiểu "101. A", "101 A", "101- A", "Câu 101: A"
    const regex = /(?:Câu|Question|Q|STT)?\s*(\d{1,3})\s*[:.\-)]?\s*([A-D])\b/gi;
    let match;
    while ((match = regex.exec(source)) !== null) {
        const qNo = parseInt(match[1], 10);
        if (qNo >= 1 && qNo <= 200) {
            keys[qNo] = {
                CorrectAnswer: match[2].toUpperCase(),
                Explanation: "" 
            };
        }
    }
    return keys;
};

export const parsePart5ByRegex = (text) => {
    const questions = [];
    const source = normalizeText(text);
    if (!source) return questions;

    // Vét sạch Part 5 từ câu 101 đến 130 bất chấp dấu câu bị sai
    for (let i = 101; i <= 130; i++) {
        const qPattern = new RegExp(`(?:Câu|Question|Q)?\\s*${i}\\s*[.\\-:]\\s*([\\s\\S]*?)(?:\\(A\\)|A\\.|A\\)|A\\s)\\s*([\\s\\S]*?)(?:\\(B\\)|B\\.|B\\)|B\\s)\\s*([\\s\\S]*?)(?:\\(C\\)|C\\.|C\\)|C\\s)\\s*([\\s\\S]*?)(?:\\(D\\)|D\\.|D\\)|D\\s)\\s*([\\s\\S]*?)(?=(?:Câu|Question|Q)?\\s*${i+1}\\s*[.\\-:]|PART|$)`, "i");

        const match = source.match(qPattern);
        if (match) {
            questions.push({
                Part: 5,
                QuestionNo: i,
                QuestionText: cleanInline(match[1]),
                OptionA: cleanInline(match[2]),
                OptionB: cleanInline(match[3]),
                OptionC: cleanInline(match[4]),
                OptionD: cleanInline(match[5]),
                PassageText: "", ImageUrl: "", PassageImages: [], AudioUrl: "", CorrectAnswer: "", Explanation: ""
            });
        }
    }
    return questions;
};

export const extractToeicBlocks = (text) => {
    const blocks = [];
    const source = normalizeText(text);
    if (!source) return blocks;

    // Bắt cấu trúc: "Questions 131-134" HOẶC "131 - 134 refer to"
    const rangeRegex = /(?:Questions?|Câu)?\s*(\d{1,3})\s*(?:-|to|through|đến|\u2013)\s*(\d{1,3})\b/gi;
    
    let match;
    let lastIndex = 0;
    let lastStart = null;
    let lastEnd = null;

    while ((match = rangeRegex.exec(source)) !== null) {
        const startQ = parseInt(match[1], 10);
        const endQ = parseInt(match[2], 10);

        if (startQ >= 32 && startQ <= 200 && endQ >= startQ) {
            if (lastStart !== null) {
                blocks.push({
                    start: lastStart, end: lastEnd,
                    content: source.substring(lastIndex, match.index).trim(),
                    isFallback: false
                });
            }
            lastStart = startQ; lastEnd = endQ; lastIndex = match.index;
        }
    }

    if (lastStart !== null) {
        blocks.push({
            start: lastStart, end: lastEnd,
            content: source.substring(lastIndex).trim(),
            isFallback: false
        });
    }

    // CHỐNG ĐẠN TUYỆT ĐỐI: Nếu file quá nát không tìm thấy "Questions x-y", băm văn bản thành các cục để nhét thẳng vào AI
    if (blocks.length === 0) {
        let current = 0;
        const maxLength = 6000;
        while (current < source.length) {
            blocks.push({
                start: 32, end: 200, 
                content: source.substring(current, current + maxLength),
                isFallback: true
            });
            current += maxLength;
        }
    }

    return blocks;
};