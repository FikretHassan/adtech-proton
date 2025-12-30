/**
 * Video Ad Request URL Builder
 * Builds VAST-compatible video ad request URLs for GAM
 *
 * @module customFunctions/buildVideoUrl
 *
 * @description
 * Generates a complete GAM video ad request URL with targeting from Proton's
 * targeting system, plus any custom targeting provided. Supports custom
 * sizemapping per breakpoint and configurable ad types.
 *
 * @listens loader.customFunctions.ready - Subscribe to know when this function is available
 *
 * @example
 * // Wait for customFunctions to be ready
 * PubSub.subscribe('loader.customFunctions.ready', () => {
 *   const result = proton.customFunctions.buildVideoUrl({ slotId: 'preroll_1' });
 *   console.log(result.url);
 * });
 *
 * @example
 * // Basic usage - minimal config
 * const result = proton.customFunctions.buildVideoUrl({
 *   slotId: 'video_preroll_1'
 * });
 * // Returns: { url: 'https://securepubads...', targeting: {...}, slotId: 'video_preroll_1_1', pos: 1, correlator: 1234567890 }
 *
 * @example
 * // With custom targeting (including auction data)
 * const result = proton.customFunctions.buildVideoUrl({
 *   slotId: 'video_midroll',
 *   adType: 'vid',
 *   customTargeting: {
 *     category: 'sport',
 *     vidlen: '30',
 *     hb_pb: '2.50',
 *     hb_bidder: 'rubicon',
 *     amzn_b: 'abc123'
 *   }
 * });
 *
 * @example
 * // With video content metadata
 * const result = proton.customFunctions.buildVideoUrl({
 *   slotId: 'preroll',
 *   videoId: 'video_12345',
 *   cmsId: '2518824',
 *   customTargeting: { content_type: 'news' }
 * });
 *
 * @example
 * // With custom sizemapping per breakpoint
 * const result = proton.customFunctions.buildVideoUrl({
 *   slotId: 'preroll',
 *   sizemapping: {
 *     x: '1920x1080',
 *     l: '1280x720',
 *     m: '640x480',
 *     s: '400x300',
 *     xs: '300x250'
 *   }
 * });
 *
 * @example
 * // Different ad type (not 'vid')
 * const result = proton.customFunctions.buildVideoUrl({
 *   slotId: 'outstream_1',
 *   adType: 'outstream'
 * });
 *
 * @example
 * // Full configuration
 * const result = proton.customFunctions.buildVideoUrl({
 *   slotId: 'video_preroll_1',
 *   adType: 'vid',
 *   videoId: 'content_abc123',
 *   cmsId: '2518824',
 *   vastVersion: 'xml_vast4',
 *   sizemapping: { x: '640x480', m: '400x300' },
 *   customTargeting: {
 *     category: 'news',
 *     vidlen: '60',
 *     hb_pb: '3.00'
 *   }
 * });
 */

/**
 * Build a GAM video ad request URL
 *
 * @param {Object} options - Configuration options
 * @param {string} [options.slotId='video_preroll'] - Unique slot identifier for tracking
 * @param {string} [options.adType='vid'] - Ad type for targeting key 'at' and sizemapping lookup
 * @param {Object|string} [options.customTargeting={}] - Additional KVPs (object or semicolon-delimited string)
 * @param {string} [options.videoId=''] - Video content ID (appended to URL if provided)
 * @param {string} [options.cmsId=''] - CMS ID for video content (appended to URL if provided)
 * @param {string} [options.vastVersion='xml_vast4'] - VAST version: 'xml_vast3' or 'xml_vast4'
 * @param {Object} [options.sizemapping=null] - Custom sizes per breakpoint, e.g. { x: '640x480', m: '300x250' }
 * @param {boolean} [options.includeAuctionTargeting=true] - Auto-include targeting from runVideoAuction
 *
 * @returns {Object|null} Result object or null if Proton not available
 * @returns {string} returns.url - Complete VAST ad request URL
 * @returns {Object} returns.targeting - Combined targeting object (page + auction + custom + slot)
 * @returns {string} returns.slotId - The slotId you passed in
 * @returns {number} returns.correlator - Correlator value for request deduplication
 */
