/** mm:ss.cc — the one time format the whole studio uses. */
export const formatTime = (t: number) => {
  const safe = Math.max(0, t);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const cents = Math.floor((safe % 1) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(cents).padStart(2, '0')}`;
};
