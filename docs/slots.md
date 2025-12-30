# Slots Module

## Description

Discovers ad containers in the DOM, defines GPT slots with sizemapping and targeting, handles lazy loading via IntersectionObserver, and orchestrates ad requests.

## Functionality / Functions

### Discovery & Marking
| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `discoverSlots()` | none | `HTMLElement[]` | Returns all elements matching slot selector |
| `getUnobservedSlots()` | none | `HTMLElement[]` | Returns slots not yet marked as observed |
| `markObserved(element)` | element: HTMLElement | void | Adds observed class to element |
| `markLoaded(element)` | element: HTMLElement | void | Adds loaded class to element |

### Slot ID Parsing
| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `extractAdType(slotId)` | slotId: string | `string` | Extracts ad type (e.g., `ban` from `advert_mysite_ban_1`) |
| `extractIndex(slotId)` | slotId: string | `number\|null` | Extracts slot index from ID |

### Lazy Loading
| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `shouldLazyLoad(adType, slotId, breakpoint, context)` | various | `boolean` | Checks if slot should be lazy loaded |
| `getLazyOffset(breakpoint)` | breakpoint: string | `number` | Returns lazy load offset in pixels |
| `createLazyObserver(callback, breakpoint)` | callback: Function, breakpoint: string | `IntersectionObserver` | Creates observer for lazy loading |

### GPT Integration
| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `isOutOfPage(adType)` | adType: string | `boolean` | Checks if ad type is out-of-page |
| `buildAdUnitPath(context)` | context: {site, zone} | `string` | Builds DFP ad unit path |
| `getSlotCount(adType)` | adType: string | `number` | Returns and increments slot count for ad type |
| `defineGPTSlot(options)` | {slotId, adType, adUnitPath, sizes, targeting} | `Object\|null` | Defines a GPT slot |
| `requestAd(slotId)` | slotId: string | void | Requests ad for a defined slot |
| `enableServices()` | none | void | Enables GPT services with SRA |
| `injectOOPContainers()` | none | void | Injects out-of-page containers from config |
| `getDefinedSlots()` | none | `Map` | Returns all defined GPT slots |

### Orchestration
| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `processSlots(context, options)` | context: {site, zone}, options: {enableLazy, enableRefresh, pagetype, targeting} | `{processed, lazy, immediate, refreshScheduled, slots}` | Discovers, defines, requests slots, and schedules refresh |

### Slot Targeting
| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `setSlotTargeting(slotId, key, value)` | slotId: string, key: string, value: string \| string[] | `boolean` | Sets targeting on a defined slot |
| `setSlotTargetingBulk(slotId, targeting)` | slotId: string, targeting: Object | `boolean` | Sets multiple targeting keys at once |
| `getSlotTargeting(slotId, key?)` | slotId: string, key?: string | `string[] \| Object \| null` | Gets targeting value(s) for a slot |
| `clearSlotTargeting(slotId, keys?)` | slotId: string, keys?: string[] | `boolean` | Clears targeting on a slot |

### Lifecycle (SPA Support)
| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `refreshSlot(slotId, newTargeting?)` | slotId: string, newTargeting?: Object | `boolean` | Refreshes a single slot |
| `refreshSlots(filter, newTargeting?)` | filter: string \| {adType} \| 'all', newTargeting?: Object | `number` | Refreshes slots by filter |
| `destroySlot(slotId)` | slotId: string | `boolean` | Destroys a single GPT slot |
| `destroySlots(filter)` | filter: string \| {adType} | `number` | Destroys slots by ID or adType filter |
| `resetSlotCounts()` | none | void | Resets slot counts (for SPA navigation) |
| `getSlotCounts()` | none | `Object` | Returns current slot counts by adType |
| `reset()` | none | void | Full reset: destroys all slots, clears counts, removes observers, cancels refresh timers |

### Observer Management
| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `disconnectObservers(filter)` | filter: string \| {adType} \| 'all' | `number` | Disconnects lazy observers by filter |
| `getActiveObservers()` | none | `Map` | Returns Map of slotId → IntersectionObserver |

## Usage

Configure in `config/properties.json` (property-keyed structure):

```json
{
  "common": {
    "selector": ".js-advert",
    "observedClass": "js-advert-observed",
    "loadedClass": "is-loaded",
    "collapseEmptyDivs": true
  },
  "properties": {
    "mysite": {
      "prefix": "mysite",
      "networkId": "12345",
      "adUnitPath": "/12345/{site}.{zone}/{zone}",
      "testAdUnitPath": "/12345/test.test/test",
      "outOfPageTypes": ["oop", "skin"],
      "injectOOP": [
        {
          "id": "advert_mysite_oop",
          "className": "js-advert advert advert--oop",
          "dataAttributes": { "data-adType": "oop" }
        }
      ]
    },
    "default": {
      "prefix": "advert",
      "adUnitPath": "/12345/{site}.{zone}/{zone}",
      "outOfPageTypes": ["oop"],
      "injectOOP": []
    }
  }
}
```

