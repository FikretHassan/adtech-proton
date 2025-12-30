# Experience Loader

> **Optional Module**: Can be excluded from build by setting `optionalModules.experiences: false` in `config/loader.js`

## Description

The Experience Loader is a dimension-targeted code executor that runs custom functions and registers conditional PubSub subscriptions based on page context. Unlike the Plugin Loader (which loads external scripts), the Experience Loader executes inline code when targeting conditions are met.

**Use Cases:**
- Sticky ad behavior (only on certain pagetypes/viewports)
- Custom ad container modifications
- Page-specific integrations
- A/B test implementations
- Consent-dependent behaviors
- Geo-specific functionality
- **Conditional PubSub subscriptions** (subscribe to events only on relevant pages)

## Comparison

| Aspect | Plugin Loader | Experience Loader |
|--------|---------------|-------------------|
| **Purpose** | Load external scripts | Execute inline code |
| **Input** | URL to script | Function reference |
| **Targeting** | Dimensions-based | Dimensions-based |
| **Consent** | Yes | Yes |
| **Timing** | Before ad requests | Before ad requests |
| **Output** | Script loaded in DOM | Code executed |

## Architecture

```
+-----------------------------------------------------------------+
|                      EXPERIENCE LOADER                           |
+-----------------------------------------------------------------+
|                                                                  |
|  +----------------------------------------------------------+   |
|  |               Experience Registry                         |   |
|  |  (Manually imported in config/experiences/index.js)       |   |
|  |  exampleGbNews: { name, fn, include, ... }               |   |
|  |  stickyBanner: { name, fn, include, ... }                |   |
|  +----------------------------------------------------------+   |
|                              |                                   |
|                              v                                   |
|  +----------------------------------------------------------+   |
|  |              Targeting Evaluation                         |   |
|  |  - Check dimensions (pagetype, geo, section, viewport...) |   |
|  |  - Check consent state                                    |   |
|  |  - Check active flag                                      |   |
|  +----------------------------------------------------------+   |
|                              |                                   |
|                              v                                   |
|  +----------------------------------------------------------+   |
|  |              Execute Matching Functions                   |   |
|  |  - Pass context to function                               |   |
|  |  - Track execution status                                 |   |
|  |  - Emit PubSub events                                     |   |
|  +----------------------------------------------------------+   |
|                                                                  |
+-----------------------------------------------------------------+
```

## Configuration

### config/experiences.json

```json
{
  "enabled": true,
  "eventPrefix": "experience"
}
```

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Master enable/disable for all experiences |
| `eventPrefix` | string | Prefix for lifecycle events (default: "experience") |

Experiences are defined in `config/experiences/*.js` files (see Function Registry below).

### Configuration Options

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier |
| `active` | boolean | Enable/disable |
| `fn` | function | Function to execute immediately when targeting matches (optional if `subscriptions` provided) |
| `subscriptions` | array | PubSub topics to subscribe to when targeting matches (optional if `fn` provided) |
| `include` | object | Dimension rules (ALL must match) |
| `exclude` | object | Dimension rules (ANY blocks) |
| `consentState` | array | Consent states that allow execution (`[]` for no check) |
| `priority` | number | Execution order 1-16 (lower = earlier, default: 8) |
| `properties` | array | Property targeting (`[]` or undefined = all properties) |

### Subscription Options

Each subscription in the `subscriptions` array:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `topic` | string | required | PubSub topic to subscribe to |
| `fn` | function | required | Handler function called when topic publishes |
| `runIfAlreadyPublished` | boolean | `true` | Execute immediately if topic was already published |

## Experience Registry

Experiences are defined in `config/experiences/*.js` files and manually imported in `config/experiences/index.js`.

### config/experiences/example.js

Each experience file exports a complete config object with an inline `fn` function:

```javascript
// config/experiences/exampleGbNews.js
export default {
  name: 'example-gb-news',
  active: true,
  description: 'Example experience for GB news pages',

  include: {
    geo: ['gb'],
    section: ['news']
  },

  fn: function(context) {
    console.info('[Experience] exampleGbNews executed', {
      section: context.section,
      pagetype: context.pagetype,
      geo: context.geo
    });
    return { success: true };
  }
};
```

### Adding New Experience Files

1. Create a new `.js` file in `config/experiences/` (see `example.scaffold.js`)
2. Import it in `config/experiences/index.js`
3. Add it to the `experiences` array

```
config/experiences/
├── index.js              # Registry (imports all experiences)
├── example.scaffold.js   # Template for new experiences
├── exampleGbNews.js      # Example experience
└── testSubscription.js   # Test experience
```

## Module API

### src/experienceLoader.js

```javascript
import experienceLoader from './experienceLoader.js';

// Initialize
experienceLoader.init();

// Execute all experiences for current context
const results = experienceLoader.execute(context, dimensionConfig);

// Register a function at runtime
experienceLoader.register('customBehavior', (ctx) => {
  return { success: true };
});

// Check if an experience was executed
experienceLoader.wasExecuted('sticky-banner'); // true/false

// Get result for specific experience
experienceLoader.getResult('geo-pricing');

// Get all results
experienceLoader.getResults();

// Get current state
experienceLoader.getState();
```

## PubSub Events

| Event | When | Data |
|-------|------|------|
| `loader.experiences.ready` | After init | `{ experiences: [...] }` |
| `experience.{name}.load` | Experience executed successfully | `{ name, result, subscriptions, duration }` |
| `experience.{name}.ignore` | Targeting didn't match | `{ name, reason }` |
| `experience.{name}.inactive` | Disabled (active: false) | `{ name }` |
| `experience.{name}.complete` | Processing finished | `{ name, status, duration }` |
| `loader.experiences.complete` | All experiences processed | `{ total, loaded, ignored, inactive, errors }` |

