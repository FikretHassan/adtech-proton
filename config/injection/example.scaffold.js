/**
 * Example Injection Mode Scaffold
 * Copy this file and customize for your injection mode.
 *
 * MODE-LEVEL OPTIONS:
 *
 * | Property          | Type     | Required | Description                                          |
 * |-------------------|----------|----------|------------------------------------------------------|
 * | active            | boolean  | Yes      | Enable/disable this mode                             |
 * | properties        | string[] | No       | Property IDs where mode runs (undefined = all)       |
 * | match             | object   | Yes      | Dimension criteria to match this mode                |
 * | contentSelectors  | string[] | Yes      | CSS selectors for content containers (first match)   |
 * | countMode         | string   | No       | 'chars' (default) or 'blocks'                        |
 * | blockSelector     | string   | No       | CSS selector for blocks (required if countMode: 'blocks') |
 * | rules             | array    | Yes      | Dimension-based injection rules                      |
 *
 * RULE-LEVEL OPTIONS:
 *
 * | Property      | Type   | Required | Description                                          |
 * |---------------|--------|----------|------------------------------------------------------|
 * | match         | object | Yes      | Dimension criteria (include logic, AND)              |
 * | exclude       | object | No       | Dimension criteria to exclude (blocks if any match)  |
 * | config        | object | Yes      | Counting config (firstAd, otherAd, maxAds, etc.)     |
 * | wrapperClass  | string | No       | Additional CSS class for container (additive)        |
 * | wrapperStyle  | mixed  | No       | Inline styles - string or object { minHeight: '250px' } |
 * | adClass       | string | No       | Additional CSS class for inner ad div (additive)     |
 * | adStyle       | mixed  | No       | Inline styles for inner ad div                       |
 * | label         | mixed  | No       | Label above ad: string, {text,class,style}, or false |
 *
 * CONFIG OPTIONS (character mode - default):
 *
 * | Property      | Type   | Description                                           |
 * |---------------|--------|-------------------------------------------------------|
 * | firstAd       | number | Characters before first ad                            |
 * | otherAd       | number | Characters between subsequent ads                     |
 * | minParaChars  | number | Minimum paragraph chars to count (filters short paras)|
 * | maxAds        | number | Maximum ads to inject                                 |
 *
 * CONFIG OPTIONS (block mode):
 *
 * | Property      | Type   | Description                                           |
 * |---------------|--------|-------------------------------------------------------|
 * | firstAdBlock  | number | Blocks before first ad                                |
 * | otherAdBlock  | number | Blocks between subsequent ads                         |
 * | minBlockChars | number | Minimum block chars to count (filters empty blocks)   |
 * | maxAds        | number | Maximum ads to inject                                 |
 */

export default {
  // Enable/disable this mode
  active: true,

  // Properties this mode applies to (undefined = all properties)
  properties: ['dev'],

  // Counting mode: 'chars' (default) or 'blocks'
  // countMode: 'chars',

  // CSS selector for blocks (required when countMode: 'blocks')
  // blockSelector: '.post, .entry, [data-block]',

  // Dimension matching for this mode (all must match)
  match: {
    pagetype: ['story'],
    // section: ['news', 'sport'],
    // renderertype: ['articleRenderer'],
  },

  // CSS selectors for content containers (first match wins)
  contentSelectors: [
    '.article-body',
    '.content-area',
    '[data-content="article"]'
  ],

  // Rules for different dimension combinations (first match wins)
  rules: [
    // Desktop anonymous - fixed height containers
    {
      match: {
        userState: ['anon'],
        viewport: ['x', 'l']
      },
      // exclude: { userState: ['premium_sub'] },  // Optional: exclude certain values
      config: {
        firstAd: 550,
        otherAd: 1000,
        maxAds: 6
      },
      wrapperClass: 'dynamicMpu--fixed-height',  // Optional: additional CSS class
      wrapperStyle: { minHeight: '250px' },      // Optional: inline styles (object or string)
      adClass: '',                               // Optional: additional class for inner ad div
      adStyle: {},                               // Optional: inline styles for inner ad div
      label: 'Advertisement'                     // Optional: string, {text,class,style}, or false
    },

    // Mobile anonymous - expand on load
    {
      match: {
        userState: ['anon'],
        viewport: ['m', 's', 'xs']
      },
      config: {
        firstAd: 300,
        otherAd: 600,
        maxAds: 10
      },
      wrapperClass: 'dynamicMpu--expand'
    },

    // Registered/subscriber users - fewer ads
    {
      match: {
        userState: ['reg', 'sub'],
        viewport: ['x', 'l', 'm', 's', 'xs']
      },
      config: {
        firstAd: 800,
        otherAd: 1500,
        maxAds: 2
      },
      wrapperClass: 'dynamicMpu--fixed-height'
    }
  ]
};

/**
 * BLOCK-BASED MODE EXAMPLE:
 *
 * export default {
 *   active: true,
 *   properties: ['dev'],
 *   countMode: 'blocks',
 *   blockSelector: '.blog-post, .pinned-post',
 *   match: { pagetype: ['live'] },
 *   contentSelectors: ['.blog-content'],
 *   rules: [
 *     {
 *       match: { userState: ['anon'], viewport: ['x', 'l'] },
 *       config: { firstAdBlock: 3, otherAdBlock: 5, maxAds: 10 },
 *       wrapperClass: 'liveblog-ad--fixed-height'
 *     },
 *     {
 *       match: { userState: ['anon'], viewport: ['m', 's', 'xs'] },
 *       config: { firstAdBlock: 2, otherAdBlock: 4, maxAds: 15 },
 *       wrapperClass: 'liveblog-ad--expand'
 *     }
 *   ]
 * };
 *
 * USING EXCLUDE FOR FINE-GRAINED CONTROL:
 *
 * rules: [
 *   // Premium subscribers get special treatment (check first)
 *   {
 *     match: { userState: ['premium_sub'] },
 *     config: { firstAd: 1000, otherAd: 2000, maxAds: 1 },
 *     wrapperClass: 'dynamicMpu--premium'
 *   },
 *   // Regular subscribers - exclude premium_sub
 *   {
 *     match: { userState: ['sub'] },
 *     exclude: { userState: ['premium_sub'] },
 *     config: { firstAd: 800, otherAd: 1500, maxAds: 2 }
 *   },
 *   // Anonymous users
 *   {
 *     match: { userState: ['anon'] },
 *     config: { firstAd: 550, otherAd: 1000, maxAds: 6 }
 *   }
 * ]
 */
