/**
 * Publisher Consent Configuration
 *
 * Define your consent state here. Partners/plugins can then specify which
 * consent states allow them to load via the `consentState` array.
 */

export default {
  /**
   * Returns current consent state
   * @returns {string} Consent state value used to gate partner loading
   */
  getState: () => {
    const dataLayer = window.dataLayer;
    if (!dataLayer || dataLayer.consentState === undefined) {
      return '';
    }
    if (dataLayer.consentState === 1) {
      return 'accept';
    }
    if (dataLayer.consentState === 2) {
      return 'reject';
    }
    return '';
  }
};
