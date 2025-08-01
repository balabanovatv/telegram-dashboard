import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import UserChat from './pages/UserChat';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/user/:userId" element={<UserChat />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

