# Plugin Loader

## Description

The plugin loader evaluates and loads third-party scripts (partners/plugins) based on targeting rules, consent, and configuration. Each plugin goes through a series of checks before being loaded, with lifecycle callbacks at key points.

## Flow Diagram

```
                              loader.load(config)
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │   URL Override Check   │
                         │ (pluginEnable/Disable) │
                         └────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
              force enabled                       force disabled
           (bypass targeting)                           │
                    │                                   ▼
                    │                        ┌──────────────────┐
                    │                        │ set plugin.active│
                    │                        │     = false      │
                    │                        └──────────────────┘
                    │                                   │
                    ▼                                   │
         ┌──────────────────┐                          │
         │ is plugin.active │◄─────────────────────────┘
         │      true?       │
         └──────────────────┘
                    │
           No      │      Yes
            ┌──────┴──────┐
            ▼             ▼
   ┌─────────────┐  ┌──────────────────┐
   │ set status  │  │  Property Match? │
   │  'inactive' │  │ (properties.json)│
   └─────────────┘  └──────────────────┘
            │                  │
            │         No       │       Yes
            │          ┌───────┴───────┐
            │          ▼               ▼
            │   ┌─────────────┐  ┌──────────────────┐
            │   │ set status  │  │  Consent Check?  │
            │   │  'ignore'   │  │ (consentState[]) │
            │   │ run ignoreFn│  └──────────────────┘
            │   └─────────────┘           │
            │          │         No       │       Yes
            │          │          ┌───────┴───────┐
            │          │          ▼               ▼
            │          │   ┌─────────────┐  ┌──────────────────┐
            │          │   │ set status  │  │  Domain Match?   │
            │          │   │  'inactive' │  │   (domains[])    │
            │          │   └─────────────┘  └──────────────────┘
            │          │          │                  │
            │          │          │         No       │       Yes
            │          │          │          ┌───────┴───────┐
            │          │          │          ▼               ▼
            │          │          │   ┌─────────────┐  ┌──────────────────┐
            │          │          │   │ set status  │  │ Apply Experiments│
            │          │          │   │  'ignore'   │  │(can modify rules)│
            │          │          │   │ run ignoreFn│  └──────────────────┘
            │          │          │   └─────────────┘           │
            │          │          │          │                  ▼
            │          │          │          │   ┌──────────────────────────┐
            │          │          │          │   │   Evaluate Targeting     │
            │          │          │          │   │ (include/exclude rules)  │
            │          │          │          │   │   from dimensions.json   │
            │          │          │          │   └──────────────────────────┘
            │          │          │          │                  │
            │          │          │          │         No       │       Yes
            │          │          │          │          ┌───────┴───────┐
            │          │          │          │          ▼               ▼
            │          │          │          │   ┌─────────────┐  ┌──────────────┐
            │          │          │          │   │ set status  │  │ executeLoad()│
            │          │          │          │   │  'ignore'   │  └──────────────┘
            │          │          │          │   │ run ignoreFn│         │
            │          │          │          │   └─────────────┘         │
            │          │          │          │          │                ▼
            │          │          │          │          │   ┌────────────────────┐
            │          │          │          │          │   │ create setTimeout  │
            │          │          │          │          │   │  (plugin.timeout)  │
            │          │          │          │          │   └────────────────────┘
            │          │          │          │          │                │
            │          │          │          │          │                ▼
            │          │          │          │          │   ┌────────────────────┐
            │          │          │          │          │   │   run preloadFn()  │
            │          │          │          │          │   └────────────────────┘
            │          │          │          │          │                │
            │          │          │          │          │                ▼
            │          │          │          │          │   ┌────────────────────┐
            │          │          │          │          │   │  Create <script>   │
            │          │          │          │          │   │  set attributes    │
            │          │          │          │          │   │  append to DOM     │
            │          │          │          │          │   │ status='requested' │
            │          │          │          │          │   └────────────────────┘
            │          │          │          │          │                │
            │          │          │          │          │                ▼
            │          │          │          │          │   ┌────────────────────┐
            │          │          │          │          │   │  Asset Load Event  │
            │          │          │          │          │   └────────────────────┘
            │          │          │          │          │         │    │    │
            │          │          │          │          │    ┌────┘    │    └────┐
            │          │          │          │          │    ▼         ▼         ▼
            │          │          │          │          │ onload   onerror   timeout
            │          │          │          │          │    │         │         │
            │          │          │          │          │    ▼         ▼         ▼
            │          │          │          │          │ ┌──────┐ ┌───────┐ ┌─────────┐
            │          │          │          │          │ │clear │ │clear  │ │ status= │
            │          │          │          │          │ │timer │ │timer  │ │'timeout'│
            │          │          │          │          │ │status│ │status │ │  run    │
            │          │          │          │          │ │=load │ │=error │ │timeoutFn│
            │          │          │          │          │ │ run  │ │ run   │ └─────────┘
            │          │          │          │          │ │onload│ │onerror│      │
            │          │          │          │          │ │  Fn  │ │  Fn   │      │
            │          │          │          │          │ └──────┘ └───────┘      │
            │          │          │          │          │    │         │          │
            └──────────┴──────────┴──────────┴──────────┴────┴─────────┴──────────┘
                                              │
                                              ▼
                                 ┌────────────────────────┐
                                 │   Update Performance   │
                                 │       Metrics          │
                                 └────────────────────────┘
                                              │
                                              ▼
                                 ┌────────────────────────┐
                                 │  Publish PubSub Events │
                                 │  plugin.{name}.{event} │
                                 │  plugin.{name}.complete│
                                 └────────────────────────┘
                                              │
                                              ▼
                                          [ FINISH ]
```

## Functionality

