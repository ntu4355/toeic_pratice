import Navbar from "./components/Navbar/navbar";
import Footer from "./components/Footer/footer";
import Login from "./components/Login/login";
import { useState, useEffect } from "react";
import "./App.css";
const App = () => {
  const [showLogin, setShowLogin] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = window.localStorage.getItem("toeic_current_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (currentUser) {
      window.localStorage.setItem(
        "toeic_current_user",
        JSON.stringify(currentUser),
      );
    } else {
      window.localStorage.removeItem("toeic_current_user");
    }
  }, [currentUser]);

  return (
    <>
      {showLogin ? (
        <Login setShowLogin={setShowLogin} setCurrentUser={setCurrentUser} />
      ) : null}
      <div className="app">
        <Navbar
          setShowLogin={setShowLogin}
          currentUser={currentUser}
          setCurrentUser={setCurrentUser}
        />
      </div>
      <Footer />
    </>
  );
};

export default App;
