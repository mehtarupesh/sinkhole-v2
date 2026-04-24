
// iPad on iOS 13+ reports 'MacIntel' with touch points
export function isIOS() {
    return /iP(hone|ad|od)/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

export function isAndroid() {
    return /android/i.test(navigator.userAgent);
  }