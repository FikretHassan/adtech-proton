# Dynamic Injection

> **Optional Module**: Can be excluded from build by setting `optionalModules.injection: false` in `config/loader.js`

## Description

Injects ads into article content based on configurable counting rules. Supports two counting modes:
- **Character counting** (`countMode: 'chars'`) - Count paragraph characters, inject when threshold reached
- **Block counting** (`countMode: 'blocks'`) - Count content blocks (e.g., liveblog posts), inject when threshold reached

Supports multiple injection modes for different page types (articles, liveblogs, etc.) with dimension-based rule matching.

## Functionality

### Injection Flow

1. **Mode matching**: Find active mode that matches page context
2. **Rule matching**: Find rule within mode that matches dimensions
3. **Content counting**: Count characters or blocks based on `countMode`, inject when threshold reached
4. **Slot creation**: Create ad container divs in DOM
5. **GPT processing**: Define and request ads for injected slots

### Mode Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `active` | boolean | - | Enable/disable mode |
| `properties` | string[] | - | Property IDs where mode runs |
| `match` | object | - | Dimension criteria to match mode |
| `contentSelectors` | string[] | - | CSS selectors for content containers |
| `countMode` | string | `'chars'` | Counting mode: `'chars'` or `'blocks'` |
| `blockSelector` | string | - | CSS selector for blocks (required when `countMode: 'blocks'`) |
| `waitForEvent` | string | - | PubSub topic to wait for before injection |
| `customInjector` | function | - | Custom injection function (bypasses standard counting) |
| `defaultAdStyle` | object | - | Default inline styles for ad div (all rules) |
| `defaultLabelStyle` | object | - | Default inline styles for label (all rules) |
| `defaultWrapperStyle` | object | - | Default inline styles for container (all rules) |
| `onRender` | object | - | Styles applied when ad renders (see Style Hierarchy) |
| `rules` | array | - | Dimension-based injection rules |

### Rule Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `match` | object | Yes | Dimension criteria (include logic, AND) |
| `exclude` | object | No | Dimension criteria to exclude (blocks if any match) |
| `config` | object | Yes | Counting config (see below) |
| `wrapperClass` | string | No | Additional CSS class for container (additive to defaults) |
| `wrapperStyle` | mixed | No | Inline styles - string or object `{ minHeight: '250px' }` |
| `adClass` | string | No | Additional CSS class for inner ad div (additive) |
| `adStyle` | mixed | No | Inline styles for inner ad div |
| `label` | mixed | No | Label above ad: string, `{ text, class, style }`, or `false` |

### Config Properties

**Character mode** (`countMode: 'chars'` - default):

| Property | Type | Description |
|----------|------|-------------|
| `firstAd` | number | Character count before first ad |
| `otherAd` | number | Character count between subsequent ads |
| `maxAds` | number | Maximum ads to inject |
| `minParaChars` | number | Minimum characters for valid paragraph |

**Block mode** (`countMode: 'blocks'`):

| Property | Type | Description |
|----------|------|-------------|
| `firstAdBlock` | number | Number of blocks before first ad |
| `otherAdBlock` | number | Number of blocks between subsequent ads |
| `maxAds` | number | Maximum ads to inject |
| `minBlockChars` | number | Minimum characters for valid block |

### Overlap Detection

In debug mode (`?adDebugLogs`), warnings are logged when:
- Multiple modes match the current context
- Multiple rules match within a mode

This helps identify ambiguous configurations that should be tightened with `exclude` conditions.

### waitForEvent

Delays injection until a PubSub topic is published. Useful when content renders asynchronously after initial page load.

```javascript
export default {
  active: true,
  match: { pagetype: ['feed'] },
  waitForEvent: 'page.content.ready',  // Wait for async content
  contentSelectors: ['.feed-content'],
  rules: [...]
};
```

When `waitForEvent` is set:
1. `init()` subscribes to the topic with `runIfAlreadyPublished: true`
2. External `injectAds()` calls are blocked until the event fires
3. When event fires, injection runs and slots are processed if `loader.ads.ready` already fired

### customInjector

For complex injection scenarios that can't be expressed with standard counting rules, provide a custom function that handles all injection logic.

