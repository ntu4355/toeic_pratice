import "./Login.css";
import { assets } from "../../assets/assets";
import { useState, useEffect } from "react";

const LOGIN_STATE = "Đăng nhập";
const REGISTER_STATE = "Đăng ký";

// Mock data - Tài khoản mẫu
const DEFAULT_USERS = [
  {
    fullName: "Admin TOEIC",
    username: "admin",
    phone: "0123456789",
    email: "admin@toeic.com",
    password: "admin123",
    role: "admin",
  },
  {
    fullName: "Người Dùng",
    username: "user",
    phone: "0987654321",
    email: "user@toeic.com",
    password: "user123",
    role: "user",
  },
];

const Login = ({ setShowLogin, setCurrentUser }) => {
  const [currState, setCurrState] = useState(LOGIN_STATE);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // ==============================================================
  // MA THUẬT NGẦM: TỰ ĐỘNG ĐẨY TÀI KHOẢN MẪU VÀO MONGODB KHI MỞ BẢNG
  // ==============================================================
  useEffect(() => {
    const seedMockUsers = async () => {
      for (const user of DEFAULT_USERS) {
        try {
          await fetch("http://localhost:5000/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: user.fullName,
              email: user.email,
              password: user.password,
              role: user.role
            }),
          });
          // Nếu Backend báo lỗi 400 (Email đã tồn tại) thì cứ bỏ qua ngầm
        } catch (error) {
          console.error("Lỗi khi tạo tài khoản mẫu:", error);
        }
      }
    };
    seedMockUsers();
  }, []);

  const resetForm = () => {
    setFullName("");
    setUsername("");
    setPhone("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim() || !password.trim()) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ==========================================
    // 1. LUỒNG ĐĂNG NHẬP (Gọi MongoDB)
    // ==========================================
    if (currState === LOGIN_STATE) {
      try {
        const response = await fetch("http://localhost:5000/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail, password }),
        });
        
        const data = await response.json();

        if (response.ok) {
          // Lưu token bảo mật
          localStorage.setItem("token", data.token);
          
          // Gán State cho App.jsx, giữ nguyên các trường như cũ
          setCurrentUser({
            fullName: data.user.name,
            username: data.user.name, // Mượn tạm name làm username để không vỡ UI cũ
            email: data.user.email,
            role: data.user.role,
          });
          setShowLogin(false);
          return;
        } else {
          setError(data.message || "Email hoặc mật khẩu không đúng.");
          return;
        }
      } catch (err) {
        setError("Lỗi kết nối đến máy chủ Database.");
        return;
      }
    }

    // ==========================================
    // 2. LUỒNG ĐĂNG KÝ (Gọi MongoDB)
    // ==========================================
    if (!fullName.trim()) {
      setError("Vui lòng nhập họ và tên."); return;
    }
    if (!username.trim()) {
      setError("Vui lòng nhập tên đăng nhập."); return;
    }
    if (!phone.trim()) {
      setError("Vui lòng nhập số điện thoại."); return;
    }
    if (!confirmPassword.trim()) {
      setError("Vui lòng nhập lại mật khẩu."); return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu và xác nhận mật khẩu không khớp."); return;
    }

    try {
      const response = await fetch("http://localhost:5000/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName.trim(),
          email: normalizedEmail,
          password: password,
          role: "user" 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("Tạo tài khoản thành công. Bạn đã có thể đăng nhập.");
        setCurrState(LOGIN_STATE);
        setPassword("");
        setConfirmPassword("");
      } else {
        setError(data.message || "Email này đã được sử dụng. Vui lòng thử email khác.");
      }
    } catch (err) {
      setError("Lỗi kết nối đến máy chủ Database.");
    }
  };

  const toggleState = () => {
    setCurrState(currState === LOGIN_STATE ? REGISTER_STATE : LOGIN_STATE);
    resetForm();
  };

  return (
    <div className="login">
      <form className="login-container" onSubmit={handleSubmit}>
        <div className="login-title">
          <h2>{currState}</h2>
          <img
            src={assets.cross_icon}
            alt="Close"
            onClick={() => setShowLogin(false)}
          />
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={currState === LOGIN_STATE ? "tab active" : "tab"}
            onClick={() => setCurrState(LOGIN_STATE)}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            className={currState === REGISTER_STATE ? "tab active" : "tab"}
            onClick={() => setCurrState(REGISTER_STATE)}
          >
            Đăng ký
          </button>
        </div>

        {currState === LOGIN_STATE && (
          <div className="demo-accounts">
            <p className="demo-title">📝 Tài khoản mẫu:</p>
            <div className="demo-item">
              <strong>Admin:</strong> admin@toeic.com / admin123
            </div>
            <div className="demo-item">
              <strong>User:</strong> user@toeic.com / user123
            </div>
          </div>
        )}

        <div className="login-inputs">
          {currState === REGISTER_STATE && (
            <>
              <input
                type="text"
                placeholder="Họ và tên"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Tên đăng nhập"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <input
                type="tel"
                placeholder="Số điện thoại"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {currState === REGISTER_STATE && (
            <input
              type="password"
              placeholder="Nhập lại mật khẩu"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          )}
        </div>

        {error && <div className="login-error">{error}</div>}
        {message && <div className="login-success">{message}</div>}

        <button type="submit" className="login-button">
          {currState === REGISTER_STATE ? "Tạo tài khoản" : "Đăng nhập"}
        </button>

        <div className="login-switch">
          <span>
            {currState === LOGIN_STATE
              ? "Chưa có tài khoản?"
              : "Đã có tài khoản?"}
          </span>
          <button type="button" onClick={toggleState} className="switch-button">
            {currState === LOGIN_STATE ? "Đăng ký" : "Đăng nhập"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login;