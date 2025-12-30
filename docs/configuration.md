# Configuration Reference

All configuration files for the plugin loader. JSON files are imported at build time. JS files allow dynamic logic.

---

## Table of Contents

- [config/loader.js](#configloaderjs)
- [config/consent.js](#configconsentjs)
- [config/properties.json](#configpropertiesjson)
- [config/partners/](#configpartners)
- [config/partners.json](#configpartnersjson)
- [config/targeting.json](#configtargetingjson)
- [config/sizemapping.json](#configsizemappingjson)
- [config/lazyload.json](#configlazyloadjson)
- [config/refresh.json](#configrefreshjson)
- [config/injection/](#configinjection)
- [config/sequencing.json](#configsequencingjson)
- [config/gptEvents.json](#configgpteventsjson)
- [config/dimensions.json](#configdimensionsjson)
- [config/hooks.js](#confighooksjs)
- [config/experiences.json](#configexperiencesjson)

---

## config/loader.js

Core loader settings.

```javascript
export default {
  globalName: 'proton',           // window.proton
  debugParam: 'adDebugLogs',      // ?adDebugLogs enables logging
  disableParam: 'adDisablePlugin', // ?adDisablePlugin=name disables plugin
  enableParam: 'adEnablePlugin',  // ?adEnablePlugin=name enables plugin
  readyTopic: 'cmp.ready',        // PubSub topic to wait for (null = immediate)
  pubsubGlobal: 'PubSub',         // Global PubSub instance name
  experimentalPubsub: null,       // Use external PubSub (e.g., 'myApp.pubsub')

  ads: {
    autoRequest: true,            // Auto-request ads when partners ready
    enableLazy: true,             // Enable lazy loading
    enableRefresh: true,          // Enable ad refresh
    sraBatching: {
      enabled: false              // Batch above-fold slots into fewer requests
    }
  },

  // Optional modules - set to false to exclude from build
  optionalModules: {
    sequencing: true,             // Ad sequencing
    injection: {                  // Dynamic article ad injection
      enabled: true,              // Master switch
      charMode: true,             // Character-based counting
      blockMode: true             // Block-based counting
    },
    customSlots: true,            // Dimension-targeted slot injection
    experiences: true,            // Experience loader
    refresh: true,                // Ad refresh timer
    experiments: true,            // A/B testing experiment manager
    customFunctions: true,        // Custom utility functions
    wrappers: true,               // Header bidding wrappers
    sraBatching: true             // SRA batching helpers
  }
};
```

| Key | Type | Description |
|-----|------|-------------|
| `globalName` | string | Global variable name for loader access |
| `debugParam` | string | URL parameter to enable debug logging |
| `readyTopic` | string\|null | PubSub topic to wait for before loading plugins |
| `pubsubGlobal` | string | Global PubSub instance name |
| `ads` | object | Ad request configuration |
| `optionalModules` | object | Build-time feature flags (see below) |

### optionalModules

Control which modules are included in the build. Set to `false` to exclude a module entirely (tree-shaken from bundle).

| Key | Default | Description |
|-----|---------|-------------|
| `sequencing` | true | Ad sequencing (priority slots load first) |
| `injection` | true | Dynamic article ad injection |
| `customSlots` | true | Dimension-targeted slot injection |
| `experiences` | true | Experience loader (custom code execution) |
| `refresh` | true | Ad refresh timer and viewability tracking |
| `experiments` | true | A/B testing experiment manager |
| `customFunctions` | true | Include custom utility functions from `config/customFunctions/` |
| `wrappers` | true | Header bidding wrappers (Prebid, APS, etc.) |
| `sraBatching` | true | Include SRA batching helpers; pairs with `ads.sraBatching.enabled` at runtime |

> Injection supports both character-based and block-based counting. In `config/loader.js`, set `optionalModules.injection` to `false` to remove injection entirely or toggle `charMode` / `blockMode` to disable specific counting strategies.

> SRA batching has two layers: `optionalModules.sraBatching` strips the code at build time, and `ads.sraBatching.enabled` toggles it on/off at runtime.

Disabling optional modules reduces bundle size.

---

## config/consent.js

Publisher-defined consent logic. Partners and experiences specify which consent states allow them to load.

```javascript
export default {
  /**
   * Returns current consent state
   * Publishers define the return values based on their CMP
   */
  getState: () => {
    // Return whatever consent state makes sense for your setup
    // Examples: 'true', 'false', 'full', 'marketing', 'none'
    if (hasCMPConsent()) return 'true';
    return 'false';
  }
};
```

| Key | Type | Description |
|-----|------|-------------|
| `getState` | function | Returns current consent state as string |

**Usage in partners/experiences:**
```javascript
consentState: ['true'],     // Load when consent.getState() returns 'true'
consentState: ['full', 'marketing'],  // Load when either value returned
consentState: [],           // No consent check - always load
```

---

## config/properties.json

Unified configuration for properties, slot discovery, GPT settings, and context dimensions.

```json
{
  "common": {
    "selector": ".js-advert",
    "observedClass": "js-advert-observed",
    "loadedClass": "is-loaded",
    "collapseEmptyDivs": true,
    "adUnitMappings": {
      "site": { "static": "default" },
      "zone": "section",
      "pagetype": "pagetype"
    }
  },
  "properties": {
    "dev": {
      "domains": ["localhost", "127.0.0.1"],
      "description": "Development fallback",
      "production": false,
      "prefix": "mysite",
      "networkId": "12345",
      "adUnitPath": "/12345/{site}.{zone}/{zone}",
      "adUnitMappings": {
        "site": { "static": "mysite.main" },
        "zone": "section",
        "pagetype": "pagetype"
      }
    },
    "mysite": {
      "domains": ["*.mysite.com"],
      "description": "My Site - Production",
      "production": true,
      "prefix": "mysite",
      "networkId": "12345",
      "adUnitPath": "/12345/{site}.{zone}/{zone}",
      "outOfPageTypes": ["oop", "skin"],
      "injectOOP": [
        { "id": "advert_mysite_oop", "className": "js-advert advert advert--oop" }
      ],
      "adUnitMappings": {
        "site": { "static": "mysite.main" },
        "zone": "section",
        "pagetype": "pagetype"
      }
    },
    "default": {
      "description": "Default fallback",
      "production": false,
      "prefix": "advert",
      "networkId": "12345",
      "adUnitPath": "/12345/{site}.{zone}/{zone}"
    }
  },
  "blockedDomains": [],
  "defaults": {
    "productionAds": false,
    "debugMode": false
  }
}
```

### Common Keys

| Key | Type | Description |
|-----|------|-------------|
| `selector` | string | CSS selector to find ad containers |
| `observedClass` | string | Class added when slot is observed |
| `loadedClass` | string | Class added when ad is loaded |
| `collapseEmptyDivs` | boolean | Collapse empty ad divs |
| `adUnitMappings` | object | Default ad unit path variable mappings |

### Property Keys

| Key | Type | Description |
|-----|------|-------------|
| `domains` | array | Domain patterns (supports `*` wildcard) |
| `description` | string | Human-readable name |
| `production` | boolean | Whether this is a production property |
| `prefix` | string | Slot ID prefix (e.g., `mysite`) |
| `networkId` | string | DFP network ID |
| `adUnitPath` | string | DFP ad unit path template |
| `testAdUnitPath` | string | Test ad unit path (used with `?adteston`) |
| `ppid` | object | PPID configuration |
| `outOfPageTypes` | array | Ad types using `defineOutOfPageSlot` |
| `injectOOP` | array | OOP containers to inject if missing |
| `adUnitMappings` | object | Property-specific ad unit path mappings |

### adUnitMappings

Maps ad unit path variables ({site}, {zone}, {pagetype}) to dimension values.

```json
{
  "adUnitMappings": {
    "site": { "static": "mysite.main" },
    "zone": "section",
    "pagetype": "pagetype"
  }
}
```

| Value Type | Example | Resolution |
|------------|---------|------------|
| `{ "static": "value" }` | `{ "static": "mysite.main" }` | Uses static value directly |
| `"dimensionName"` | `"section"` | Resolves via dimensions.json |
| `{ "source": "meta", "key": "..." }` | `{ "source": "meta", "key": "zone" }` | Resolves inline |

**Resolution:** Config merges `common` + property-specific settings. Falls back to `default` if property not found.

**Detection Order:**
1. URL parameter `?propertyOverride=name` (highest priority)
2. Domain matching against `domains` patterns
3. Falls back to `default` if no match

**Property Filtering:**
Partners, hooks, experiences, experiments, and injection modes can specify `properties: ['mysite']` to only run on specific properties.

---

## config/partners/

Partner definitions for external scripts. Each partner has its own file for maintainability.

```
config/partners/
├── index.js        # Aggregates all partners
├── gpt.js          # Google Publisher Tag
├── prebid.js       # Prebid header bidding
├── amazonaps.js    # Amazon APS
├── permutive.js    # Audience data
├── doubleverify.js # Brand safety
└── ...             # Other partners
```

### Partner File Structure

```javascript
// config/partners/mypartner.js
export default {
  name: 'mypartner',
  url: 'https://example.com/script.js',
  active: true,
  timeout: 3000,
  consentState: ['true'],  // Values from consent.getState() that allow loading
  include: { geo: ['uk', 'us'] },
  exclude: { pagetype: ['video'] },
  preloadFn: function() {},
  onloadFn: function() {},
  beforeRequest: {
    readyFn: 'onPartnerReady',
    timeout: 100
  }
};
```

### Index File

Register all partners in `config/partners/index.js`:

```javascript
import gpt from './gpt.js';
import prebid from './prebid.js';
import mypartner from './mypartner.js';

export default { gpt, prebid, mypartner };
```

| Key | Type | Description |
|-----|------|-------------|
| `name` | string | Unique partner identifier |
| `url` | string | Script URL to load |
| `active` | boolean | Enable/disable plugin |
| `timeout` | number | Script load timeout (ms) |
| `consentState` | array | Consent states that allow loading (from `consent.getState()`) |
| `include` | object | Targeting rules to include |
| `exclude` | object | Targeting rules to exclude |
| `preloadFn` | function | Runs immediately on register |
| `onloadFn` | function | Runs after script loads |
| `beforeRequest` | object | Pre-request hook configuration |

### Consent State

Partners specify which consent states allow them to load. The values match what `consent.getState()` returns:

```javascript
consentState: ['true'],     // Load only when consent.getState() returns 'true'
consentState: ['full', 'marketing'],  // Load when either value returned
consentState: [],           // No consent check - always load
```

### beforeRequest Hook

Partners that need to run code before each `googletag.display()` call (e.g., brand safety vendors setting targeting):

```javascript
brandSafety: {
  preloadFn: function() {
    // Create ready function that vendor library will call
    window.onVendorReady = function(callback, timeout = 1000) {
      window.vendor = window.vendor || {};
      window.vendor.cmd = window.vendor.cmd || [];
      window.vendor.cmd.push(function() {
        window.vendor.queueAdRequest({ callback, timeout });
      });
      // Fallback timeout
      setTimeout(function() { callback(); }, timeout);
    };
  },
  beforeRequest: {
    readyFn: 'onVendorReady',  // Window function to call
    timeout: 100               // Safety timeout (ms)
  }
}
```

**Resilience behavior:**
- Only runs for partners with `status: 'loaded'`
- Skipped entirely if partner is `inactive`, `error`, `timeout`, or `ignore`
- No fallback timeout triggered for disabled partners
- If `readyFn` doesn't exist on window, hook is skipped
- If calling `readyFn` throws, resolves immediately (no hang)
- Always has a safety timeout so it never blocks forever

---

## config/partners.json

Partner orchestration with timeout management.

```json
{
  "blocking": [
    { "name": "gpt", "timeout": 2000, "active": true },
    { "name": "headerBidder", "timeout": 1500, "dependsOn": "gpt" }
  ],
  "independent": [
    { "name": "audienceProvider" }
  ],
  "nonCore": [
    { "name": "analytics" }
  ],
  "defaults": {
    "universalTimeout": 3500,
    "independentTimeout": 1000,
    "nonCoreTimeout": 5000,
    "minTimeout": 500
  }
}
```

| Category | Description | Timeout |
|----------|-------------|---------|
| `blocking` | Must complete before GAM call | Per-partner timeout |
| `independent` | Must have before GAM, but no order required | Shared `independentTimeout` |
| `nonCore` | No GAM dependency | Shared `nonCoreTimeout` |

| Partner Key | Type | Description |
|-------------|------|-------------|
| `name` | string | Partner name (matches plugin name). Ready event is auto-derived as `plugin.{name}.complete` |
| `timeout` | number | Timeout in ms (blocking partners only) |
| `dependsOn` | string | Partner that must complete first (blocking only) |
| `active` | boolean | Enable/disable partner |

| Default Key | Description |
|-------------|-------------|
| `universalTimeout` | Total timeout for blocking partners |
| `independentTimeout` | Shared timeout for all independent partners |
| `nonCoreTimeout` | Shared timeout for all nonCore partners |
| `minTimeout` | Minimum timeout floor |

---

## config/targeting.json

GPT targeting key sources. Supports property-specific configuration using `common` + `properties` pattern.

```json
{
  "normalization": {
    "enabled": true,
    "maxKeyLength": 20,
    "maxValueLength": 40,
    "sanitize": false,
    "trimWhitespace": true
  },
  "common": {
    "pageLevel": {
      "vp": { "source": "internal", "fn": "getBreakpoint" },
      "lang": { "source": "window", "path": "navigator.language", "transform": "lowercase" }
    },
    "slotLevel": {
      "div": { "source": "slot", "property": "id" },
      "at": { "source": "slot", "property": "adType" },
      "pos": { "source": "slot", "property": "count" }
    }
  },
  "properties": {
    "siteA": {
      "pageLevel": {
        "sc": { "source": "meta", "key": "section" },
        "geo": {
          "sources": [
            { "source": "window", "path": "user.country" },
            { "source": "cookie", "key": "geo" },
            { "source": "static", "value": "unknown" }
          ]
        }
      }
    }
  }
}
```

**Resolution:** Merges `common` + `properties[currentProperty]` at runtime.

### Normalization Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | true | Enable/disable normalization |
| `maxKeyLength` | number | 20 | Max characters for keys |
| `maxValueLength` | number | 40 | Max characters for values |
| `sanitize` | boolean | false | Remove non-alphanumeric chars |
| `trimWhitespace` | boolean | true | Trim whitespace |

### Source Types

| Source | Properties | Description |
|--------|------------|-------------|
| `meta` | `key` | Reads `<meta name="key">` |
| `cookie` | `key` | Reads cookie by name |
| `window` | `path` | Reads nested path (e.g., `navigator.language`) |
| `url` | `key` | Reads URL query parameter |
| `internal` | `fn` | Calls registered internal function |
| `static` | `value` | Returns static value |
| `slot` | `property` | Reads from slot context |

Use `sources` array for fallback chains (first truthy value wins):

```json
{
  "geo": {
    "sources": [
      { "source": "window", "path": "user.country" },
      { "source": "cookie", "key": "geo" },
      { "source": "static", "value": "unknown" }
    ]
  }
}
```

### Transforms

| Transform | Description |
|-----------|-------------|
| `lowercase` | Convert to lowercase |
| `uppercase` | Convert to uppercase |
| `removeTrailingColon` | Remove trailing `:` |
| `toString` | Convert to string |

See [adTargeting.md](adTargeting.md) for full documentation.

---

## config/sizemapping.json

Responsive ad sizes by breakpoint.

```json
{
  "breakpoints": {
    "x":  { "minWidth": 1200, "minHeight": 900 },
    "l":  { "minWidth": 1024, "minHeight": 768 },
    "m":  { "minWidth": 768, "minHeight": 480 },
    "s":  { "minWidth": 480, "minHeight": 320 },
    "xs": { "minWidth": 0, "minHeight": 0 }
  },
  "adTypes": {
    "ban": {
      "x":  [[970,250], [728,90], "fluid"],
      "m":  [[728,90], "fluid"],
      "s":  [[320,50], [300,250], "fluid"]
    },
    "mpu": {
      "x":  [[300,600], [300,250], "fluid"],
      "s":  [[300,250], "fluid"]
    }
  },
  "slotOverrides": {
    "advert_mysite_special_1": {
      "x": [[970,250], "fluid"]
    }
  }
}
```

| Key | Description |
|-----|-------------|
| `breakpoints` | Viewport breakpoint definitions |
| `adTypes` | Size arrays per ad type per breakpoint |
| `slotOverrides` | Slot-specific size overrides |

See [sizemapping.md](sizemapping.md) for full documentation.

---

## config/lazyload.json

Per-breakpoint lazy loading settings. Uses IntersectionObserver to defer ad requests until slots approach the viewport.

```json
{
  "x": {
    "active": true,
    "offset": -750,
    "lazy": ["all"],
    "exempt": [],
    "exemptTypes": ["oop", "skin"]
  },
  "m": {
    "active": true,
    "offset": -250,
    "lazy": ["mpu", "ban"],
    "exempt": ["advert_mysite_ban_1"],
    "exemptTypes": []
  }
}
```

| Key | Type | Description |
|-----|------|-------------|
| `active` | boolean | Enable lazy loading for this breakpoint |
| `offset` | number | IntersectionObserver rootMargin - how far before viewport to trigger. `-750` means trigger when slot is 750px below the visible viewport |
| `lazy` | array | Ad types to lazy load. `["all"]` for all types, or specific types like `["mpu", "ban"]` |
| `exempt` | array | Specific slot IDs that should never be lazy loaded (load immediately). Example: `["advert_mysite_ban_1"]` |
| `exemptTypes` | array | Ad types that should never be lazy loaded. Use for out-of-page slots that need immediate loading. Example: `["oop", "skin"]` |

### How offset works

```
User scrolls down
    │
    ▼
Slot is 750px below viewport
    │
    ├── offset: -750 triggers IntersectionObserver
    │
    ▼
Fire ad request immediately
```

The `offset` lets you pre-load ads before they enter the viewport, improving perceived performance.

---

## config/refresh.json

Ad refresh settings using dimension-based targeting.

```json
{
  "enabled": true,
  "pauseOnHidden": true,
  "requireUserActivity": true,
  "fadeOutDuration": 300,
  "defaults": {
    "refreshRate": 11000,
    "refreshCycle": 0
  },
  "rules": [
    {
      "include": { "pagetype": ["story"], "viewport": ["x", "l"] },
      "adType": "mpu",
      "refreshRate": 11000,
      "refreshCycle": 0
    },
    {
      "include": { "pagetype": ["story"], "viewport": ["m", "s", "xs"] },
      "adType": "ban",
      "refreshRate": 15000,
      "refreshCycle": 2
    },
    {
      "include": { "pagetype": ["index"], "viewport": ["all"] },
      "adType": "ban",
      "refreshRate": 11000,
      "refreshCycle": 1
    }
  ]
}
```

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Master enable/disable |
| `pauseOnHidden` | boolean | Pause when tab hidden |
| `requireUserActivity` | boolean | Wait for user activity |
| `fadeOutDuration` | number | Fade out duration (ms) |
| `defaults` | object | Default values for rules |
| `rules` | array | Flat array of rules with dimension targeting |

### Rule Properties

| Property | Type | Description |
|----------|------|-------------|
| `include` | object | Dimension values to match (from dimensions.json) |
| `exclude` | object | Dimension values to exclude |
| `adType` | string | Target ad type |
| `slotIds` | array | Specific slot IDs (if omitted, applies to all slots matching adType) |
| `refreshRate` | number | Time between refreshes (ms) |
| `refreshCycle` | number | Max refreshes (0 = unlimited) |
| `slotVisibleThreshold` | number | Visibility threshold (0.5 to 1.0) for this rule. Default: 0.5 |

See [adRefresh.md](adRefresh.md) for full documentation.

---

## config/injection/

Dynamic ad injection is configured via JS files in the `config/injection/` directory:

```
config/injection/
├── index.js              # Aggregates all modes
├── globals.js            # Global settings
├── dynamicMpus.js        # Article injection mode
├── liveblogs.js          # Liveblog injection mode
├── liveblogsBlocks.js    # Block-based liveblog mode
└── example.scaffold.js   # Template for new modes
```

### globals.js

Global settings that apply to all modes:

```javascript
export default {
  enabled: true,
  eventPrefix: 'injection',
  adType: 'dyn',
  containerClass: 'advert-container dynamicMpu',
  adClass: 'js-advert advert advert--dyn',
  defaults: { firstAd: 550, otherAd: 1000, minParaChars: 150, maxAds: 6 },
  defaultLabel: {
    text: 'Advertisement',
    class: 'advert-label',
    style: { color: '#494949', fontSize: '12px', textAlign: 'center', marginBottom: '8px' }
  }
};
```

| Key | Description |
|-----|-------------|
| `enabled` | Master enable/disable |
| `eventPrefix` | PubSub event prefix (e.g., `injection.{mode}.load`) |
| `defaults` | Default values when rules don't specify |
| `defaultLabel` | Default label config: `{ text, class, style }` |

### Mode Files

Each mode is a separate file exporting a config object:

```javascript
// dynamicMpus.js
export default {
  active: true,
  match: { pagetype: ['story', 'video', 'longform'] },
  contentSelectors: ['.articleBodyText', '.article-body-text'],
  rules: [
    { match: { userState: ['anon'], viewport: ['x', 'l'] }, config: { firstAd: 550, otherAd: 1000, maxAds: 6 } },
    { match: { userState: ['anon'], viewport: ['m', 's'] }, config: { firstAd: 300, otherAd: 700, maxAds: 50 } },
    { match: { userState: ['reg', 'sub'], viewport: ['x', 'l'] }, config: { firstAd: 550, otherAd: 1000, maxAds: 2 } }
  ]
};
```

### Mode Properties

| Property | Type | Description |
|----------|------|-------------|
| `active` | boolean | Enable/disable mode |
| `countMode` | string | `'chars'` (default) or `'blocks'` |
| `blockSelector` | string | CSS selector for blocks (when `countMode: 'blocks'`) |
| `match` | object | Dimensions to match for mode activation |
| `contentSelectors` | array | CSS selectors to find article content |
| `rules` | array | Rules with match + config |

### Rule Config Properties

| Config Property | Type | Description |
|-----------------|------|-------------|
| `firstAd` | number | Characters before first ad (chars mode) |
| `otherAd` | number | Characters between subsequent ads (chars mode) |
| `firstAdBlock` | number | Blocks before first ad (blocks mode) |
| `otherAdBlock` | number | Blocks between subsequent ads (blocks mode) |
| `maxAds` | number | Maximum ads to inject |
| `minParaChars` | number | Min paragraph length before injection |

### Adding a New Mode

1. Create a new file (e.g., `config/injection/myMode.js`)
2. Export your mode config (see `example.scaffold.js`)
3. Import and add to `index.js`:

```javascript
import myMode from './myMode.js';

const modes = {
  // ... existing modes
  my_mode: myMode,
};
```

---

## config/sequencing.json

Ad sequencing rules for brand safety.

```json
{
  "enabled": true,
  "rules": [
    {
      "name": "Sensitive Content",
      "description": "Priority ads for sensitive topics",
      "match": {
        "pt": ["story"],
        "kw": ["sensitive-topic"]
      }
    }
  ]
}
```

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Master enable/disable |
| `rules` | array | Sequencing rule definitions |

### Rule Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Rule identifier |
| `description` | string | Human-readable description |
| `match` | object | Key-value criteria to match |

The `match` object uses keys from your resolved dimension values (from `dimensions.json`). When a rule matches, priority ad types load first.

**URL Overrides:**
- `?adsequenceon` - Force enable sequencing
- `?adsequenceoff` - Force disable sequencing

---

## config/gptEvents.json

GPT event handler settings.

```json
{
  "classes": {
    "loaded": "is-loaded",
    "empty": "is-empty"
  },
  "emptySlots": {
    "collapse": true,
    "hideContainer": true,
    "containerSuffix": "_container"
  },
  "opacity": {
    "filled": 1,
    "empty": 0
  },
  "pubsub": {
    "slotRendered": "ads.slot.{slotId}.rendered",
    "firstAdRendered": "ads.firstAdRendered",
    "slotEmpty": "ads.slot.{slotId}.empty"
  },
  "metrics": {
    "enabled": true
  }
}
```

| Key | Description |
|-----|-------------|
| `classes` | CSS classes for slot states |
| `emptySlots` | Empty slot handling |
| `opacity` | Opacity values for states |
| `pubsub` | PubSub topic templates |
| `metrics` | Metrics collection settings |

See [gptEvents.md](gptEvents.md) for full documentation.

---

## config/dimensions.json

Sources for plugin targeting dimensions. Dimensions are resolved at runtime and used for `include`/`exclude` targeting across partners, experiences, injection rules, refresh rules, and custom slots.

Dimensions support property-specific configuration using the same `common` + `properties` pattern as targeting.json.

```json
{
  "common": {
    "url": {
      "source": "window",
      "path": "location.pathname",
      "matchType": "startsWith"
    },
    "section": {
      "source": "meta",
      "key": "ads.zone",
      "matchType": "exact"
    },
    "pagetype": {
      "source": "meta",
      "key": "ads.pagetype",
      "matchType": "exact"
    },
    "geo": {
      "source": "meta",
      "key": "ads.geo",
      "matchType": "exact"
    },
    "viewport": {
      "source": "internal",
      "fn": "sizemapping.getBreakpoint",
      "matchType": "exact"
    }
  },

  "properties": {
    "mysite": {
      "userState": {
        "source": "window",
        "path": "site.user.loginStatus",
        "matchType": "exact",
        "mapping": {
          "anonymous": "anon",
          "registered": "reg",
          "subscriber": "sub"
        },
        "default": "anon"
      }
    },
    "dev": {
      "userState": {
        "source": "static",
        "value": "dev-anon",
        "matchType": "exact"
      }
    },
    "default": {
      "userState": {
        "source": "static",
        "value": "anon",
        "matchType": "exact"
      }
    }
  }
}
```

**Resolution:** Merges `common` + `properties[currentProperty]`. Falls back to `properties.default` if property not found.

### Debugging Dimensions

```javascript
proton.getDimension()           // Returns all dimensions with resolved values
proton.getDimension('userState') // Returns specific dimension value
```

### Dimension Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `source` | string | Yes | Data source type (see Source Types below) |
| `key` / `path` | string | Varies | Key name or path to value (depends on source type) |
| `matchType` | string | No | How to match values (`exact`, `startsWith`, `includes`) |
| `mapping` | object | No | Map raw values to normalized values (window source only) |
| `default` | string | No | Default value when source is undefined or not in mapping (window source only) |

### Source Types

| Source | Properties | Description |
|--------|------------|-------------|
| `meta` | `key` | Reads `<meta name="key">` content |
| `window` | `path` | Reads nested path (e.g., `user.loginStatus`) |
| `cookie` | `key` | Reads cookie by name |
| `queryParam` | `key` | Reads URL query parameter |
| `localStorage` | `key` | Reads from localStorage |
| `sessionStorage` | `key` | Reads from sessionStorage |
| `dataAttribute` | `key`, `selector` | Reads data attribute from element |
| `static` | `value` | Returns static value |
| `internal` | `fn` | Calls internal function (e.g., `sizemapping.getBreakpoint`) |

### Match Types

| Type | Description |
|------|-------------|
| `exact` | Exact match only (default) |
| `startsWith` | Value starts with target |
| `includes` | Value contains target anywhere |

### Value Mapping

Use `mapping` to normalize raw values from the source into consistent values for targeting rules:

```json
{
  "userState": {
    "source": "window",
    "path": "user.loginStatus",
    "mapping": {
      "anonymous": "anon",
      "registered": "reg",
      "subscriber": "sub",
      "loggedIn": "reg"
    },
    "default": "anon"
  }
}
```

With this config:
- `user.loginStatus = "anonymous"` → dimension returns `"anon"`
- `user.loginStatus = "subscriber"` → dimension returns `"sub"`
- `user.loginStatus = undefined` → dimension returns `"anon"` (default)
- `user.loginStatus = "unknown"` → dimension returns `"anon"` (not in mapping, uses default)

This allows injection rules like `{ userState: ['anon'] }` to work regardless of what raw values the CMS provides.

### Fallback Chains (targeting.json only)

Use `sources` array to try multiple sources in order. First truthy value wins. Note: This feature is only supported in `targeting.json`, not in `dimensions.json`.

```json
// targeting.json example
{
  "pageLevel": {
    "geo": {
      "sources": [
        { "source": "window", "path": "user.country" },
        { "source": "cookie", "key": "geo_country" },
        { "source": "meta", "key": "geo" },
        { "source": "static", "value": "unknown" }
      ]
    }
  }
}
```

Resolution order: window path > cookie > meta tag > static fallback.

---

## config/hooks.js

Lifecycle hook registrations.

```javascript
export default {
  'partners.afterReady': [
    {
      name: 'setCustomTargeting',
      priority: 1,
      fn: (status, elapsed) => {
        googletag.pubads().setTargeting('load_time', String(elapsed));
      }
    }
  ],
  'slot.afterRender': [
    {
      name: 'trackImpression',
      fn: (slotId, event, info) => {
        analytics.track('ad_impression', { slot: slotId });
      }
    }
  ]
};
```

### Hook Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | required | Unique hook identifier |
| `fn` | function | required | Function to execute |
| `priority` | number | 8 | Execution order 1-16 (lower = earlier) |
| `async` | boolean | false | Whether to await hook |
| `once` | boolean | false | Auto-unregister after first run |

See [hooks.md](hooks.md) for all lifecycle points and examples.

---

## config/experiences.json

Experience loader global settings. Individual experiences are defined in `config/experiences/*.js` files.

```json
{
  "enabled": true,
  "eventPrefix": "experience"
}
```

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Master enable/disable |
| `eventPrefix` | string | Prefix for lifecycle events |

### Experience Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Unique identifier |
| `active` | boolean | Enable/disable |
| `description` | string | Human-readable description |
| `fn` | function | Inline function to execute when targeting matches |
| `include` | object | Dimension rules (ALL must match) |
| `exclude` | object | Dimension rules (ANY blocks) |
| `consentState` | array | Consent states that allow execution (`[]` for no check) |
| `priority` | number | Execution order (lower = earlier) |

### Experience Functions

Define functions in `config/experiences/*.js`:

```javascript
// config/experiences/example.js
export function exampleGbNews(context) {
  console.log('Experience triggered for', context.section);
  return { success: true };
}
```

Each file exports a complete experience config. Import and add to the array in `config/experiences/index.js`.

**URL Overrides:**
- `?experienceEnable=name1,name2` - Force enable specific experiences
- `?experienceDisable=all` - Disable all experiences
- `?experienceDisable=name` - Disable specific experience

See [experienceLoader.md](experienceLoader.md) for full documentation.

---

## config/hooks/ Directory

Place custom hook function files here. Files are imported into `config/hooks.js`.

Example structure:
```
config/hooks/
├── demoHooks.js      # Example hooks for testing
├── analytics.js      # Analytics tracking hooks
└── brandSafety.js    # Brand safety hooks
```

See `config/hooks/demoHooks.js` for a complete example of hooks at every lifecycle point.
