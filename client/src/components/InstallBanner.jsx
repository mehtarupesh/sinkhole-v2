import { CloseIcon } from './Icons';

export default function InstallBanner({ type, onInstall, onDismiss }) {
  return (
    <div className="install-banner">
      {type === 'android' ? (
        <>
          <span className="install-banner__text">Add to home screen for best experience</span>
          <button type="button" className="install-banner__cta" onClick={onInstall}>
            Install
          </button>
        </>
      ) : (
        <span className="install-banner__text">
          Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> to install
        </span>
      )}
      <button type="button" className="install-banner__close" onClick={onDismiss} aria-label="Dismiss">
        <CloseIcon />
      </button>
    </div>
  );
}
