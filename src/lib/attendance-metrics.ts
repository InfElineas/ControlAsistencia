export function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [hourPart = '0', minutePart = '0'] = time.split(':');
  const hours = Number(hourPart);
  const minutes = Number(minutePart);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function getMinutesInTimezone(timestamp: string, timezone: string): number {
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  return hour * 60 + minute;
}

export function calculateLateMinutes(
  inTimestamp: string | null,
  checkinEndTime: string | null,
  timezone: string | null
): number {
  if (!inTimestamp || !checkinEndTime) {
    return 0;
  }

  const endMinutes = parseTimeToMinutes(checkinEndTime);
  if (endMinutes === null) {
    return 0;
  }

  const localMinutes = getMinutesInTimezone(inTimestamp, timezone || 'UTC');
  return Math.max(0, localMinutes - endMinutes);
}
