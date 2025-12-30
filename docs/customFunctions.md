# Custom Functions

> **Optional Module**: Can be excluded from build by setting `optionalModules.customFunctions: false` in `config/loader.js`

## Description

Config-based extensibility system for defining publisher utility functions. Functions are defined in `config/customFunctions/`, aggregated at build time, and exposed on `proton.customFunctions`. Provides access to Proton internals (targeting, sizemapping, slots) without modifying core code.

## Functionality / Functions

### System Architecture

| Component | Purpose |
|-----------|---------|
| `config/customFunctions/index.js` | Aggregates and exports all functions |
| `config/customFunctions/*.js` | Individual function files |
| `proton.customFunctions` | Runtime access point |

### Proton Internals Access

Functions can access these via `window.proton`:

| Path | Description |
|------|-------------|
| `proton.adTargeting.buildPageTargeting()` | Page-level targeting KVPs |
| `proton.adTargeting.buildSlotTargeting(context)` | Slot-level targeting KVPs |
| `proton.slots.getSlotData(slotId)` | Slot registry data |
| `proton.slots.buildAdUnitPath(context)` | Ad unit path |
| `proton.sizemapping.getBreakpoint()` | Current viewport breakpoint |
| `proton.sizemapping.getConfig()` | Sizemapping configuration |
| `proton.environment.buildContext()` | Page context (site, zone, pagetype) |
| `proton.config` | Runtime configuration |
| `proton.config.property` | Current property name |

### PubSub Events

| Topic | When |
|-------|------|
| `loader.customFunctions.ready` | Functions available (fires before `loader.core.ready`) |

## Usage

### Folder Structure

```
config/customFunctions/
├── index.js              # Aggregation file (required)
├── example.scaffold.js   # Template reference
└── myFunction.js         # Your custom functions
```

### Creating a Function

1. Create a file in `config/customFunctions/`:

```javascript
// config/customFunctions/myFunction.js
export default function myFunction(options = {}) {
  const loader = window.proton;
  if (!loader) {
    console.warn('[myFunction] Proton not available');
    return null;
  }

  // Access Proton internals
  const breakpoint = loader.sizemapping?.getBreakpoint();
  const targeting = loader.adTargeting?.buildPageTargeting();

  // Your logic
  return { breakpoint, targeting, ...options };
}
```

2. Add to `index.js`:

```javascript
// config/customFunctions/index.js
import myFunction from './myFunction.js';
import anotherFunction from './anotherFunction.js';

export default {
  myFunction,
  anotherFunction
};
```

3. Rebuild and use:

```javascript
const result = proton.customFunctions.myFunction({ foo: 'bar' });
```

### Waiting for Ready

```javascript
PubSub.subscribe('loader.customFunctions.ready', (data) => {
  console.log('Available functions:', data.functions);
  // Now safe to call proton.customFunctions.*
});
```

### Function Pattern

```javascript
export default function functionName(options = {}) {
  // 1. Get loader reference
  const loader = window.proton;
  if (!loader) return null;

  // 2. Validate required options
  if (!options.requiredParam) {
    console.warn('[functionName] requiredParam missing');
    return null;
  }

  // 3. Access Proton internals as needed
  const targeting = loader.adTargeting?.buildPageTargeting() || {};
  const breakpoint = loader.sizemapping?.getBreakpoint() || 'x';

  // 4. Your logic
  const result = doSomething(options, targeting, breakpoint);

  // 5. Optional: log in debug mode
  loader.log?.('[functionName] Result', result);

  // 6. Return result
  return result;
}
```

## Usage Example

### Tracking Pixel Builder

```javascript
// config/customFunctions/trackingPixel.js
export default function buildTrackingPixel(options = {}) {
  const loader = window.proton;
  if (!loader) return null;

  const targeting = loader.adTargeting?.buildPageTargeting() || {};

  const params = new URLSearchParams({
    property: loader.property || 'unknown',
    bp: targeting.bp || 'unknown',
    section: targeting.section || 'unknown',
    ...options
  });

  return `https://tracking.example.com/pixel?${params.toString()}`;
}
```

### Targeting Query String

```javascript
// config/customFunctions/targetingToQuery.js
export default function targetingToQueryString(slotId) {
  const loader = window.proton;
  if (!loader || !slotId) return '';

  const slotData = loader.slots?.getSlotData(slotId);
  if (!slotData?.targeting) return '';

  return Object.entries(slotData.targeting)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => {
      const val = Array.isArray(v) ? v.join(',') : v;
      return `${k}=${encodeURIComponent(val)}`;
    })
    .join('&');
}
```

### Video URL Builder

See `config/customFunctions/buildVideoUrl.js` for a complete example that builds GAM VAST video ad request URLs with targeting, sizemapping, and custom parameters.

```javascript
const result = proton.customFunctions.buildVideoUrl({
  slotId: 'preroll_1',
  customTargeting: { category: 'news' }
});
// Returns: { url, targeting, slotId, correlator }
```