**Signature:**
```javascript
function customInjector(context, rule, helpers) {
  // Your injection logic here
  return { injected: number, slots: string[] };
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `context` | object | Page context from `loader.getContext()` |
| `rule` | object | Matched rule config (firstAd, otherAd, maxAds, etc.) |
| `helpers` | object | Utility functions (see below) |

**Helpers Object:**

| Helper | Signature | Description |
|--------|-----------|-------------|
| `createAdContainer` | `(index: number) => HTMLElement` | Creates styled container div |
| `insertAdBefore` | `(ref: Element, container: HTMLElement) => void` | Insert before element |
| `insertAdAfter` | `(ref: Element, container: HTMLElement) => void` | Insert after element |
| `buildSlotId` | `(index: number) => string` | Build slot ID (e.g., `advert_site_dyn_0`) |
| `trackSlot` | `(slotId: string) => void` | Register slot for GPT processing |
| `getState` | `() => object` | Get current injection state |
| `setState` | `(updates: object) => void` | Update injection state |
| `finishInjection` | `(results: object) => object` | Publish events and return results |
| `log` | `(message: string, data?: any) => void` | Debug logging |
| `warn` | `(message: string, data?: any) => void` | Warning logging |

**Example:**
```javascript
function myCustomInjector(context, rule, helpers) {
  var results = { injected: 0, slots: [] };
  var state = helpers.getState();
  var dynCount = state.dynCount || 0;

  function injectAd(referenceNode) {
    if (dynCount >= rule.maxAds) return false;
    var container = helpers.createAdContainer(dynCount);
    helpers.insertAdAfter(referenceNode, container);
    helpers.trackSlot(helpers.buildSlotId(dynCount));
    results.slots.push(helpers.buildSlotId(dynCount));
    results.injected++;
    dynCount++;
    return true;
  }

  // Your custom logic - iterate content and call injectAd()
  var items = document.querySelectorAll('.content-item');
  items.forEach(function(item, i) {
    if (i > 0 && i % rule.itemInterval === 0) {
      injectAd(item);
    }
  });

  helpers.setState({ dynCount: dynCount });
  return helpers.finishInjection(results);
}

export default {
  active: true,
  match: { pagetype: ['feed'] },
  waitForEvent: 'page.content.ready',
  customInjector: myCustomInjector,
  rules: [
    {
      match: { userState: ['anon'] },
      config: { maxAds: 6, itemInterval: 3 }
    },
    {
      match: { userState: ['sub'] },
      config: { maxAds: 2, itemInterval: 5 }
    }
  ]
};
```

### Style Hierarchy

Styles are applied in layers, with later layers overriding earlier ones:

```
globals.js defaults
    ↓
mode.defaultAdStyle / mode.defaultLabelStyle / mode.defaultWrapperStyle
    ↓
rule.adStyle / rule.labelStyle / rule.wrapperStyle
    ↓
mode.onRender (applied when ad renders via slot.afterRender hook)
```

**onRender Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `wrapperStyle` | object | Styles applied to container when ad renders |
| `labelStyle` | object | Styles applied to label when ad renders |
| `labelText` | string | Label text (set on creation, visible on render) |
| `adStyle` | object | Styles applied to ad div when ad renders |

**Example - ads start collapsed, expand on render:**
```javascript
export default {
  active: true,
  match: { pagetype: ['feed'] },
  defaultAdStyle: { height: '0px', opacity: '0' },
  defaultLabelStyle: { height: '0px' },
  onRender: {
    wrapperStyle: { height: 'auto', marginBottom: '24px' },
    labelStyle: { height: '25px' },
    labelText: 'Advertisement',
    adStyle: { height: 'auto', opacity: '1' }
  },
  rules: [...]
};
```

### API

```javascript
// Initialize with context
proton.dynamicInjection.init({ pagetype: 'story', viewport: 'x' })

// Get current rule
proton.dynamicInjection.getRule()

// Inject ads
proton.dynamicInjection.injectAds()

// Get injected slot IDs
proton.dynamicInjection.getInjectedSlots()

// Process injected slots (define GPT + request)
proton.dynamicInjection.processInjectedSlots(context)

// Remove all injected ads
proton.dynamicInjection.removeInjectedAds()

