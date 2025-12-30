/**
 * Publisher Consent Configuration
 * Copy this file to consent.js.
 *
 * Define your consent state here. Partners/plugins can then specify which
 * consent states allow them to load via the `consentState` array.
 *
 * This is separate from dimensions to encourage consent-gated loading.
 * Partners without a consentState array load regardless of consent.
 *
 * Example partner config in partners.json:
 * {
 *   "name": "analytics",
 *   "consentState": ["full", "marketing"],
 *   "src": "https://example.com/analytics.js"
 * }
 *
 * This partner only loads when getState() returns "full" or "marketing".
 */

export default {
  /**
   * Returns current consent state
   * @returns {string} Consent state value used to gate partner loading
   */
  getState: () => {
    // Return your consent state here
    return '';
  }
};
