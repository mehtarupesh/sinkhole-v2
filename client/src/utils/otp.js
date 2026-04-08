export function generateOtp() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}
