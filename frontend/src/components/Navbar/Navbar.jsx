import "./Navbar.css";
import { assets } from "../../assets/assets";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
const Navbar = ({ setShowLogin, currentUser, setCurrentUser }) => {
  const location = useLocation();
  return (
    <div className="navbar">
      <Link to="/">
        <h2>
          <a href="" className="logo">
            TOEIC
          </a>
        </h2>
      </Link>
      <ul className="navbar-menu">
        <li>
          <Link
            to="/"
            className={location.pathname === "/" ? "active" : ""}
          >
            Trang chủ
          </Link>
        </li>
        <li>
          <Link
            to="/exam"
            className={location.pathname === "/exam" ? "active" : ""}
          >
            Thi thử
          </Link>
        </li>
        <li>
          <a
            href="/vocab"
            target="_blank"
            rel="noopener noreferrer"
            className={location.pathname === "/vocab" ? "active" : ""}
          >
            Từ vựng
          </a>
        </li>
        <li>
          <Link
            to="/contact"
            className={location.pathname === "/contact" ? "active" : ""}
          >
            Liên hệ
          </Link>
        </li>
        {currentUser && currentUser.role === "admin" && (
          <li>
            <Link
              to="/admin"
              className={location.pathname === "/admin" ? "active" : ""}
            >
              👨‍💼 Admin
            </Link>
          </li>
        )}
      </ul>
      <div className="navbar-auth">
        {currentUser ? (
          <div className="navbar-user">
            <span>Xin chào, {currentUser.fullName}</span>
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
