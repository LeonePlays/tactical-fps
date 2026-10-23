/** Extension boundaries only: no simulated accounts, network peers or AI. */
export interface PlayerSnapshot {
  id: string;
  position: { x: number; y: number; z: number };
  yaw: number;
  health: number;
}
export interface GameMode {
  readonly id: 'training' | 'campaign' | 'multiplayer';
  start(): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}
export interface AIController {
  update(deltaSeconds: number, players: readonly PlayerSnapshot[]): void;
  dispose(): void;
}
export interface CampaignMission {
  id: string;
  mapId: string;
  objectives: readonly { id: string; description: string }[];
}
export interface MultiplayerTransport {
  connect(sessionId: string, signal: AbortSignal): Promise<void>;
  sendInput(sequence: number, input: Readonly<Record<string, number | boolean>>): void;
  onSnapshot(handler: (players: readonly PlayerSnapshot[]) => void): () => void;
  disconnect(): void;
}
export interface AuthProvider {
  getSession(): Promise<{ userId: string; displayName: string } | null>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}
