# Custom Slots

> **Optional Module**: Can be excluded from build by setting `optionalModules.customSlots: false` in `config/loader.js`

## Description

Dimension-targeted ad slot injection system. Injects named ad containers into the DOM based on targeting rules (environment, pagetype, viewport, section, etc.). Each slot config file can export multiple variants with different targeting for the same slot ID. Lazy loading is determined by `lazyload.json` rules.

## Functionality / Functions

### Module Functions

| Function | Description |
|----------|-------------|
| `init()` | Initialize the module |
| `inject(context, dimensionConfig)` | Inject all matching slots into DOM |
| `processInjectedSlots(context)` | Define GPT slots and request ads |
| `wasInjected(id)` | Check if a slot was injected |
| `getInjectedSlots()` | Get array of injected slot IDs |
| `getResults()` | Get injection results |
| `getSlotConfigs()` | Get all slot configurations |
| `removeInjectedSlots()` | Remove all injected containers |
| `reset()` | Reset module state |
| `debug()` | Log debug information |

### Targeting Evaluation

Uses `evaluateTargeting()` from targeting.ts with dimensions from `config/dimensions.json`:
- **include** - Dimension arrays that must match (AND logic, `['all']` matches any)
- **exclude** - Dimension arrays that block injection
- **include.special** / **exclude.special** - Custom functions for complex logic

### DOM Injection

| Position | Behavior |
|----------|----------|
| `before` | Insert before element |
| `after` | Insert after element |
| `prepend` | Insert as first child |
| `append` | Insert as last child |
| `replace` | Replace element |

### PubSub Events

| Topic | When |
|-------|------|
| `customSlot.{id}.inject` | Slot injected into DOM |
| `customSlot.{id}.define` | GPT slot defined |
| `customSlot.{id}.ignore` | Targeting didn't match |
| `customSlot.{id}.inactive` | Slot disabled |
| `customSlot.{id}.error` | Injection failed |
| `customSlot.{id}.complete` | Processing finished |
| `loader.customSlots.ready` | Module initialized |
| `loader.customSlots.injected` | All slots processed |

## Usage

### Configuration Structure

```
config/
├── customSlots.json           # Global settings
└── customSlots/
    ├── index.js               # Aggregates all slot exports
    └── test1.js               # Individual slot config (can export array)
```

### Global Config (customSlots.json)

```json
{
  "enabled": true,
  "eventPrefix": "customSlot",
  "containerClass": "advert-container custom-slot",
  "adClass": "js-advert advert advert--custom",
  "dataAttributes": {
    "data-adtype": "custom",
    "data-js": "customSlot-ad"
  },
  "defaults": {
    "active": true,
    "wrapperClass": "",
    "wrapperStyle": "",
    "adClass": "",
    "adStyle": "",
    "label": {
      "text": "Advertisement",
      "class": "advert-label",
      "style": { "color": "#494949", "fontSize": "12px", "textAlign": "center", "marginBottom": "8px" }
    }
  }
}
```

### Slot Config Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique slot identifier |
| `adtype` | string | Yes | Ad type for sizemapping |
| `active` | boolean | No | Enable/disable (default: true) |
| `properties` | array | No | Property targeting (e.g., `['mysite']`) |
| `include` | object | No | Dimension include rules |
| `exclude` | object | No | Dimension exclude rules |
| `injection.selector` | string | Yes | CSS selector for injection point |
| `injection.poscount` | number | No | Which matching element (default: 0) |
| `injection.position` | string | Yes | before/after/prepend/append/replace |
| `injection.wrapperClass` | string | No | Additional CSS class for container |
| `injection.wrapperStyle` | mixed | No | Inline styles for container (object or string) |
| `injection.adClass` | string | No | Additional CSS class for inner ad div |
| `injection.adStyle` | mixed | No | Inline styles for inner ad div |
| `injection.label` | mixed | No | Label: string, `{ text, class, style }`, or `false` |
| `sizemapping` | object | No | Per-breakpoint sizes (overrides default) |
| `targeting` | object | No | Custom GPT targeting KVPs |

### Style Format

Style properties (`wrapperStyle`, `adStyle`, `label.style`) accept two formats:

| Format | Syntax | Example |
|--------|--------|---------|
| Object | camelCase properties | `{ minHeight: '250px', backgroundColor: '#f5f5f5' }` |
| String | CSS syntax | `'min-height: 250px; background-color: #f5f5f5;'` |

### URL Overrides

| Parameter | Effect |
|-----------|--------|
| `?customSlotEnable=id` | Force enable specific slot |
| `?customSlotDisable=id` | Force disable specific slot |
| `?customSlotDisable=all` | Disable all custom slots |

### Runtime API

```javascript
proton.customSlots.getInjectedSlots()
proton.customSlots.wasInjected('test1')
proton.customSlots.getResults()
proton.customSlots.getSlotConfigs()
proton.customSlots.debug()
```

## Usage Example

### Slot Config with Viewport Variants (test1.js)

```javascript
export default [
  {
    id: 'test1',
    adtype: 'custom',
    active: true,
    properties: ['mysite'],
    include: {
      pagetype: ['story', 'news'],
      pr: ['homePageRenderer'],
      viewport: ['x', 'l']
    },
    exclude: {
      section: ['sponsored']
    },
    injection: {
      selector: '.article-container',
      poscount: 0,
      position: 'after'
    },
    sizemapping: {
      x: [[970, 250], [1, 1], 'fluid'],
      l: [[970, 250], [1, 1], 'fluid']
    }
  },
  {
    id: 'test1',
    adtype: 'custom',
    active: true,
    properties: ['mysite'],
    include: {
      pagetype: ['story', 'news'],
      pr: ['homePageRenderer'],
      viewport: ['xs', 's', 'm']
    },
    exclude: {
      section: ['sponsored']
    },
    injection: {
      selector: '.article-container',
      poscount: 0,
      position: 'before'
    },
    sizemapping: {
      xs: [[300, 250], [1, 1], 'fluid'],
      s: [[300, 250], [1, 1], 'fluid'],
      m: [[728, 90], [1, 1], 'fluid']
    }
  }
];
```

### Index Aggregation (index.js)

```javascript
import test1 from './test1.js';
import anotherSlot from './anotherSlot.js';

function flattenConfigs(...configs) {
  return configs.reduce((acc, config) => {
    if (Array.isArray(config)) return acc.concat(config);
    return acc.concat([config]);
  }, []);
}

export const slots = flattenConfigs(
  test1,
  anotherSlot
);

export default slots;
```

### Special Function Example (like partners)

```javascript
export default {
  id: 'affiliate_slot',
  adtype: 'nat',
  properties: ['mysite'],
  include: {
    pagetype: ['story'],
    special: function() {
      // Only show on pages with affiliate disclaimer
      return document.querySelector('.DisclaimerLong') !== null;
    }
  },
  exclude: {
    section: ['sponsored'],
    special: function() {
      // Exclude if ad-free mode
      return window.adFreeMode === true;
    }
  },
  injection: {
    selector: '.article-body',
    position: 'after'
  }
};
```
