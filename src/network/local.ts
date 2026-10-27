import { Match } from '../game/match';
import type { MatchInput, MatchState } from './protocol';
export function localPractice(bots: number, state: (snapshot: MatchState) => void) {
  const match = new Match();
  const self = 'local-player';
  match.add(self);
  for (let i = 0; i < Math.max(0, Math.min(4, bots)); i++) match.add(`bot-${i}`, true);
  const timer = setInterval(() => {
    if (document.pointerLockElement) match.step(0.05);
    state({ type: 'state', room: 'LOCAL', self, actors: match.snapshot() });
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
