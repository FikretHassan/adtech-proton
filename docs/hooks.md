# Lifecycle Hooks

The hooks system allows publishers to inject custom code at key points in the ad lifecycle. This enables custom tracking, targeting modifications, error handling, and integration with external systems without modifying core library code.

## Quick Start

### Via Configuration (config/hooks.js)

```javascript
export default {
  'partners.afterReady': [
    {
      name: 'setCustomTargeting',
      fn: (partnerStatus, elapsed) => {
        googletag.pubads().setTargeting('load_time', String(elapsed));
      }
    }
  ],
  'slot.afterRender': [
    {
      name: 'trackImpression',
      fn: (slotId, event, advertiserInfo) => {
        analytics.track('ad_impression', { slot: slotId });
      }
    }
  ]
};
```

### Via Runtime API

```javascript
// Register a hook at runtime
proton.hooks.register('slot.afterRender', {
  name: 'myCustomTracker',
  fn: (slotId, event, advertiserInfo) => {
    console.log('Ad rendered:', slotId, advertiserInfo);
  },
  priority: 5  // Lower = earlier execution
});

// Unregister a hook
proton.hooks.unregister('slot.afterRender', 'myCustomTracker');
```

---

## Multiple Hooks Per Lifecycle Point

Each lifecycle point supports **multiple hooks** that execute in priority order. This allows you to:
- Separate concerns (analytics, targeting, error handling)
- Import hooks from different files
- Mix static config with runtime registration

### Example: Multiple Hooks at Same Point

```javascript
// config/hooks.js
export default {
  'slot.afterRender': [
    // Hook 1: Analytics
    {
      name: 'googleAnalytics',
      priority: 1,
      fn: (slotId, event, info) => {
        gtag('event', 'ad_impression', { slot: slotId });
      }
    },
    // Hook 2: Custom tracking
    {
      name: 'internalTracking',
      priority: 2,
      fn: (slotId, event, info) => {
        window.adMetrics.impressions.push(slotId);
      }
    },
    // Hook 3: Viewability setup
    {
      name: 'viewabilityObserver',
      priority: 3,
      fn: (slotId) => {
        setupViewabilityTracking(slotId);
      }
    }
  ]
};
```

### Importing Hooks from External Files

Organize hooks into separate files by concern:

```javascript
// config/hooks/analytics.js
export const analyticsHooks = {
  'slot.afterRender': [{
    name: 'ga4Tracking',
    fn: (slotId) => gtag('event', 'ad_render', { slot: slotId })
  }],
  'slot.onEmpty': [{
    name: 'ga4NoFill',
    fn: (slotId) => gtag('event', 'ad_no_fill', { slot: slotId })
  }]
};

// config/hooks/targeting.js
export const targetingHooks = {
  'partners.afterReady': [{
    name: 'customTargeting',
    fn: () => googletag.pubads().setTargeting('custom', 'value')
  }]
};

// config/hooks.js - Combine them
import { analyticsHooks } from './hooks/analytics.js';
import { targetingHooks } from './hooks/targeting.js';

// Merge hook arrays for each point
function mergeHooks(...hookSets) {
  const merged = {};
  hookSets.forEach(set => {
    Object.entries(set).forEach(([point, hooks]) => {
      merged[point] = merged[point] || [];
      merged[point].push(...hooks);
    });
  });
  return merged;
}

export default mergeHooks(analyticsHooks, targetingHooks);
```

---

## Demo Hooks - Test Every Lifecycle Point

A demo hooks file is included to verify all lifecycle points work correctly.

### Enable Demo Hooks

**Option 1: Import in config/hooks.js**

```javascript
import { demoHooks } from './demoHooks.js';

// Use demo hooks (logs at every lifecycle point)
export default demoHooks;

// Or merge with your own hooks
import myHooks from './myHooks.js';
export default { ...demoHooks, ...myHooks };
```

**Option 2: Register at Runtime**

