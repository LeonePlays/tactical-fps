/** Validated match options shared by the browser and the Node host. */
export type MapId = 'industrial' | 'old-quarter';
export type MatchMode = 'deathmatch' | 'team-deathmatch' | 'defuse';
export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type TeamPreference = 'auto' | 'alpha' | 'bravo';
export interface MatchConfig {
  mode: MatchMode;
  map: MapId;
  bots: number;
  difficulty: BotDifficulty;
  team: TeamPreference;
  timeLimit: number;
  scoreLimit: number;
}
export const DEFAULT_MATCH_CONFIG: Readonly<MatchConfig> = Object.freeze({
  mode: 'deathmatch',
  map: 'industrial',
  bots: 3,
  difficulty: 'normal',
  team: 'auto',
  timeLimit: 180,
  scoreLimit: 10,
});
export function normalizeMatchConfig(raw: unknown): MatchConfig {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const number = (key: 'bots' | 'timeLimit' | 'scoreLimit', min: number, max: number) =>
    typeof value[key] === 'number' && Number.isFinite(value[key])
      ? Math.min(max, Math.max(min, Math.floor(value[key] as number)))
      : DEFAULT_MATCH_CONFIG[key];
  return {
    mode: ['deathmatch', 'team-deathmatch', 'defuse'].includes(String(value.mode))
      ? (value.mode as MatchMode)
      : DEFAULT_MATCH_CONFIG.mode,
    map: value.map === 'old-quarter' ? 'old-quarter' : 'industrial',
    difficulty:
      value.difficulty === 'easy' || value.difficulty === 'hard' ? value.difficulty : 'normal',
    team: value.team === 'alpha' || value.team === 'bravo' ? value.team : 'auto',
    bots: number('bots', 0, 4),
    timeLimit: number('timeLimit', 30, 1800),
    scoreLimit: number('scoreLimit', 1, 100),
  };
}
export function playerName(raw: unknown, fallback = 'Visitante'): string {
  return typeof raw === 'string' && raw.trim()
    ? raw
        .trim()
        .replace(/[\u0000-\u001f<>]/g, '')
        .slice(0, 20) || fallback
    : fallback;
}
