/** Small formatting helpers shared by the report and the interpretation layer. */

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${Math.round(value * 100) / 100} ${units[unit]}`;
}

export function truncate(value: string, max = 120): string {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}