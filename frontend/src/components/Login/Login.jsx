import "./Login.css";
import { assets } from "../../assets/assets";
import { useState } from "react";

const STORAGE_KEY = "toeic_users";
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

const loadUsers = () => {
  try {
    // Luôn khởi tạo DEFAULT_USERS (reset localStorage)
    saveUsers(DEFAULT_USERS);
    return DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
};

const saveUsers = (users) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
};

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

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim() || !password.trim()) {
      setError("Vui lòng nhập email và mật khẩu.");
      return;
    }

    const users = loadUsers();
    const normalizedEmail = email.trim().toLowerCase();

    if (currState === LOGIN_STATE) {
      const foundUser = users.find(
        (user) => user.email === normalizedEmail && user.password === password,
      );
      if (!foundUser) {
        setError("Email hoặc mật khẩu không đúng.");
        return;
      }

      setCurrentUser({
        fullName: foundUser.fullName,
        username: foundUser.username,
        email: foundUser.email,
        role: foundUser.role,
      });
      setShowLogin(false);
      return;
    }

    // Đăng ký mới
    if (!fullName.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }
    if (!username.trim()) {
      setError("Vui lòng nhập tên đăng nhập.");
      return;
    }
    if (!phone.trim()) {
      setError("Vui lòng nhập số điện thoại.");
      return;
    }
    if (!confirmPassword.trim()) {
      setError("Vui lòng nhập lại mật khẩu.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu và xác nhận mật khẩu không khớp.");
      return;
    }

    const existingEmail = users.find((user) => user.email === normalizedEmail);
    if (existingEmail) {
      setError("Email này đã được sử dụng. Vui lòng thử email khác.");
      return;
    }
    const existingUsername = users.find(
      (user) => user.username.toLowerCase() === username.trim().toLowerCase(),
    );
    if (existingUsername) {
      setError("Tên đăng nhập này đã tồn tại. Vui lòng chọn tên khác.");
      return;
    }

    const newUser = {
      fullName: fullName.trim(),
      username: username.trim(),
      phone: phone.trim(),
      email: normalizedEmail,
      password,
      role: "user",
    };

    saveUsers([...users, newUser]);
    setCurrentUser({
      fullName: newUser.fullName,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
    });
    setMessage("Tạo tài khoản thành công. Bạn đã đăng nhập.");
    setShowLogin(false);
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
