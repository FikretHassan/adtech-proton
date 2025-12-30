# Experiments (A/B Testing)

> **Optional Module**: Can be excluded from build by setting `optionalModules.experiments: false` in `config/loader.js`

## Description

Manages A/B test experiments for plugins. Experiments modify plugin configurations based on random bucket assignment and targeting rules.

## Functionality

### Testgroup Assignment

- Each pageview is assigned a random testgroup (0-99)
- No persistence - truly random per pageview

### Experiment Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique experiment identifier |
| `active` | boolean | Enable/disable experiment |
| `testRange` | [min, max] | Pageview bucket range (0-99 inclusive) |
| `plugin` | string\|null | Target plugin, or null for global |
| `properties` | string[] | Property IDs where experiment runs |
| `include` | object | Targeting rules to include |
| `exclude` | object | Targeting rules to exclude |
| `apply` | function | Function to modify plugin config |

### API

```javascript
// Get experiment status
proton.experiments.getStatus()
// {
//   testgroup: 42,
//   registered: [{ id, active, testRange, plugin }],
//   applied: { experimentId: { plugin, testgroup, appliedAt } }
// }

// Check if pageview is in range
proton.experiments.isInRange([0, 24])  // true if testgroup 0-24
```

## Usage

### Experiment Configuration

```javascript
// config/experiments.js
export default [
  {
    id: 'prebid_timeout_test',
    active: true,
    testRange: [0, 49],  // 50% of pageviews (buckets 0-49)
    plugin: 'prebid',
    properties: ['siteA', 'siteB'],  // Only on these properties
    include: {
      pagetype: ['story', 'section']
    },
    exclude: {
      section: ['homepage']
    },
    apply: (config) => {
      // Modify prebid config for test group
      config.timeout = 2000;  // Extended timeout
      config.testVariant = 'extended_timeout';
    }
  },
  {
    id: 'new_bidder_test',
    active: true,
    testRange: [50, 74],  // 25% of pageviews (buckets 50-74)
    plugin: 'prebid',
    include: {},
    exclude: {},
    apply: (config) => {
      // Add new bidder for test
      config.bidders = config.bidders || [];
      config.bidders.push('newBidder');
    }
  }
];
```

### Testgroup Ranges

| Range | Percentage | Description |
|-------|------------|-------------|
| `[0, 99]` | 100% | All pageviews |
| `[0, 49]` | 50% | First half |
| `[50, 99]` | 50% | Second half |
| `[0, 9]` | 10% | Small test |
| `[0, 0]` | 1% | Single bucket |

## Usage Example

### Basic A/B Test

```javascript
// 50/50 split: test vs control
{
  id: 'header_bidding_ab',
  active: true,
  testRange: [0, 49],  // Test group (50%)
  plugin: 'prebid',
  apply: (config) => {
    config.variant = 'test';
    config.floorPrice = 0.50;
  }
}
// Pageviews 50-99 get default config (control)
```

### Multi-Variant Test

```javascript
// Variant A: 33%
{
  id: 'timeout_variant_a',
  testRange: [0, 32],
  plugin: 'prebid',
  apply: (config) => { config.timeout = 1000; }
},
// Variant B: 33%
{
  id: 'timeout_variant_b',
  testRange: [33, 65],
  plugin: 'prebid',
  apply: (config) => { config.timeout = 1500; }
},
// Variant C: 34%
{
  id: 'timeout_variant_c',
  testRange: [66, 99],
  plugin: 'prebid',
  apply: (config) => { config.timeout = 2000; }
}
```

### Targeting-Specific Test

```javascript
{
  id: 'mobile_floor_test',
  active: true,
  testRange: [0, 24],  // 25% of mobile pageviews
  plugin: 'prebid',
  include: {
    viewport: ['s', 'xs']  // Mobile only
  },
  exclude: {
    section: ['sport']  // Not on sport
  },
  apply: (config) => {
    config.mobileFloor = 0.25;
  }
}
```

### Checking Applied Experiments

```javascript
// In analytics or debugging
const status = proton.experiments.getStatus();

console.log('Pageview testgroup:', status.testgroup);
console.log('Applied experiments:', Object.keys(status.applied));

// Send to analytics
analytics.track('experiment_assignment', {
  testgroup: status.testgroup,
  experiments: status.applied
});
```

### Environment-Specific Experiments

```javascript
{
  id: 'sitea_only_test',
  active: true,
  testRange: [0, 49],
  plugin: 'amazonaps',
  properties: ['siteA'],  // Only runs on siteA property
  apply: (config) => {
    config.pubID = 'test-pub-id';
  }
}
```
