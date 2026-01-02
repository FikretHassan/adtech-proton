/**
 * CatchMetrics - Performance Monitoring
 * TMS example - analytics/tracking platform
 */
export default {
  name: 'catchmetrics',
  active: true,
  url: 'https://rum.catchmetrics.io/tag/rumdata.js',
  properties: ['all'],
  domains: ['all'],
  timeout: 2000,
  consentState: [],
  include: {
    pagetype: ['all'],
    viewport: ['all']
  },
  exclude: {},
  preloadFn: function() {},
  onloadFn: function() {}
};
