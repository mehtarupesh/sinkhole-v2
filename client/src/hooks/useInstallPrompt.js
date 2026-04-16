import { useState, useEffect } from 'react';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

const isMobile = () =>
  /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ||
  window.matchMedia('(pointer: coarse)').matches;

const DISMISSED_KEY = 'install_banner_dismissed';

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === '1'
  );

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const mobile = isMobile();
  const standalone = isStandalone();
  const ios = isIOS();

  // Show banner when: mobile, not already installed, not dismissed
  const showAndroid = mobile && !standalone && !dismissed && deferredPrompt !== null;
  const showIOS = mobile && !standalone && !dismissed && ios && deferredPrompt === null;

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  return { showAndroid, showIOS, install, dismiss };
}
