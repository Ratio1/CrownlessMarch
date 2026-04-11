export function xpForLevel(level: number) {
  return level <= 1 ? 0 : level * level * 100;
}

export function levelFromXp(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}
