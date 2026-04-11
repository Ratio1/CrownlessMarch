export function getVisionWindow(level: number) {
  const radius = Math.min(10, 1 + Math.floor((Math.max(level, 1) - 1) / 2));
  return { radius, size: radius * 2 + 1 };
}
