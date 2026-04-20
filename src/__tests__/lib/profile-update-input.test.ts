import { validateProfileUpdate } from '@/lib/profile/update-input';

describe('validateProfileUpdate', () => {
  it('rejects non-object bodies', () => {
    expect(validateProfileUpdate(null).ok).toBe(false);
    expect(validateProfileUpdate('s').ok).toBe(false);
  });

  it('always includes updatedAt on a successful parse', () => {
    const r = validateProfileUpdate({});
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.updates.updatedAt).toBeInstanceOf(Date);
  });

  it('includes timezone when non-empty string', () => {
    const r = validateProfileUpdate({ timezone: 'America/Los_Angeles' });
    if (!r.ok) throw new Error();
    expect(r.updates.timezone).toBe('America/Los_Angeles');
  });

  it('skips timezone when empty string (partial-update semantics)', () => {
    const r = validateProfileUpdate({ timezone: '' });
    if (!r.ok) throw new Error();
    expect('timezone' in r.updates).toBe(false);
  });

  it('skips timezone when non-string', () => {
    const r = validateProfileUpdate({ timezone: 42 });
    if (!r.ok) throw new Error();
    expect('timezone' in r.updates).toBe(false);
  });

  it('serializes a valid availability array to JSON', () => {
    const r = validateProfileUpdate({ availability: [0, 100, 335] });
    if (!r.ok) throw new Error();
    expect(r.updates.availability).toBe('[0,100,335]');
  });

  it('rejects availability when not an array', () => {
    const r = validateProfileUpdate({ availability: 'not-an-array' });
    expect(r.ok).toBe(false);
  });

  it('rejects availability with out-of-range slots', () => {
    expect(validateProfileUpdate({ availability: [-1] }).ok).toBe(false);
    expect(validateProfileUpdate({ availability: [336] }).ok).toBe(false);
  });

  it('rejects availability with non-number entries', () => {
    expect(validateProfileUpdate({ availability: [0, '1', 2] }).ok).toBe(false);
  });

  it('rejects availability with NaN entries', () => {
    expect(validateProfileUpdate({ availability: [0, NaN] }).ok).toBe(false);
  });

  it('allows an empty availability array', () => {
    const r = validateProfileUpdate({ availability: [] });
    if (!r.ok) throw new Error();
    expect(r.updates.availability).toBe('[]');
  });
});
