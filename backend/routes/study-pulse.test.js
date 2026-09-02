import { describe, it, expect } from 'vitest';
import { seedFrom } from '../../backend/routes/study-pulse.js';

describe('study pulse seedFrom', () => {
  it('returns stable output for the same request shape', () => {
    const req = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } };
    expect(seedFrom(req)).toBe(seedFrom(req));
  });

  it('returns a number', () => {
    const req = { ip: '10.0.0.5', socket: {} };
    expect(typeof seedFrom(req)).toBe('number');
  });
});