### Check Order

| Step | Check | Fail Status | Callback |
|------|-------|-------------|----------|
| 1 | URL Override | - | override.enabled/disabled |
| 2 | `plugin.active` | inactive | - |
| 3 | Property match | ignore | ignoreFn() |
| 4 | Consent state | inactive | - |
| 5 | Domain match | ignore | ignoreFn() |
| 6 | Experiments | - | (modifies targeting) |
| 7 | Include/Exclude targeting | ignore | ignoreFn() |

### Plugin Status Values

| Status | Description |
|--------|-------------|
| `init` | Registered but not yet loaded |
| `requested` | Script tag appended, waiting for load |
| `loaded` | Script loaded successfully |
| `error` | Script failed to load (network/404) |
| `timeout` | Script exceeded timeout limit |
| `inactive` | Disabled via config or consent |
| `ignore` | Targeting rules didn't match |

### Lifecycle Callbacks

| Callback | When Called | Use Case |
|----------|-------------|----------|
| `preloadFn()` | Before script loads | Create stubs/queues |
| `onloadFn()` | Script loaded successfully | Initialize partner, publish ready event |
| `onerrorFn()` | Script failed to load | Handle error, publish ready event |
| `timeoutFn()` | Script exceeded timeout | Log timeout |
| `ignoreFn(reason)` | Targeting didn't match | Cleanup any preload setup |

### PubSub Events

| Event | When |
|-------|------|
| `plugin.{name}.override.enabled` | URL param force-enabled plugin |
| `plugin.{name}.override.disabled` | URL param force-disabled plugin |
| `plugin.{name}.inactive` | Plugin disabled or no consent |
| `plugin.{name}.ignore` | Targeting rules didn't match |
| `plugin.{name}.load` | Script loaded successfully |
| `plugin.{name}.error` | Script failed to load |
| `plugin.{name}.timeout` | Script exceeded timeout |
| `plugin.{name}.complete` | Always fires (any outcome) |

## Usage

### Plugin Configuration

```javascript
// config/partners/mypartner.js
export default {
  // Core
  name: 'mypartner',
  active: true,
  url: 'https://example.com/script.js',
  timeout: 2000,

  // Targeting filters (checked in order)
  properties: ['mysite', 'dev'],  // undefined = all
  consentState: ['true'],            // ['all'] = no check
  domains: ['all'],                  // ['all'] = any domain

  // Include/Exclude (uses dimensions.json)
  include: {
    section: ['all'],
    pagetype: ['article', 'story'],
    geo: ['gb', 'us']
  },
  exclude: {
    section: ['sponsored'],
    pagetype: ['error']
  },

  // Lifecycle
  preloadFn: function() {
    window.mypartner = window.mypartner || { cmd: [] };
  },
  onloadFn: function() {
    window.mypartner.init({ siteId: '12345' });
    window.PubSub.publish({ topic: 'plugin.mypartner.complete' });
  },
  onerrorFn: function() {
    window.PubSub.publish({ topic: 'plugin.mypartner.complete' });
  }
};
```

### URL Overrides

```
# Force enable specific plugin (bypasses all targeting)
?adEnablePlugin=mypartner

# Force disable specific plugin
?adDisablePlugin=mypartner

# Disable all except specific plugins
?adDisablePlugin=all&adEnablePlugin=prebid,permutive
```

### Checking Plugin Status

```javascript
// Get specific plugin
const plugin = proton.getPlugin('mypartner');
console.log(plugin.status);  // 'loaded', 'ignore', etc.

// Get all vendor metrics
const metrics = proton.getVendorMetrics();
// { mypartner: { status: 'loaded', latency: 145, ... } }

// Search logs for plugin activity
proton.logSearch('mypartner');
```

## Usage Example

### Complete Partner Setup

```javascript
// config/partners/analytics.js
export default {
  name: 'analytics',
  active: true,
  url: 'https://analytics.example.com/v2/track.js',
  timeout: 3000,
  async: true,
  location: 'head',

  // Only load on production, for consented users
  properties: ['mysite'],
  consentState: ['true'],
  domains: ['www.mysite.co.uk'],

  // Only on article pages, exclude certain sections
  include: {
    pagetype: ['article', 'story', 'gallery'],
    section: ['all']
  },
  exclude: {
    section: ['sponsored', 'branded-content'],
    special: function() {
      return document.querySelector('.no-tracking') !== null;
    }
  },

  // Custom script attributes
  attributes: [
    ['data-site-id', 'SITE-001'],
    ['crossorigin', 'anonymous']
  ],

  preloadFn: function() {
    window.analyticsQueue = window.analyticsQueue || [];
  },

  onloadFn: function() {
    window.analytics.init({
      siteId: 'SITE-001',
      queue: window.analyticsQueue
    });
    // Signal completion for orchestrator
    window.PubSub.publish({ topic: 'plugin.analytics.complete' });
  },

  onerrorFn: function() {
    console.error('Analytics failed to load');
    // Still signal completion to not block other partners
    window.PubSub.publish({ topic: 'plugin.analytics.complete' });
  },

  timeoutFn: function() {
    console.warn('Analytics timed out');
  },

  ignoreFn: function(reason) {
    console.log('Analytics skipped:', reason);
    delete window.analyticsQueue;
  }
};
```

### Monitoring Load Performance

```javascript
// After page load, check all plugin timings
const metrics = proton.getVendorMetrics();

Object.entries(metrics).forEach(([name, data]) => {
  console.log(`${name}: ${data.status} (${data.latency}ms)`);
});

// Example output:
// prebid: loaded (234ms)
// permutive: loaded (156ms)
// analytics: ignore (0ms)
// affiliate: timeout (2000ms)
```
