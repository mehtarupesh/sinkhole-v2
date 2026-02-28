import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Host from './pages/Host';
import Join from './pages/Join';
import Scan from './pages/Scan';
import { getStableHostId } from './utils/stableHostId';

const version = typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ !== 'null' ? __APP_VERSION__ : null;

export default function App() {
  const hostId = getStableHostId();
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host" element={<Host />} />
        <Route path="/join" element={<Join />} />
        <Route path="/scan" element={<Scan />} />
      </Routes>
      <span style={footerStyle} title={version ? `Build ${version}` : 'Host ID'}>
        {version && <span>{version}</span>}
        {version && hostId && <span style={separatorStyle}> · </span>}
        <span>{hostId}</span>
      </span>
    </>
  );
}

const footerStyle = {
  position: 'fixed',
  bottom: 8,
  right: 12,
  fontSize: 11,
  color: '#555',
  fontFamily: 'monospace',
  userSelect: 'none',
};

const separatorStyle = {
  color: '#444',
};
