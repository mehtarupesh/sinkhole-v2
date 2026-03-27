const STANDARD_BUCKETS = ['Today', 'Yesterday', 'This Week', 'This Month'];

function getTimeLabel(createdAt, now) {
  const d = new Date(createdAt);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  if (d >= today)      return 'Today';
  if (d >= yesterday)  return 'Yesterday';
  if (d >= weekAgo)    return 'This Week';
  if (d >= monthStart) return 'This Month';

  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function sortLabels(labels) {
  return [...labels].sort((a, b) => {
    const ai = STANDARD_BUCKETS.indexOf(a);
    const bi = STANDARD_BUCKETS.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;   // both standard — preserve defined order
    if (ai !== -1) return -1;                       // standard before month-year
    if (bi !== -1) return 1;
    return new Date(b) - new Date(a);              // month-year — newest first
  });
}

/**
 * Groups units into time buckets and returns them most-recent-first.
 * Returns [{ label, units }].
 */
export function groupByTime(units) {
  const now = new Date();
  const buckets = new Map();

  for (const unit of units) {
    const label = getTimeLabel(unit.createdAt ?? 0, now);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(unit);
  }

  return sortLabels(buckets.keys()).map((label) => ({ label, units: buckets.get(label) }));
}
