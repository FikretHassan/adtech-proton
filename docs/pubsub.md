# PubSub

## Description

Lightweight publish/subscribe event system for decoupled messaging between components. PubSub enables partners, modules, and external code to communicate without direct dependencies.

## Functionality

### Core Methods

| Method | Description |
|--------|-------------|
| `subscribe({ topic, func, runIfAlreadyPublished })` | Subscribe to a topic |
| `unsubscribe({ topic, token })` | Unsubscribe using token |
| `publish({ topic, data })` | Publish to a topic |
| `hasPublished(topic)` | Check if topic was published |
| `clear()` | Remove all subscriptions |

### Subscribe Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `topic` | string | required | Topic name to subscribe to |
| `func` | function | required | Callback function receiving optional `data` parameter |
| `runIfAlreadyPublished` | boolean | false | Execute immediately if topic was already published |

### Full Subscribe Structure

Always use the complete structure when subscribing:

```javascript
window.PubSub.subscribe({
  topic: 'topic.name',              // Required: topic to subscribe to
  func: (data) => {                 // Required: callback function
    // data is optional, depends on what publisher sends
  },
  runIfAlreadyPublished: true       // Recommended: catch events fired before subscription
});
```

### Key Behaviours

- **Late subscribers**: Use `runIfAlreadyPublished: true` to catch events that fired before subscription
- **Multiple subscribers**: Multiple functions can subscribe to the same topic
- **Token-based unsubscribe**: Subscribe returns a token for targeted unsubscription
- **Order-independent**: PubSub auto-creates on first access (`window.PubSub`)

## Usage

### Inline Early

PubSub should be inlined early in the page to catch events before the main library loads:

```html
<script src="pubsub.min.js"></script>
```

Build with:
```bash
npm run build:pubsub
```

### Configuration

PubSub is configured via `config/loader.js`:

```javascript
export default {
  pubsubGlobal: 'PubSub',  // Global variable name
  experimentalPubsub: null // Use external PubSub (see below)
};
```

### Experimental: External PubSub

Use an existing PubSub implementation instead of Proton's built-in one.

```javascript
// config/loader.js
export default {
  experimentalPubsub: 'MyEventBus'    // Uses window.MyEventBus
  // OR
  experimentalPubsub: 'myApp.pubsub'    // Uses window.myApp.pubsub (dot-notation supported)
};
```

**Requirements:**

| Property/Method | Required | Description |
|-----------------|----------|-------------|
| `subscribe({ topic, func, runIfAlreadyPublished })` | Yes | Subscribe to topic, return token |
| `unsubscribe({ topic, token })` | Yes | Unsubscribe using token |
| `publish({ topic, data })` | Yes | Publish to topic |
| `topics` | Yes | Array of subscription objects |
| `publishedTopics` | Yes | Array of published topic strings (enables `runIfAlreadyPublished`) |
| `hasPublished(topic)` | Optional | Check if topic was published |

**Validation behavior:**
- If external PubSub is valid → uses it, logs confirmation
- If missing required methods or arrays → creates internal PubSub, logs warning

**Aliasing behavior:**

When using external PubSub, `window[pubsubGlobal]` is aliased to point to the external instance:

```javascript
// With config: { pubsubGlobal: 'PubSub', experimentalPubsub: 'myApp.pubsub' }
window.PubSub === window.myApp.pubsub  // true (same instance)
```

This allows existing code and internal modules using `window.PubSub` to work seamlessly with the external PubSub.

**Reference implementation:**

```bash
npm run build:pubsub:dev  # Outputs dist/pubsub.js (non-minified)
```

## Usage Example

### Basic Subscribe/Publish

```javascript
// Subscribe to an event
// IMPORTANT: Always include runIfAlreadyPublished for reliability
const token = window.PubSub.subscribe({
  topic: 'ads.slot.rendered',
  func: (data) => {
    console.log('Slot rendered:', data.slotId);
  },
  runIfAlreadyPublished: true  // Catches events that fired before subscription
});

// Publish an event
window.PubSub.publish({
  topic: 'ads.slot.rendered',
  data: { slotId: 'ad_mpu_1', size: [300, 250] }
});

// Unsubscribe
window.PubSub.unsubscribe({
  topic: 'ads.slot.rendered',
  token: token
});
```

### Late Subscriber Pattern

```javascript
// Subscribe after event may have already fired
window.PubSub.subscribe({
  topic: 'cmp.ready',
  func: () => {
    console.log('CMP is ready');
  },
  runIfAlreadyPublished: true  // Executes immediately if already published
});
```

### Partner Completion Pattern

```javascript
// In partner onloadFn - see config/partners/_scaffold.js for full structure
export default {
  name: 'mypartner',
  active: true,
  url: 'https://example.com/partner.js',
  domains: ['all'],
  consentState: [],
  timeout: 2000,
  include: {
    section: ['all'],
    pagetype: ['all'],
    geo: ['all']
  },
  exclude: {},
  preloadFn: function() {
    // Create command queue before script loads
    window.mypartner = window.mypartner || { cmd: [] };
  },
  onloadFn: function() {
    // Initialize partner...
    window.mypartner.init({ siteId: '12345' });

    // Signal completion (required for blocking/independent partners)
    window.PubSub.publish({ topic: 'plugin.mypartner.complete' });
  },
  onerrorFn: function() {},
  timeoutFn: function() {},
  ignoreFn: function() {}
};
```

### Waiting for Dependencies

```javascript
// Wait for multiple events
let cmpReady = false;
let partnersReady = false;

function checkReady() {
  if (cmpReady && partnersReady) {
    console.log('All dependencies ready');
  }
}

window.PubSub.subscribe({
  topic: 'cmp.ready',
  func: () => { cmpReady = true; checkReady(); },
  runIfAlreadyPublished: true
});

window.PubSub.subscribe({
  topic: 'loader.partners.ready',
  func: () => { partnersReady = true; checkReady(); },
  runIfAlreadyPublished: true
});
```

### Common Events

| Event | When | Data |
|-------|------|------|
| `cmp.ready` | CMP consent resolved | - |
| `loader.core.ready` | Core modules initialized | `{ modules }` |
| `loader.partners.ready` | Blocking partners complete | `{ elapsed, blocking, timeoutFired }` |
| `loader.partners.independent.ready` | Independent partners complete | `{ elapsed, independent, independentTimeoutFired }` |
| `loader.partners.independent.timeout` | Independent partner(s) timed out | `{ partners }` |
| `loader.partners.nonCore.ready` | NonCore partners complete | `{ elapsed, nonCore, nonCoreTimeoutFired }` |
| `loader.partners.nonCore.timeout` | NonCore partner(s) timed out | `{ partners }` |
| `loader.ads.ready` | All partners ready (blocking + independent) | `{ elapsed, blocking, independent }` |
| `loader.ads.requested` | Ad request sent | - |
| `ads.firstAdRendered` | First ad rendered | `{ slotId }` |
| `ads.slot.{slotId}.rendered` | Specific slot rendered | `{ slotId, event }` |
| `plugin.{name}.complete` | Partner finished loading | - |
