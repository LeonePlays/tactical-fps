import { Match } from '../game/match';
import { normalizeMatchConfig, type MatchConfig, type MatchMode } from '../game/match-config';
import { PROTOCOL_VERSION, type MatchInput, type MatchState } from './protocol';

/** Offline transport is driven by the render loop's fixed60Hz clock, never a second timer. */
export function localPractice(
  bots: number,
  state: (snapshot: MatchState) => void,
  modeOrConfig: MatchMode | Partial<MatchConfig> = 'deathmatch',
  name = 'Visitante',
) {
  const config = normalizeMatchConfig(
    typeof modeOrConfig === 'string'
      ? {
          mode: modeOrConfig,
          bots,
          ...(modeOrConfig === 'defuse' ? { timeLimit: 90, scoreLimit: 3 } : {}),
        }
      : { ...modeOrConfig, bots },
  );
  const match = new Match(config);
  const self = 'local-player';
  match.add(self, false, config.team, name);
  for (let i = 0; i < config.bots; i++) match.add(`bot-${i}`, true);
  let closed = false;
  const publish = () => {
    if (closed) return;
    state({
      protocol: PROTOCOL_VERSION,
      type: 'state',
      room: 'LOCAL',
      self,
      actors: match.snapshot(),
      ...match.state(),
    });
  };
  // The caller receives its transport before the first scene/state callback.
  queueMicrotask(publish);
  return {
    send(input: MatchInput) {
      if (!closed) match.input(self, input);
    },
    step(dt: number) {
      if (!closed) {
        match.step(dt);
        publish();
      }
    },
    restart() {
      if (!closed) {
        match.restart();
        publish();
      }
    },
    close() {
      closed = true;
    },
  };
}
