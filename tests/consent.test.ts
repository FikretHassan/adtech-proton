import { describe, it, expect, beforeEach } from 'vitest';
import consent from '../config/consent.js';

describe('config/consent', () => {
  beforeEach(() => {
    // Reset dataLayer between tests
    // @ts-expect-error - mocking dataLayer
    delete (window as any).dataLayer;
  });

  it('returns empty string when dataLayer is unavailable', () => {
    expect(consent.getState()).toBe('');
  });

  it('returns "accept" when dataLayer.consentState is 1', () => {
    // @ts-expect-error - mocking dataLayer
    (window as any).dataLayer = { consentState: 1 };
    expect(consent.getState()).toBe('accept');
  });

  it('returns "reject" when dataLayer.consentState is 2', () => {
    // @ts-expect-error - mocking dataLayer
    (window as any).dataLayer = { consentState: 2 };
    expect(consent.getState()).toBe('reject');
  });

  it('returns empty string for other values', () => {
    // @ts-expect-error - mocking dataLayer
    (window as any).dataLayer = { consentState: 0 };
    expect(consent.getState()).toBe('');

    // @ts-expect-error - mocking dataLayer
    (window as any).dataLayer = { consentState: 'unknown' };
    expect(consent.getState()).toBe('');

    // @ts-expect-error - mocking dataLayer
    (window as any).dataLayer = {};
    expect(consent.getState()).toBe('');
  });
});
