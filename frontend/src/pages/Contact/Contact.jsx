import "./Contact.css";
const Contact = () => {
  return (
    <div className="contact">
      <h1>Bạn cần hỗ trợ ?</h1>
      <p>
        Chúng tôi rất hân hạnh được hỗ trợ bạn, hãy để lại thông tin cho chúng
        tôi nhé. Yêu cầu của bạn sẽ được chúng tôi xử lý và phản hồi trong thời
        gian sớm nhất có thể.
      </p>
      <form className="contact-form">
        <div className="form-group">
          <label htmlFor="name">Họ và tên:</label>
          <input type="text" id="name" name="name" required />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email:</label>
          <input type="email" id="email" name="email" required />
        </div>
        <div className="form-group">
          <label htmlFor="message">Tin nhắn:</label>
          <textarea id="message" name="message" rows="5" required></textarea>
        </div>
        <button type="submit">Gửi</button>
      </form>
    </div>
  );
};

export default Contact;
