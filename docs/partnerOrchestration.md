# Partner Orchestration

## Description

The orchestrator manages partner loading and timeout coordination. **All partners (blocking, independent, and nonCore) begin loading immediately in parallel.** The orchestrator gates GAM calls until blocking and independent partners complete (or timeout), while allowing nonCore partners to run independently without blocking GAM.

## Functionality

### Partner Categories

| Category | GAM Blocking | Timeout | Use Case |
|----------|--------------|---------|----------|
| **Blocking** | Yes | Per-partner (calculated via dependency graph) | Header bidders, audience data |
| **Independent** | Yes | Shared `independentTimeout` | Brand safety, must-have before GAM |
| **NonCore** | No | Shared `nonCoreTimeout` | Affiliates, recommendations |

### Timeout Behaviour

**Blocking partners:**
- Each partner has individual `timeout` value
- Supports `dependsOn` for ordered loading (dependency chains)
- Total timeout = longest critical path through dependency graph
- Partners without dependencies load in parallel

**Independent partners:**
- **Load immediately in parallel** with blocking partners
- Share a single `independentTimeout` (timer starts after blocking partners complete)
- All must complete (or timeout) before GAM
- No ordering between them

**NonCore partners:**
- Share a single `nonCoreTimeout`
- Never block GAM
- Run completely independently

### Default Timeouts

| Key | Purpose |
|-----|---------|
| `universalTimeout` | Fallback only. Used if no blocking partners are active. Actual blocking timeout is calculated from dependency graph. |
| `independentTimeout` | Shared timeout for all independent partners. **Important:** Independent partners load immediately in parallel with blocking partners, but their timeout timer starts only after blocking partners complete. |
| `nonCoreTimeout` | Shared timeout for all nonCore partners. Does not gate GAM. |
| `minTimeout` | Floor value. Timeouts cannot go below this (protects against edge cases). |

### Timeout Calculation Example

```
Blocking partners:
  - Partner A: 500ms (no dependency)
  - Partner B: 1500ms (dependsOn: A)
  - Partner C: 1000ms (dependsOn: A)

Dependency graph:
  A (500ms) → B (1500ms)
           → C (1000ms)

Critical paths:
  - A → B = 500 + 1500 = 2000ms
  - A → C = 500 + 1000 = 1500ms

Calculated timeout = max(2000, 1500) = 2000ms
```

### Flow

```
1. CMP ready
   ↓
2. Orchestrator starts
   ↓
3. ALL partners begin loading in parallel:
   - Blocking partners (respecting dependsOn)
   - Independent partners (no dependencies)
   - NonCore partners (no dependencies)
   ↓
4. Wait for blocking partners: [All complete OR calculated timeout fires]
   ↓
5. partners.afterReady hook executes
   ↓
6. Independent timeout timer starts (partners already loading since step 3)
   ↓
7. Wait for independent partners: [All complete OR independentTimeout fires]
   ↓
8. GAM call triggered
   ↓
   (NonCore continues independently, never blocks GAM)
```

### API

```javascript
// Get orchestrator state
proton.orchestrator.getState()

// Check if blocking partners ready
proton.orchestrator.isPartnersReady()

// Check if all partners ready (blocking + independent)
proton.orchestrator.isAllPartnersReady()

// Get specific partner status
proton.orchestrator.getPartnerStatus('prebid')

// Check if a partner can load (dependency satisfied)
proton.orchestrator.canLoad('prebid')

// Get partners that depend on a given partner
proton.orchestrator.getDependents('permutive')
```

### PubSub Events

| Event | When |
|-------|------|
| `loader.orchestrator.ready` | Orchestrator initialized |
| `loader.partners.ready` | Blocking partners complete (or timeout) |
| `loader.ads.ready` | All partners ready (blocking + independent) |
| `loader.partner.{name}.timeout` | Specific partner timed out |
| `loader.partners.independent.timeout` | Independent timeout fired |
| `loader.partners.nonCore.ready` | NonCore partners complete (or timeout) |
| `loader.partners.nonCore.timeout` | NonCore timeout fired |

### Hooks

| Hook | When | Arguments |
|------|------|-----------|
| `partners.afterReady` | After blocking partners, before GAM | `partnerStatus`, `elapsed` |
| `partners.onTimeout` | When blocking timeout fires | `timedOutPartners[]` |
| `partners.allReady` | After all partners (blocking + independent) | `partnerStatus`, `elapsed` |
| `partners.nonCoreReady` | After nonCore partners | `partnerStatus`, `elapsed` |

## Usage

### Configuration

```json
// config/partners.json
// Ready events are auto-derived as plugin.{name}.complete
{
  "enabled": true,
  "blocking": [
    {
      "name": "partner1",
      "timeout": 500,
      "active": true,
      "description": "First partner in chain"
    },
    {
      "name": "partner2",
      "timeout": 1500,
      "active": true,
      "dependsOn": "partner1",
      "description": "Depends on partner1"
    },
    {
      "name": "partner3",
      "timeout": 1000,
      "active": true,
      "dependsOn": "partner1",
      "description": "Also depends on partner1"
    }
  ],
  "independent": [
    {
      "name": "partner4",
      "active": true,
      "description": "Independent partner"
    }
  ],
  "nonCore": [
    {
      "name": "partner5",
      "active": true,
      "description": "Non-core partner"
    }
  ],
  "defaults": {
    "universalTimeout": 3500,
    "independentTimeout": 1000,
    "nonCoreTimeout": 5000,
    "minTimeout": 500
  }
}
```

