import type { MatchMode } from '../game/rounds';
import { Match } from '../game/match';
import type { MatchInput, MatchState } from './protocol';
export function localPractice(
  bots: number,
  state: (snapshot: MatchState) => void,
  mode: MatchMode = 'deathmatch',
) {
  const match = new Match(mode);
  const self = 'local-player';
  match.add(self);
  for (let i = 0; i < Math.max(0, Math.min(4, bots)); i++) match.add(`bot-${i}`, true);
  const timer = setInterval(() => {
    if (document.pointerLockElement) match.step(0.05);
    state({
      protocol: 3,
      type: 'state',
      room: 'LOCAL',
      self,
      actors: match.snapshot(),
      ...match.state(),
    });
  }, 50);
  return {
    send(input: MatchInput) {
      match.input(self, input);
    },
    close() {
      clearInterval(timer);
    },
  };
}
