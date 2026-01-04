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
 * | contentSelectors  | string[] | Yes*     | CSS selectors for content containers (first match)   |
 * | countMode         | string   | No       | 'chars' (default) or 'blocks'                        |
 * | blockSelector     | string   | No       | CSS selector for blocks (required if countMode: 'blocks') |
 * | waitForEvent      | string   | No       | PubSub topic to wait for before injection            |
 * | customInjector    | function | No       | Custom function for complex injection (bypasses counting) |
 * | defaultAdStyle    | object   | No       | Default styles for ad div (applied to all rules)     |
 * | defaultLabelStyle | object   | No       | Default styles for label (applied to all rules)      |
 * | onRender          | object   | No       | Styles applied when ad renders (via slot.afterRender)|
 * | rules             | array    | Yes      | Dimension-based injection rules                      |
 *
 * *contentSelectors not required when using customInjector
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
 *
 * ============================================================================
 * WAITFOREVENT EXAMPLE (async/deferred content):
 * ============================================================================
 *
 * Delays injection until a PubSub topic fires. Useful when content loads
 * asynchronously after initial page render.
 *
 * export default {
 *   active: true,
 *   match: { pagetype: ['feed'] },
 *   waitForEvent: 'page.content.ready',  // Waits for this PubSub topic
 *   contentSelectors: ['.feed-content'],
 *   rules: [...]
 * };
 *
 * ============================================================================
 * ONRENDER STYLE HIERARCHY (collapsed → expand on load):
 * ============================================================================
 *
 * Ads start collapsed and expand when they render. Prevents CLS (Cumulative
 * Layout Shift) by only expanding after ad content loads.
 *
 * export default {
 *   active: true,
 *   match: { pagetype: ['feed'] },
 *   // Initial state: collapsed
 *   defaultAdStyle: { height: '0px', opacity: '0' },
 *   defaultLabelStyle: { height: '0px' },
 *   // Applied when ad renders (via slot.afterRender hook)
 *   onRender: {
 *     wrapperStyle: { height: 'auto', marginBottom: '24px' },
 *     labelStyle: { height: '25px' },
 *     labelText: 'Advertisement',
 *     adStyle: { height: 'auto', opacity: '1' }
 *   },
 *   rules: [...]
 * };
 *
 * ============================================================================
 * CUSTOMINJECTOR EXAMPLE (complex injection logic):
 * ============================================================================
 *
 * For scenarios that can't be expressed with standard counting rules.
 * Bypasses the built-in counting and gives full control over injection.
 *
 * function myCustomInjector(context, rule, helpers) {
 *   // helpers available:
 *   //   createAdContainer(index) - creates styled container div
 *   //   insertAdBefore(ref, container) - insert before element
 *   //   insertAdAfter(ref, container) - insert after element
 *   //   buildSlotId(index) - builds slot ID string
 *   //   trackSlot(slotId) - registers slot for GPT processing
 *   //   getState() - get current injection state
 *   //   setState(updates) - update injection state
 *   //   finishInjection(results) - publish events and return
 *   //   log(message, data) - debug logging
 *   //   warn(message, data) - warning logging
 *
 *   var results = { injected: 0, slots: [] };
 *   var state = helpers.getState();
 *   var dynCount = state.dynCount || 0;
 *
 *   function injectAd(referenceNode) {
 *     if (dynCount >= rule.maxAds) return false;
 *     var container = helpers.createAdContainer(dynCount);
 *     helpers.insertAdAfter(referenceNode, container);
 *     helpers.trackSlot(helpers.buildSlotId(dynCount));
 *     results.slots.push(helpers.buildSlotId(dynCount));
 *     results.injected++;
 *     dynCount++;
 *     return true;
 *   }
 *
 *   // Your custom logic here - iterate content, apply rules, call injectAd()
 *   var items = document.querySelectorAll('.content-item');
 *   items.forEach(function(item, i) {
 *     if (i > 0 && i % rule.itemInterval === 0) {
 *       injectAd(item);
 *     }
 *   });
 *
 *   helpers.setState({ dynCount: dynCount });
 *   return helpers.finishInjection(results);
 * }
 *
 * export default {
 *   active: true,
 *   match: { pagetype: ['feed'] },
 *   waitForEvent: 'page.content.ready',
 *   customInjector: myCustomInjector,
 *   rules: [
 *     {
 *       match: { userState: ['anon'] },
 *       config: { maxAds: 6, itemInterval: 3 }
 *     },
 *     {
 *       match: { userState: ['sub'] },
 *       config: { maxAds: 2, itemInterval: 5 }
 *     }
 *   ]
 * };
 */
