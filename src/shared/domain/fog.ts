export function getVisionWindow(level: number) {
  const normalizedLevel = Math.max(1, Math.floor(level));
  const radius =
    normalizedLevel >= 14
      ? 5
      : normalizedLevel >= 10
        ? 4
        : normalizedLevel >= 4
          ? 3
          : 2;
  return { radius, size: radius * 2 + 1 };
}

export function getMaximumVisionWindow() {
  return getVisionWindow(14);
}