// Debug info
proton.dynamicInjection.debug()
```

### URL Overrides

**Character mode:**

| Parameter | Effect |
|-----------|--------|
| `?firstAd=X` | Override first ad character threshold |
| `?otherAd=X` | Override other ad character threshold |
| `?maxAds=X` | Override max ads |
| `?minParaChars=X` | Override min paragraph chars |

**Block mode:**

| Parameter | Effect |
|-----------|--------|
| `?firstAdBlock=X` | Override first ad block threshold |
| `?otherAdBlock=X` | Override other ad block threshold |
| `?maxAds=X` | Override max ads |
| `?minBlockChars=X` | Override min block chars |
| `?countMode=blocks` | Force block counting mode |

## Usage

### Configuration

Configuration is in `config/injection/` directory:

```
config/injection/
├── index.js              # Aggregates all modes
├── globals.js            # Global settings (enabled, adType, etc.)
├── dynamicMpus.js        # Article injection mode
├── liveblogs.js          # Liveblog injection mode
├── liveblogsBlocks.js    # Block-based liveblog mode
└── example.scaffold.js   # Template for new modes
```

**globals.js** (global settings):
```javascript
export default {
  enabled: true,
  adType: 'dyn',
  containerClass: 'advert-container dynamicMpu',
  adClass: 'js-advert advert advert--dyn',
  paragraphSelector: 'p',
  dataAttributes: { 'data-adtype': 'dyn' },
  contentElements: {
    'figure': { charValue: 200, canInjectAfter: false, canInjectBefore: false, canInjectBetweenSame: true },
    'blockquote': { charValue: 150, canInjectAfter: true, canInjectBefore: false },
    '[data-recommended-iframe]': { charValue: 300, canInjectAfter: true, canInjectBefore: true }
  },
  defaults: { firstAd: 550, otherAd: 1000, minParaChars: 150, maxAds: 6 },
  defaultLabel: {
    text: 'Advertisement',
    class: 'advert-label',
    style: { color: '#494949', fontSize: '12px', textAlign: 'center', marginBottom: '8px' }
  }
};
```

### Content Elements

The `contentElements` config controls per-element injection rules. Used in both char and block modes to determine valid injection positions.

| Property | Type | Description |
|----------|------|-------------|
| `charValue` | number | Characters this element counts toward threshold |
| `canInjectAfter` | boolean | Can inject ad directly after this element |
| `canInjectBefore` | boolean | Can inject ad directly before this element |
| `canInjectBetweenSame` | boolean | Override: allow injection between adjacent same-type elements |

**Injection decision logic:**
1. If element and nextSibling match SAME selector with `canInjectBetweenSame: true` → allow
2. Otherwise check element's `canInjectAfter`
3. Check nextSibling's `canInjectBefore`

Both must be true (or element not in config) for injection to proceed.

**Mode file** (e.g., dynamicMpus.js):
```javascript
export default {
  active: true,
  properties: ['siteA'],
  match: { pagetype: ['story', 'feature'] },
  contentSelectors: ['.article-body', "[data-content='article']"],
  rules: [
    // Desktop anonymous - fixed height containers
    {
      match: { viewport: ['x', 'l'], userState: ['anon'] },
      config: { firstAd: 550, otherAd: 1000, maxAds: 6 },
      wrapperClass: 'dynamicMpu--fixed-height'
    },
    // Mobile anonymous - expand on load
    {
      match: { viewport: ['m', 's'], userState: ['anon'] },
      config: { firstAd: 300, otherAd: 700, maxAds: 10 },
      wrapperClass: 'dynamicMpu--expand'
    },
    // Subscribers - fewer ads
    {
      match: { userState: ['sub'] },
      config: { firstAd: 800, otherAd: 1500, maxAds: 2 },
      wrapperClass: 'dynamicMpu--fixed-height'
    }
  ]
};
```

### Using Exclude for Fine-Grained Control

```javascript
rules: [
  // Premium subscribers get special treatment (check first)
  {
    match: { userState: ['premium_sub'] },
    config: { firstAd: 1000, otherAd: 2000, maxAds: 1 },
    wrapperClass: 'dynamicMpu--premium'
  },
  // Regular subscribers - exclude premium_sub to avoid overlap
  {
    match: { userState: ['sub'] },
    exclude: { userState: ['premium_sub'] },
    config: { firstAd: 800, otherAd: 1500, maxAds: 2 }
  },
  // Anonymous users
  {
    match: { userState: ['anon'] },
    config: { firstAd: 550, otherAd: 1000, maxAds: 6 }
  }
]
```

### Per-Rule Styling

```javascript
rules: [
  // Desktop - fixed height with inline styles and label
  {
    match: { viewport: ['x', 'l'] },
    config: { firstAd: 550, otherAd: 1000, maxAds: 6 },
    wrapperClass: 'dynamicMpu--desktop',
    wrapperStyle: { minHeight: '250px', backgroundColor: '#f5f5f5' },
    adClass: 'advert--desktop-injected',
    adStyle: { minHeight: '250px' },
    label: 'Advertisement'  // Simple string
  },
  // Mobile - custom label styling
  {
    match: { viewport: ['m', 's', 'xs'] },
    config: { firstAd: 300, otherAd: 700, maxAds: 10 },
    wrapperClass: 'dynamicMpu--mobile',
    wrapperStyle: 'min-height: 0; transition: min-height 0.3s;',
    label: {
      text: 'Sponsored',
      class: 'sponsor-label',
      style: { fontSize: '10px', color: '#999' }
    }
  },
  // Subscribers - no label
  {
    match: { userState: ['sub'] },
    config: { firstAd: 800, otherAd: 1500, maxAds: 2 },
    label: false  // Disable label
  }
]
```

### Style Format

Style properties (`wrapperStyle`, `adStyle`, `label.style`) accept two formats:

| Format | Syntax | Example |
|--------|--------|---------|
| Object | camelCase properties | `{ minHeight: '250px', backgroundColor: '#f5f5f5' }` |
| String | CSS syntax | `'min-height: 250px; background-color: #f5f5f5;'` |

## Usage Example

### Character Counting Logic

```
Article content:
├── Paragraph 1: 200 chars (total: 200)
├── Paragraph 2: 180 chars (total: 380)
├── Paragraph 3: 220 chars (total: 600) ← exceeds firstAd (550)
│   └── [AD INJECTED] ← reset count to 0
├── Paragraph 4: 300 chars (total: 300)
├── Paragraph 5: 350 chars (total: 650)
├── Paragraph 6: 400 chars (total: 1050) ← exceeds otherAd (1000)
│   └── [AD INJECTED] ← reset count to 0
└── ...continues until maxAds
```

### Block Counting Logic

For liveblogs and other block-based content:

```
Liveblog content (blockSelector: '.pinned-post-entry'):
├── Block 1 (total: 1)
├── Block 2 (total: 2)
├── Block 3 (total: 3) ← exceeds firstAdBlock (2)
│   └── [AD INJECTED] ← reset count to 0
├── Block 4 (total: 1)
├── Block 5 (total: 2)
├── Block 6 (total: 3) ← exceeds otherAdBlock (2)
│   └── [AD INJECTED] ← reset count to 0
└── ...continues until maxAds
```

**Block mode configuration example** (liveblogsBlocks.js):
```javascript
export default {
  active: true,
  properties: ['siteA'],
  match: { pagetype: ['live'], renderertype: ['liveblog-renderer'] },
  countMode: 'blocks',
  blockSelector: '.pinned-post-entry',
  contentSelectors: ['.live-blog-body', '.liveblog-container'],
  rules: [
    {
      match: { viewport: ['x', 'l'], userState: ['anon'] },
      config: { firstAdBlock: 2, otherAdBlock: 3, maxAds: 6, minBlockChars: 100 }
    },
    {
      match: { viewport: ['m', 's', 'xs'], userState: ['anon'] },
      config: { firstAdBlock: 2, otherAdBlock: 2, maxAds: 10, minBlockChars: 50 }
    }
  ]
};
```

### Manual Injection

```javascript
// Initialize with page context
proton.dynamicInjection.init({
  pagetype: 'story',
  viewport: 'x',
  userState: 'anon',
  section: 'news'
});

// Inject ads into content
const results = proton.dynamicInjection.injectAds();
console.log('Injected:', results.injected, 'slots');

// Process through GPT
proton.dynamicInjection.processInjectedSlots({
  site: 'mysite',
  zone: 'article'
});
```

### Multiple Content Selectors

```json
"contentSelectors": [
  ".article-body",           // Try first
  "[data-content='article']", // Fallback
  ".post-content"            // Last resort
]
```

First matching selector is used.

### Mode Matching Example

```json
"modes": {
  "liveblogs": {
    "match": {
      "pagetype": ["live"],
      "renderertype": ["liveBlogRenderer"]
    }
  },
  "articles": {
    "match": {
      "pagetype": ["story", "video", "longform"]
    }
  }
}
```

Modes are evaluated in order. First matching mode is used.

### PubSub Events

| Event | When |
|-------|------|
| `injection.{modeId}.load` | Mode matched |
| `injection.{modeId}.ignore` | Mode skipped |
| `injection.{modeId}.inactive` | Mode disabled |
| `injection.{modeId}.complete` | Mode processing finished |
| `dynamicInjection.slotCreated` | Slot injected |
| `dynamicInjection.complete` | All injection complete |
| `dynamicInjection.slotsProcessed` | GPT slots defined |