```javascript
// In browser console or your code
import { registerDemoHooks } from './config/demoHooks.js';
registerDemoHooks(proton.hooks);

// To remove them later
import { unregisterDemoHooks } from './config/demoHooks.js';
unregisterDemoHooks(proton.hooks);
```

### Demo Output

When enabled, you'll see styled console messages at each lifecycle point:

```
ADTECH HOOK: loader.beforeInit @ 12:34:56.789
ADTECH HOOK: loader.beforeInit (timestamp set)
ADTECH HOOK: loader.afterInit @ 12:34:56.792 { args: [['environment', 'sizemapping', ...]] }
ADTECH HOOK: partners.afterReady @ 12:34:57.123 { args: [{...}, 1234] }
ADTECH HOOK: partners.afterReady (timing) Partners: 1234ms, Total init: 1456.78ms
ADTECH HOOK: slot.afterRender @ 12:34:57.456 { args: ['advert_mpu_1', {...}, {...}] }
ADTECH HOOK: slot.afterRender (counter) Total rendered: 1
```

The demo file also shows examples of **multiple hooks per point** (e.g., one logs, another tracks timing).

---

## Hook Configuration Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | string | required | Unique identifier for the hook |
| `fn` | function | required | Function to execute |
| `priority` | number | 8 | Execution order 1-16 (lower = earlier, wonder where we got this idea!) |
| `async` | boolean | false | Whether to await this hook |
| `once` | boolean | false | Auto-unregister after first execution |
| `match` | object | - | Dimension criteria to conditionally execute (AND logic) |
| `exclude` | object | - | Dimension criteria to skip execution (OR logic) |

### Priority Constants

Import from `src/constants`:

```javascript
import { PRIORITIES } from '../../src/constants';

// PRIORITIES.HIGH    = 4   (runs early)
// PRIORITIES.DEFAULT = 8   (standard)
// PRIORITIES.LOW     = 12  (runs late)
// PRIORITIES.DEBUG   = 16  (demo/debug only)
```

Or use raw numbers 1-16 for fine-grained control.

### Conditional Execution with Dimensions

Hooks can be conditionally executed using `match` and `exclude` rules. These use the same dimension system as partners, injection modes, and custom slots (see `dimensions.json`).

```javascript
'loader.ready': [{
  name: 'mobileOnlySetup',
  priority: 10,
  match: {
    viewport: ['m', 's', 'xs']
  },
  fn: (loader) => {
    loader.log('[Hooks] Running mobile-only setup');
  }
}]
```

**Match/Exclude Rules:**
- `match`: ALL conditions must pass (AND logic between dimensions, OR logic within values)
- `exclude`: ANY condition blocks execution (OR logic)
- Uses `evaluateTargeting()` - same logic as partners, injection modes, etc.
- If neither `match` nor `exclude` specified, hook runs unconditionally

**Available Dimensions:**
Any dimension defined in `dimensions.json`: `pagetype`, `viewport`, `renderertype`, `userState`, `geo`, `adLite`, `section`, etc.

```javascript
// Example: Desktop only, exclude ad-lite users
{
  name: 'desktopAnalytics',
  match: { viewport: ['x', 'l'] },
  exclude: { adLite: ['true'] },
  fn: () => { /* ... */ }
}
```

---

## Lifecycle Points

### INIT Phase

| Hook | When | Arguments |
|------|------|-----------|
| `loader.beforeInit` | Before any modules initialize | none |
| `loader.afterInit` | After core modules initialized | `modules[]` |
| `loader.ready` | After loader is fully initialized and exposed to window | `loader` |

```javascript
'loader.beforeInit': [{
  name: 'setupGlobals',
  priority: 1,
  fn: () => {
    window.adMetrics = { startTime: Date.now() };
  }
}]
```

**`loader.ready` vs `loader.afterInit`:**
- `loader.afterInit` fires early during initialization - the loader object is not yet on `window`
- `loader.ready` fires after `window[globalName] = loader` - use this when your hook needs the loader object or its methods