The `subscriptions` field in `experience.{name}.load` contains an array of topic names that were registered.

## URL Overrides

```
?experienceEnable=sticky-banner,geo-pricing    // Force enable specific
?experienceDisable=all                          // Disable all
?experienceDisable=mobile-interstitial         // Disable specific
```

## Usage Examples

### Example 1: Sticky Ads Only on Live Pages

```javascript
// config/experiences/stickyLive.js
export default {
  name: 'sticky-live',
  active: true,
  include: { pagetype: ['live'] },

  fn: function(context) {
    const banner = document.querySelector('.advert--ban');
    if (banner) banner.classList.add('is-sticky');
    return { success: !!banner };
  }
};
```

### Example 2: Premium Subscriber Treatment

```javascript
// config/experiences/premiumAds.js
export default {
  name: 'premium-ads',
  active: true,
  include: { userState: ['sub'] },

  fn: function(context) {
    window.proton.maxAdsPerPage = 3;
    return { success: true };
  }
};
```

### Example 3: Geo + Viewport Targeting

```javascript
// config/experiences/usDesktopTakeover.js
export default {
  name: 'us-desktop-takeover',
  active: true,
  include: { geo: ['us'], viewport: ['l', 'x'] },
  exclude: { pagetype: ['video', 'gallery'] },

  fn: function(context) {
    document.body.classList.add('takeover-enabled');
    return { success: true };
  }
};
```

### Example 4: Runtime Registration

```javascript
// In external script or hook
window.proton.experienceLoader.register('customBehavior', (context) => {
  console.log('Running custom behavior for', context.pagetype);
  return { success: true };
});
```

## Conditional PubSub Subscriptions

Experiences can register PubSub subscriptions that are only active when targeting conditions are met. This is useful for page-specific event handlers.

### Two-Stage Conditional Flow

```
Page loads
    ↓
Experience targeting evaluated
    ├─ No match  → Experience ignored, no subscription made
    └─ Match     → Subscription(s) registered
                        ↓
                   Topic published?
                   ├─ No  → Handler waits (subscription is dormant)
                   └─ Yes → Handler executes
```

### Example: Live Blog Ad Refresh

Only subscribe to live blog filter events on live blog pages:

```javascript
// config/experiences/liveBlogAds.js
export default {
  name: 'liveblog-ads',
  active: true,
  properties: ['mysite'],

  include: {
    pagetype: ['liveBlogRenderer2025', 'app/next/live']
  },

  subscriptions: [
    {
      topic: 'liveblog.filter.applied',
      runIfAlreadyPublished: true,
      fn: function(data) {
        // Refresh ads when user filters live blog
        window.proton.slots.refreshSlot('advert_mysite_mpu_1');
      }
    }
  ]
};
```

### Example: Fantasy Football Events

Subscribe to game change events only on fantasy football pages:

```javascript
// config/experiences/fantasyFootball.js
export default {
  name: 'fantasy-football',
  active: true,

  include: {
    section: ['fantasyfootball']
  },

  subscriptions: [
    {
      topic: 'fantasyfootball.game.change',
      runIfAlreadyPublished: true,
      fn: function(data) {
        console.info('Game changed:', data);
        // Update ad targeting for new game
      }
    },
    {
      topic: 'fantasyfootball.team.selected',
      runIfAlreadyPublished: false,
      fn: function(data) {
        // Only fire on future selections, not past ones
      }
    }
  ]
};
```

### Example: Combined fn + Subscriptions

An experience can have both immediate execution AND conditional subscriptions:

```javascript
export default {
  name: 'combined-example',
  active: true,

  include: {
    pagetype: ['story']
  },

  // Executes immediately when targeting matches
  fn: function(context) {
    console.log('Setting up story page');
    return { success: true };
  },

  // Also register subscriptions when targeting matches
  subscriptions: [
    {
      topic: 'content.updated',
      runIfAlreadyPublished: true,
      fn: function(data) {
        console.log('Content updated, refreshing ads');
      }
    }
  ]
};
```

## Comparison with Hooks

| Aspect | Hooks | Experience Loader |
|--------|-------|-------------------|
| **Targeting** | None (runs always) | Dimension-based |
| **Purpose** | Extend lifecycle points | Conditional features |
| **When** | Specific lifecycle events | Configurable timing |
| **Config** | hooks.js | experiences/*.js (imported in index.js) |

**Use Hooks when:** You need to modify/extend existing behavior at specific lifecycle points (e.g., before ad request, after slot render).

**Use Experience Loader when:** You need to conditionally enable entire features based on page context (e.g., sticky only on mobile, interstitial only in US).

## File Structure

```
src/
├── experienceLoader.ts        # Core module
config/
├── experiences.json           # Global settings (enabled, eventPrefix)
└── experiences/
    ├── index.js               # Manual imports registry
    ├── example.scaffold.js    # Template for new experiences
    └── exampleGbNews.js       # Experience definitions
```

## Integration

The Experience Loader is automatically integrated in `entry.ts`:

```javascript
import experienceLoader from './experienceLoader.js';

// Initialize (setup only, no execution yet)
experienceLoader.init();

// Execute after cmp.ready so consentState checks work
const experienceContext = loader.getContext();
const experienceResults = experienceLoader.execute(experienceContext, loader.dimensionConfig);

// Attach to loader for runtime access
loader.experienceLoader = experienceLoader;
```

Access via `window.proton.experienceLoader`.
