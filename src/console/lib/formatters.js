export function formatSignedNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '0';
  return number > 0 ? `+${number}` : String(number);
}

export function formatPercent(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}