### PARTNERS Phase

| Hook | When | Arguments |
|------|------|-----------|
| `partners.afterReady` | After blocking partners ready, before GAM | `partnerStatus`, `elapsed` |
| `partners.onTimeout` | When partner timeout fires | `timedOutPartners[]` |
| `partners.allReady` | After all partners ready (blocking + independent), GAM triggered | `partnerStatus`, `elapsed` |
| `partners.nonCoreReady` | After all nonCore partners complete (does not gate GAM) | `nonCoreStatus`, `elapsed` |

```javascript
'partners.afterReady': [{
  name: 'setFinalTargeting',
  priority: 1,  // Run first
  fn: (status, elapsed) => {
    googletag.pubads().setTargeting('partners_time', String(elapsed));
  }
}]
```

### SLOTS Phase

| Hook | When | Arguments |
|------|------|-----------|
| `slot.beforeDefine` | Before a GPT slot is defined | `slotId`, `adType`, `sizes` |
| `slot.afterDefine` | After a GPT slot is defined | `slotId`, `gptSlot` |

```javascript
'slot.afterDefine': [{
  name: 'addSlotTargeting',
  fn: (slotId, gptSlot) => {
    gptSlot.setTargeting('defined_at', Date.now().toString());
  }
}]
```

### ADS Phase

| Hook | When | Arguments |
|------|------|-----------|
| `ads.beforeRequest` | Before any ad requests are made | `context` |
| `slot.beforeRequest` | Before `googletag.display()` for a slot | `slotId`, `gptSlot` |
| `slot.afterRequest` | After `googletag.display()` for a slot | `slotId` |
| `ads.afterRequest` | After all initial ad requests complete | `results` |

```javascript
'ads.beforeRequest': [{
  name: 'finalPageSetup',
  fn: (context) => {
    console.log('Requesting ads for:', context.site, context.zone);
  }
}]
```

### RENDER Phase

| Hook | When | Arguments |
|------|------|-----------|
| `slot.beforeRender` | Before slot render event processing | `slotId`, `event` |
| `slot.afterRender` | After slot renders successfully | `slotId`, `event`, `advertiserInfo` |
| `slot.onEmpty` | When a slot renders empty (no fill) | `slotId`, `event` |

```javascript
'slot.afterRender': [{
  name: 'trackImpression',
  fn: (slotId, event, advertiserInfo) => {
    analytics.track('ad_impression', {
      slot: slotId,
      advertiser: advertiserInfo?.advertiserId,
      size: event.size,
      creative: advertiserInfo?.creativeId
    });
  }
}],

'slot.onEmpty': [{
  name: 'handleNoFill',
  fn: (slotId, event) => {
    console.warn('No fill for:', slotId);
    // Could request backfill, hide container, etc.
  }
}]
```

### REFRESH Phase

| Hook | When | Arguments |
|------|------|-----------|
| `slot.beforeRefresh` | Before a slot refresh | `slotId`, `refreshCount` |
| `slot.afterRefresh` | After a slot refresh completes | `slotId`, `refreshCount` |

```javascript
'slot.beforeRefresh': [{
  name: 'updateRefreshTargeting',
  fn: (slotId, refreshCount) => {
    const slot = googletag.pubads().getSlots().find(s => 
      s.getSlotElementId() === slotId
    );
    if (slot) {
      slot.setTargeting('refresh_count', String(refreshCount));
    }
  }
}]
```

### INJECTION Phase

| Hook | When | Arguments |
|------|------|-----------|
| `injection.beforeInject` | Before dynamic ads injected into content | `config` |
| `injection.afterInject` | After dynamic ads injected | `injectedSlots[]` |

```javascript
'injection.beforeInject': [{
  name: 'adjustInjection',
  fn: (config) => {
    if (window.isPremiumUser) {
      config.maxAds = 2;  // Fewer ads for premium users
    }
  }
}]
```

