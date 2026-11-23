export interface Settings {
  sensitivity: number;
  fov: number;
  volume: number;
  effectsVolume: number;
  musicVolume: number;
  renderScale: number;
  shadows: 'off' | 'low' | 'high';
  quality: 'high' | 'low';
  invertY: boolean;
  showFps: boolean;
  dynamicCrosshair: boolean;
}
export const DEFAULT_SETTINGS: Readonly<Settings> = {
  sensitivity: 1,
  fov: 85,
  volume: 0.35,
  effectsVolume: 1,
  musicVolume: 0.15,
  renderScale: 1,
  shadows: 'high',
  quality: 'high',
  invertY: false,
  showFps: false,
  dynamicCrosshair: true,
};
export const SETTINGS_KEY = 'tactical-fps.settings.v1';

export function parseSettings(raw: string | null): Settings {
  try {
    const value = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
    const number = (
      key: 'sensitivity' | 'fov' | 'volume' | 'effectsVolume' | 'musicVolume' | 'renderScale',
      min: number,
      max: number,
    ) => {
      const input = value[key];
      return typeof input === 'number' && Number.isFinite(input)
        ? Math.min(max, Math.max(min, input))
        : DEFAULT_SETTINGS[key];
    };
    return {
      sensitivity: number('sensitivity', 0.2, 3),
      fov: number('fov', 65, 110),
      volume: number('volume', 0, 1),
      effectsVolume: number('effectsVolume', 0, 1),
      musicVolume: number('musicVolume', 0, 1),
      renderScale: number('renderScale', 0.5, 1.5),
      shadows: value.shadows === 'off' || value.shadows === 'low' ? value.shadows : 'high',
      quality: value.quality === 'low' ? 'low' : 'high',
      invertY: value.invertY === true,
      showFps: value.showFps === true,
      dynamicCrosshair: value.dynamicCrosshair !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(settings: Settings): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
