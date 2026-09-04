const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatJstTime(isoTimestamp: string): string {
  return timeFormatter.format(new Date(isoTimestamp));
}

export function formatAge(isoTimestamp: string, now = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(isoTimestamp).getTime()) / 1000));
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}
