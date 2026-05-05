import Navbar from "./components/Navbar/navbar";
import Footer from "./components/Footer/footer";
import Login from "./components/Login/login";
import { useState, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import "./App.css";
import Home from "./pages/Home/Home";
import Vocab from "./pages/Vocab/Vocab";
import Exam from "./pages/Exam/Exam";
import Contact from "./pages/Contact/Contact";
import CreateExam from "./pages/CreateExam/CreateExam";
import AdminDashboard from "./pages/AdminDashboard/AdminDashboard";

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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/vocab" element={<Vocab />} />
          <Route path="/exam" element={<Exam />} />
          <Route path="/create-exam" element={<CreateExam currentUser={currentUser} />} />
          <Route path="/admin" element={<AdminDashboard currentUser={currentUser} />} />
          <Route path="/contact" element={<Contact />} />
        </Routes>
        <Footer />
      </div>
    </>
  );
};

export default App;