Config merges `common` + property-specific settings. Override property with `?propertyOverride=dev`.

### PPID Configuration

PPID (Publisher Provided ID) uses function-based resolution. Define in property config:

```json
{
  "properties": {
    "mysite": {
      "ppid": { "source": "internal", "fn": "getPPID" }
    }
  }
}
```

**Supported sources:**

| Source | Properties | Description |
|--------|------------|-------------|
| `internal` | `fn` | Calls function from `config/targetingFunctions/` |
| `window` | `path` | Reads nested window path (e.g., `user.ppid`) |
| `cookie` | `key` | Reads cookie value |
| `meta` | `key` | Reads meta tag content |

**Custom PPID function (`config/targetingFunctions/getPPID.js`):**

```javascript
export default function getPPID() {
  // Return your PPID from wherever it's stored
  return window.myUser?.ppid || null;
}
```

Register in `config/targetingFunctions/index.js`:

```javascript
import getPPID from './getPPID.js';
export default { getPPID, /* other functions */ };
```

Configure lazy loading in `config/lazyload.json`:

```json
{
  "x": {
    "active": true,
    "offset": -750,
    "lazy": ["all"],
    "exempt": [],
    "exemptTypes": []
  }
}
```

## Usage Example

```javascript
// Process all slots on page (with auto-refresh scheduling)
const result = proton.slots.processSlots(
  { site: 'mysite', zone: 'news' },
  {
    enableLazy: true,
    enableRefresh: true,  // Auto-schedule refresh for eligible slots
    pagetype: 'story',    // Match rules in config/refresh.json
    targeting: { custom: 'value' }
  }
);
// { processed: 5, lazy: 3, immediate: 2, refreshScheduled: 2, slots: ['advert_mysite_ban_1', ...] }

// Disable auto-refresh if needed
proton.slots.processSlots(
  { site: 'mysite', zone: 'news' },
  { enableRefresh: false }
);

// Manual slot definition
proton.slots.defineGPTSlot({
  slotId: 'advert_mysite_mpu_1',
  adType: 'mpu',
  adUnitPath: '/12345/mysite/news',
  sizes: [[300, 250], [300, 600]],
  targeting: { custom: 'value' }
});

// Enable services and request
proton.slots.enableServices();
proton.slots.requestAd('advert_mysite_mpu_1');

// Check lazy load eligibility
const isLazy = proton.slots.shouldLazyLoad('mpu', 'advert_mysite_mpu_1', 'x', { geo: 'uk' });

// Get all defined slots
const allSlots = proton.slots.getDefinedSlots(); // Map

// === Lifecycle (SPA Support) ===

// Refresh a single slot (with optional new targeting)
proton.slots.refreshSlot('advert_mysite_ban_1', { adcount: '2' });

// Refresh all slots of a type
proton.slots.refreshSlots({ adType: 'ban' });

// Refresh all slots
proton.slots.refreshSlots('all');

// Destroy a single slot
proton.slots.destroySlot('advert_mysite_dyn_1');

// Destroy all slots of a type
proton.slots.destroySlots({ adType: 'dyn' }); // Returns count destroyed

// === Slot Targeting ===

// Set a single targeting key
proton.slots.setSlotTargeting('advert_mysite_ban_1', 'custom_key', 'value');

// Set multiple targeting keys at once
proton.slots.setSlotTargetingBulk('advert_mysite_ban_1', {
  custom_key: 'value',
  another_key: ['val1', 'val2']
});

// Get targeting for a specific key
const values = proton.slots.getSlotTargeting('advert_mysite_ban_1', 'custom_key');
// Returns: ['value']

// Get all targeting for a slot
const allTargeting = proton.slots.getSlotTargeting('advert_mysite_ban_1');
// Returns: { custom_key: ['value'], another_key: ['val1', 'val2'], ... }

// Clear targeting on a slot
proton.slots.clearSlotTargeting('advert_mysite_ban_1'); // All keys
proton.slots.clearSlotTargeting('advert_mysite_ban_1', ['custom', 'temp']); // Specific keys

// Full reset before SPA navigation
proton.slots.reset();
proton.gptEvents.reset(); // Also reset metrics

// Then re-process slots for new page
proton.slots.processSlots({ site: 'mysite', zone: 'sports' });

// === Observer Management ===

// Disconnect observers for specific slots (prevents orphaned callbacks)
proton.slots.disconnectObservers('advert_mysite_dyn_1'); // Single slot
proton.slots.disconnectObservers({ adType: 'dyn' });  // By type
proton.slots.disconnectObservers('all');              // All slots

// Access active observers
const observers = proton.slots.getActiveObservers(); // Returns Map
console.log('Active lazy observers:', observers.size);
```
