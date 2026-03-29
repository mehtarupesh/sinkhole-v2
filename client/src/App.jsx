import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Host from './pages/Host';
import Scan from './pages/Scan';
import Connect from './pages/Connect';
import { getStableHostId } from './utils/stableHostId';

const version =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ !== 'null'
    ? __APP_VERSION__
    : null;

export default function App() {
  const hostId = getStableHostId();
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host" element={<Host />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/connect" element={<Connect />} />
      </Routes>
      <span className="app-footer" title={version ? `Build ${version}` : 'Host ID'}>
        {version && <span>{version}</span>}
        {version && hostId && <span className="app-footer__sep"> · </span>}
        <span>{hostId}</span>
      </span>
    </>
  );
}
