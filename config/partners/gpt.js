/**
 * GPT - Google Publisher Tag (P0)
 * See _scaffold.js for all available options.
 */
export default {
  name: 'gpt',
  active: true,
  url: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
  properties: ['all'],
  domains: ['all'],
  consentState: [],
  timeout: 2000,
  include: {
    section: ['all'],
    pagetype: ['all'],
    geo: ['all']
  },
  exclude: {},
  preloadFn: function() {
    window.googletag = window.googletag || {};
    window.googletag.cmd = window.googletag.cmd || [];
  },
  onloadFn: function() {}
};