export default function buildVideoUrl(options = {}) {
  const loader = window.proton;
  if (!loader) {
    console.warn('[buildVideoUrl] Proton loader not available');
    return null;
  }

  // Require at least slotId
  if (!options?.slotId) {
    console.warn('[buildVideoUrl] slotId required');
    return null;
  }

  const {
    slotId = 'video_preroll',
    adType = 'vid',
    customTargeting = {},
    videoId = '',
    cmsId = '',
    vastVersion = 'xml_vast4',
    sizemapping = null,
    includeAuctionTargeting = true
  } = options;

  // Get current breakpoint
  const breakpoint = loader.sizemapping?.getBreakpoint() || 'x';

  // Resolve video size: custom sizemapping > config sizemapping > default
  let videoSize = '620x415';
  if (sizemapping && sizemapping[breakpoint]) {
    videoSize = sizemapping[breakpoint];
  } else {
    const configSizes = loader.sizemapping?.getConfig()?.adtypes?.[adType] || {};
    videoSize = configSizes[breakpoint] || '620x415';
  }

  // Build ad unit path
  const context = loader.environment?.buildContext?.() || {};
  const adUnitPath = loader.slots?.buildAdUnitPath(context) || '';

  // Build targeting: page-level first
  const pageTargeting = loader.adTargeting?.buildPageTargeting() || {};
  const combinedTargeting = { ...pageTargeting };

  // Auto-include auction targeting if available (from runVideoAuction)
  // Use wrapperAuctions.getAllAuctions() to access the internal auction storage
  if (includeAuctionTargeting && loader.wrapperAuctions?.getAllAuctions) {
    const allAuctions = loader.wrapperAuctions.getAllAuctions();
    const auctionResult = allAuctions[slotId];

    if (auctionResult) {
      // If urlParams exists (semicolon-delimited string from runVideoAuction), parse it
      if (auctionResult.urlParams) {
        auctionResult.urlParams.split(';').forEach(pair => {
          const [key, value] = pair.split('=');
          if (key && value) {
            combinedTargeting[key] = decodeURIComponent(value);
          }
        });
      }
      // Also merge targeting object if available
      if (auctionResult.targeting) {
        Object.assign(combinedTargeting, auctionResult.targeting);
      }

      loader.log?.('[buildVideoUrl] Included auction targeting', {
        slotId,
        prebid: auctionResult.prebid,
        amazonaps: auctionResult.amazonaps
      });
    }
  }

  // Merge customTargeting (supports both object and semicolon-delimited string)
  if (customTargeting) {
    if (typeof customTargeting === 'string') {
      // Parse semicolon-delimited string (matches monolith format)
      customTargeting.split(';').forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
          combinedTargeting[key] = decodeURIComponent(value);
        }
      });
    } else if (typeof customTargeting === 'object') {
      Object.assign(combinedTargeting, customTargeting);
    }
  }

  // Add slot-specific targeting
  combinedTargeting.vidslot = slotId;
  combinedTargeting.at = adType;

  // Build cust_params string
  const custParams = Object.entries(combinedTargeting)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      const value = Array.isArray(v) ? v.join(',') : String(v);
      return `${k}=${encodeURIComponent(value)}`;
    })
    .join('&');

  // Build correlator
  const correlator = Date.now();
  const pageUrl = encodeURIComponent(window.location.href);

  // Construct the VAST URL
  const url = 'https://securepubads.g.doubleclick.net/gampad/ads' +
    '?env=vp' +
    '&plcmt=1' +
    `&sz=${videoSize}` +
    (cmsId ? `&cmsid=${cmsId}` : '') +
    (videoId ? `&vid=${videoId}` : '') +
    '&gdfp_req=1' +
    '&impl=s' +
    '&unviewed_position_start=1' +
    `&output=${vastVersion}` +
    `&iu=${adUnitPath}` +
    '&hl=en' +
    `&cust_params=${encodeURIComponent(custParams)}` +
    `&description_url=${pageUrl}` +
    `&url=${pageUrl}` +
    '&ciu_szs=' +
    '&scp=' +
    `&correlator=${correlator}`;

  loader.log?.('[buildVideoUrl] Generated URL', { slotId, targeting: combinedTargeting });

  return {
    url,
    targeting: combinedTargeting,
    slotId,
    correlator
  };
}
