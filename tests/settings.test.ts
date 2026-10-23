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
      sensitivity: 3,
      fov: 65,
      volume: 0,
      quality: 'high',
      invertY: false,
      showFps: true,
    });
  });
  it('loads a valid saved configuration', () => {
    const settings = {
      sensitivity: 1.8,
      fov: 95,
      volume: 0.5,
      quality: 'low',
      invertY: true,
      showFps: false,
    };
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
  });
  it('rejects invalid numeric types without affecting valid fields', () => {
    expect(parseSettings('{"sensitivity":"2","fov":null,"volume":0.2}')).toEqual({
      ...DEFAULT_SETTINGS,
      volume: 0.2,
    });
  });
});
