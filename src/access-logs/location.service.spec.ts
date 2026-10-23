import { describe, expect, it } from 'vitest';
import { LocationService } from './location.service.js';

describe('offline city lookup', () => {
  const service = new LocationService();
  it('identifies Manaus and Amazonas without an external API', () => {
    expect(service.nearest(-3.10194, -60.025)).toMatchObject({ city: 'Manaus', region: 'Amazonas', country: 'BR' });
  });
  it('does not invent a city for remote ocean coordinates', () => {
    expect(service.nearest(0, -140)).toEqual({});
  });
});
