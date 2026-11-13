import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../src/core/settings';

describe('persisted user settings', () => {
  it.each([null, '', '{invalid', 'null', '42', '"hello"'])(
    'uses defaults for unavailable or corrupt data: %s',
    (raw) => {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    },
  );
  it('clamps numeric values and ignores unexpected fields', () => {
    expect(
      parseSettings(
        JSON.stringify({
          sensitivity: 100,
          fov: 0,
          volume: -1,
          invertY: 'true',
          quality: 'ultra',
          showFps: true,
          token: 'ignored',
        }),
      ),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      sensitivity: 3,
      fov: 65,
      volume: 0,
      quality: 'high',
      invertY: false,
      showFps: true,
      dynamicCrosshair: true,
    });
  });
  it('loads a valid saved configuration', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      sensitivity: 1.8,
      fov: 95,
      volume: 0.5,
      quality: 'low',
      invertY: true,
      showFps: false,
      dynamicCrosshair: false,
    };
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
  });
  it('rejects invalid numeric types without affecting valid fields', () => {
    expect(parseSettings('{"sensitivity":"2","fov":null,"volume":0.2}')).toEqual({
      ...DEFAULT_SETTINGS,
      volume: 0.2,
    });
  });
  it('migrates the previous settings while retaining master volume and adding independent channels', () => {
    const settings = parseSettings('{"volume":0.4,"quality":"low","invertY":true}');
    expect(settings.volume).toBe(0.4);
    expect(settings.effectsVolume).toBe(1);
    expect(settings.musicVolume).toBe(0.15);
    expect(settings.renderScale).toBe(1);
    expect(settings.shadows).toBe('high');
    expect(settings.quality).toBe('low');
    expect(settings.invertY).toBe(true);
  });
  it('validates graphics and audio sliders without accepting nonnumeric values', () => {
    expect(
      parseSettings('{"effectsVolume":3,"musicVolume":-1,"renderScale":4,"shadows":"off"}'),
    ).toMatchObject({ effectsVolume: 1, musicVolume: 0, renderScale: 1.5, shadows: 'off' });
    expect(
      parseSettings('{"effectsVolume":null,"musicVolume":"0","renderScale":0,"shadows":"ultra"}'),
    ).toMatchObject({ effectsVolume: 1, musicVolume: 0.15, renderScale: 0.5, shadows: 'high' });
  });
});
