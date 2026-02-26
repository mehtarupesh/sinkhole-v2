import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Host from './pages/Host';
import Join from './pages/Join';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/host" element={<Host />} />
      <Route path="/join" element={<Join />} />
    </Routes>
  );
}
