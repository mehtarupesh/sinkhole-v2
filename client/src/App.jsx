import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Host from './pages/Host';
import Join from './pages/Join';
import Scan from './pages/Scan';

const version = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ !== 'null' ? __APP_VERSION__ : null;

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host" element={<Host />} />
        <Route path="/join" element={<Join />} />
        <Route path="/scan" element={<Scan />} />
      </Routes>
      {version && (
        <span style={versionStyle} title={`Build ${version}`}>
          {version}
        </span>
      )}
    </>
  );
}

const versionStyle = {
  position: 'fixed',
  bottom: 8,
  right: 12,
  fontSize: 11,
  color: '#555',
  fontFamily: 'monospace',
  userSelect: 'none',
};