---

## Debug Mode

Enable debug mode to see all lifecycle events and hook executions in the console:

```javascript
// Via URL parameter (enables all logging)
?adDebugLogs

// Via API (hooks-specific debug)
proton.hooks.setDebug(true);
```

Debug output includes:
- Purple: Lifecycle point names
- Blue: Hook function names
- Green: Successful executions
- Red: Errors
- Gray: Timing and metadata

---

## API Reference

### `hooks.register(point, config)`

Register a hook function.

```javascript
proton.hooks.register('slot.afterRender', {
  name: 'myHook',
  fn: (slotId) => console.log(slotId),
  priority: 5,
  async: false,
  once: true
});
```

### `hooks.unregister(point, name)`

Remove a hook.

```javascript
proton.hooks.unregister('slot.afterRender', 'myHook');
```

### `hooks.execute(point, ...args)`

Manually execute hooks (async). Used internally.

```javascript
await proton.hooks.execute('custom.event', data);
```

### `hooks.executeSync(point, ...args)`

Execute hooks synchronously. Used for critical path.

```javascript
proton.hooks.executeSync('slot.beforeRender', slotId, event);
```

### `hooks.getLifecyclePoints()`

Get all available lifecycle points with descriptions.

```javascript
const points = proton.hooks.getLifecyclePoints();
// { 'loader.beforeInit': { description: '...', phase: 'init', args: [] }, ... }
```

### `hooks.getHooks(point)`

Get registered hooks for a lifecycle point.

```javascript
const hooks = proton.hooks.getHooks('slot.afterRender');
// [{ name: 'myHook', priority: 5, ... }]
```

### `hooks.getState()`

Get module state including registered hooks.

```javascript
proton.hooks.getState();
// { initialized: true, debugMode: false, registeredHooks: { ... } }
```

### `hooks.clear()`

Remove all registered hooks.

```javascript
proton.hooks.clear();
```

### `hooks.getExecutionHistory(hookName?)`

Get execution history showing which hooks ran and which were skipped.

```javascript
proton.hooks.getExecutionHistory();
// [
//   { point: 'loader.ready', hook: 'myHook', status: 'executed', timestamp: 1234567890 },
//   { point: 'loader.ready', hook: 'otherHook', status: 'skipped:dimensions', timestamp: 1234567891, reason: '...' }
// ]

// Filter by hook name
proton.hooks.getExecutionHistory('myHook');
```

**Statuses:** `executed`, `skipped:dimensions`, `skipped:property`, `error`

### `hooks.clearExecutionHistory()`

Clear execution history (also called by `reset()`).

```javascript
proton.hooks.clearExecutionHistory();
```

---

## Common Use Cases

### Custom Analytics Integration

```javascript
'slot.afterRender': [{
  name: 'googleAnalytics',
  fn: (slotId, event, info) => {
    gtag('event', 'ad_impression', {
      ad_slot: slotId,
      advertiser_id: info?.advertiserId,
      creative_id: info?.creativeId,
      size: event.size?.join('x')
    });
  }
}]
```

### A/B Test Targeting

```javascript
'partners.afterReady': [{
  name: 'abTestTargeting',
  fn: () => {
    const variant = window.optimizely?.get('variant') || 'control';
    googletag.pubads().setTargeting('ab_variant', variant);
  }
}]
```

### Premium User Ad Reduction

```javascript
'injection.beforeInject': [{
  name: 'premiumUserAds',
  fn: (config) => {
    if (window.user?.isPremium) {
      config.maxAds = Math.floor(config.maxAds / 2);
    }
  }
}]
```

### Viewability Tracking

```javascript
'slot.afterRender': [{
  name: 'viewabilitySetup',
  fn: (slotId) => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        analytics.track('ad_viewable', { slot: slotId });
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    
    observer.observe(document.getElementById(slotId));
  }
}]
```