### Partner Entry Properties (partners.json)

Full structure for each partner entry in the orchestration config:

```json
{
  "name": "mypartner",
  "active": true,
  "description": "Human-readable description of partner purpose",
  "timeout": 2000,
  "dependsOn": "permutive"
}
```

Ready event is auto-derived as `plugin.mypartner.complete`.

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `name` | string | Yes | - | Must match partner definition in `config/partners/*.js`. Ready event derived as `plugin.{name}.complete` |
| `active` | boolean | Yes | - | Enable/disable this partner |
| `description` | string | No | - | Human-readable description for documentation |
| `timeout` | number | Blocking only | - | Individual timeout in ms (only for blocking category) |
| `dependsOn` | string | No | null | Name of partner that must complete first (only for blocking category) |
| `testRange` | [number, number] | No | null | A/B test bucket range [min, max] (0-99). Partner only loads if pageview testgroup falls within range. |

### Partner A/B Testing (testRange)

Any partner (blocking, independent, or nonCore) can use `testRange` to run only for a percentage of pageviews. Uses the same testgroup system as experiments.

```json
{
  "blocking": [
    {
      "name": "newBidder",
      "timeout": 1500,
      "active": true,
      "testRange": [0, 49],
      "description": "Test new bidder on 50% of traffic"
    }
  ]
}
```

| Range | Traffic |
|-------|---------|
| `[0, 49]` | 50% |
| `[0, 24]` | 25% |
| `[0, 9]` | 10% |
| `[50, 99]` | 50% (different segment) |

**Notes:**
- testRange uses the same testgroup (0-99) as experiments
- Partners without testRange load for all pageviews
- Combine with `active: true/false` for full control

## Usage Example

### Basic Setup

```json
{
  "enabled": true,
  "blocking": [
    { "name": "audience", "timeout": 500, "active": true, "description": "Audience data" },
    { "name": "bidder1", "timeout": 1500, "active": true, "dependsOn": "audience", "description": "Header bidder 1" },
    { "name": "bidder2", "timeout": 1000, "active": true, "dependsOn": "audience", "description": "Header bidder 2" }
  ],
  "independent": [
    { "name": "brandsafety", "active": true, "description": "Brand safety verification" }
  ],
  "nonCore": [
    { "name": "affiliate", "active": true, "description": "Affiliate tracking" }
  ],
  "defaults": {
    "universalTimeout": 3500,
    "independentTimeout": 1000,
    "nonCoreTimeout": 5000,
    "minTimeout": 500
  }
}
```

**Result:**
- `audience` loads first (500ms timeout)
- `bidder1` and `bidder2` wait for `audience`, then load in parallel
- `brandsafety` **loads immediately in parallel** with blocking partners
- `affiliate` **loads immediately in parallel** with all partners
- Total blocking timeout = 500 + max(1500, 1000) = 2000ms
- After blocking completes, `brandsafety` timeout timer starts (1000ms to complete)
- `affiliate` runs independently, never blocks GAM

### Signalling Partner Completion

Partners must publish their ready event when complete. See `config/partners/_scaffold.js` for the full partner configuration structure.

```javascript
// config/partners/mypartner.js
// Full structure - see _scaffold.js for all available options
export default {
  // Core identification
  name: 'mypartner',
  active: true,

  // Script loading
  url: 'https://example.com/script.js',
  timeout: 2000,
  async: true,
  location: 'body',
  attributes: [],

  // Property & domain targeting
  properties: ['mysite', 'dev'],  // undefined = all properties
  domains: ['all'],
  consentState: [],

  // Include/exclude rules (dimensions from config/dimensions.json)
  include: {
    section: ['all'],
    pagetype: ['all'],
    geo: ['all']
  },
  exclude: {
    section: [],
    pagetype: []
  },

  // Lifecycle callbacks
  preloadFn: function() {
    // Create stubs before script loads
    window.mypartner = window.mypartner || { cmd: [] };
  },
  onloadFn: function() {
    // Initialize partner
    window.mypartner.init({ siteId: '12345' });

    // Signal completion (REQUIRED for blocking/independent partners)
    window.PubSub.publish({ topic: 'plugin.mypartner.complete' });
  },
  onerrorFn: function() {
    // Handle load errors - still signal completion to not block
    window.PubSub.publish({ topic: 'plugin.mypartner.complete' });
  },
  timeoutFn: function() {},
  ignoreFn: function() {}
};
```

### Hooking Into Orchestration

```javascript
// config/hooks.js
export default {
  'partners.afterReady': [{
    name: 'logPartnerTiming',
    fn: (status, elapsed) => {
      console.log('Blocking partners ready in', elapsed + 'ms');
      console.log('Partner status:', status);
    }
  }],
  'partners.onTimeout': [{
    name: 'handleTimeout',
    fn: (timedOutPartners) => {
      console.warn('Partners timed out:', timedOutPartners);
    }
  }]
};
```

### Checking State at Runtime

```javascript
// Check if ready to call GAM
if (proton.orchestrator.isAllPartnersReady()) {
  // Safe to make ad calls
}

// Get full state
const state = proton.orchestrator.getState();
console.log({
  elapsed: state.elapsed,
  blocking: state.blocking,
  independent: state.independent,
  timeoutFired: state.timeoutFired
});

// Check specific partner
const prebidStatus = proton.orchestrator.getPartnerStatus('prebid');
// { status: 'completed', startTime: 1234567890, completedTime: 1234568890, ... }
```
