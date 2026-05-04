import "./Navbar.css";
import { assets } from "../../assets/assets";
import { useState } from "react";
const Navbar = ({ setShowLogin, currentUser, setCurrentUser }) => {
  const [menu, setMenu] = useState("home");
  return (
    <div className="navbar">
      <h2>
        <a href="" className="logo">
          TOEIC
        </a>
      </h2>
      <ul className="navbar-menu">
        <li>
          <a
            href="/"
            className={menu === "home" ? "active" : ""}
            onClick={() => setMenu("home")}
          >
            Trang chủ
          </a>
        </li>
        <li>
          <a
            href="/exam"
            className={menu === "exam" ? "active" : ""}
            onClick={() => setMenu("exam")}
          >
            Thi thử
          </a>
        </li>
        <li>
          <a
            href="/vocab"
            className={menu === "vocab" ? "active" : ""}
            onClick={() => setMenu("vocab")}
          >
            Từ vựng
          </a>
        </li>
        <li>
          <a
            href="/contact"
            className={menu === "contact" ? "active" : ""}
            onClick={() => setMenu("contact")}
          >
            Liên hệ
          </a>
        </li>
      </ul>
      <div className="navbar-auth">
        {currentUser ? (
          <div className="navbar-user">
            <span>Xin chào, {currentUser.name}</span>
            <button
              type="button"
              className="logout-button"
              onClick={() => setCurrentUser(null)}
            >
              Đăng xuất
            </button>
          </div>
        ) : (
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault();
              setShowLogin(true);
            }}
          >
            <img src={assets.user_icon} alt="" className="user_icon" />
          </a>
        )}
      </div>
    </div>
  );
};

export default Navbar;
