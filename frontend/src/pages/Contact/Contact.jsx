import { useState, useEffect } from "react";
import "./Contact.css";
import { API_BASE_URL, getAuthHeaders } from "../../config/api";

const Contact = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("Yêu cầu hỗ trợ");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [myTickets, setMyTickets] = useState([]);
  const [replyTexts, setReplyTexts] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Vui lòng điền tên, email và nội dung tin nhắn.");
      return;
    }

    setIsSubmitting(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem("currentUser"));
      const userId = currentUser?.id || null;

      const res = await fetch(`${API_BASE_URL}/api/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, userId }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message || "Gửi thành công!");
        setName("");
        setEmail("");
        setSubject("Yêu cầu hỗ trợ");
        setMessage("");
        // refresh user's tickets
        if (localStorage.getItem('token')) void fetchMyTickets();
      } else {
        setError(data.message || "Có lỗi xảy ra khi gửi.");
      }
    } catch (err) {
      console.error(err);
      setError("Không thể kết nối tới máy chủ.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchMyTickets = async () => {
    try {
      if (!localStorage.getItem('token')) return; // only for logged in users
      const res = await fetch(`${API_BASE_URL}/api/contacts/me`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setMyTickets(data);
    } catch (err) {
      console.error('Lỗi tải yêu cầu của user:', err);
    }
  };

  const handleSendUserMessage = async (ticketId) => {
    const text = (replyTexts[ticketId] || '').trim();
    if (!text) return alert('Vui lòng nhập tin nhắn.');
    try {
      const res = await fetch(`${API_BASE_URL}/api/contacts/${ticketId}/messages`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text }),
      });
      const updated = await res.json();
      if (res.ok) {
        setMyTickets((prev) => prev.map(t => t._id === ticketId ? updated : t));
        setReplyTexts((p) => ({ ...p, [ticketId]: '' }));
      } else {
        alert(updated.message || 'Gửi thất bại');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối');
    }
  };

  useEffect(() => {
    void fetchMyTickets();
  }, []);

  return (
    <div className="contact">
      <h1>Bạn cần hỗ trợ ?</h1>
      <p>
        Chúng tôi rất hân hạnh được hỗ trợ bạn, hãy để lại thông tin cho chúng
        tôi nhé. Yêu cầu của bạn sẽ được chúng tôi xử lý và phản hồi trong thời
        gian sớm nhất có thể.
      </p>
      <form className="contact-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Họ và tên:</label>
          <input
            type="text"
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="email">Email:</label>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="subject">Tiêu đề:</label>
          <input
            type="text"
            id="subject"
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="message">Tin nhắn:</label>
          <textarea
            id="message"
            name="message"
            rows="5"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          ></textarea>
        </div>

        {error && <div className="form-error">{error}</div>}
        {success && <div className="form-success">{success}</div>}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Đang gửi..." : "Gửi"}
        </button>
      </form>

      {localStorage.getItem('token') && (
        <div className="my-tickets">
          <h3>Yêu cầu của bạn</h3>
            {myTickets.length === 0 ? (
            <p className="widget-empty">Bạn chưa gửi yêu cầu hỗ trợ nào.</p>
          ) : (
            <div className="ticket-list">
              {myTickets.map(t => (
                <div key={t._id} className={`ticket-item ${t.status}`}>
                  <div style={{ fontWeight: 800 }}>{t.subject}</div>
                  <div style={{ marginTop: 6, color: '#334155' }}>{t.message}</div>
                  <div style={{ marginTop: 8, color: '#64748b' }}>Trạng thái: <strong>{t.status}</strong></div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Hội thoại</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(t.messages && t.messages.length ? t.messages : [{ sender: 'user', text: t.message, createdAt: t.createdAt }]).map((m, i) => (
                        <div key={i} style={{ alignSelf: m.sender === 'admin' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                          <div style={{ background: m.sender === 'admin' ? '#e6f0ff' : '#f1f5f9', padding: 10, borderRadius: 8 }}>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                            <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>{new Date(m.createdAt).toLocaleString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <textarea placeholder="Gửi thêm tin nhắn..." value={replyTexts[t._id] || ''} onChange={(e) => setReplyTexts((p) => ({ ...p, [t._id]: e.target.value }))} style={{ width: '100%', minHeight: 72, padding: 8, borderRadius: 8, border: '1px solid #e6eefc' }} />
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <button onClick={() => handleSendUserMessage(t._id)} style={{ background: '#0f4bcf', color: '#fff', padding: '8px 12px', borderRadius: 8, fontWeight: 800 }}>Gửi</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Contact;
