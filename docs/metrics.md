# Metrics

## Description

Centralized metrics system for tracking page lifecycle, ad performance, PubSub events, and vendor/partner load times. Provides a unified `proton.metrics` object that aggregates data from multiple sources for debugging and analytics.

## Functionality / Functions

### Metrics Structure

```javascript
proton.metrics = {
  ads: { ... },      // Per-slot GAM data (targeting, latency, viewability)
  adStack: { ... },  // Page lifecycle + loader milestones
  events: { ... },   // PubSub topic timestamps
  vendors: { ... }   // Partner/plugin load performance
}
```

### ads Section

Per-slot metrics captured from GPT events:

| Field | Type | Description |
|-------|------|-------------|
| `slotRequested` | number | Timestamp when slot was requested |
| `slotResponseReceived` | number | Timestamp when GAM response received |
| `slotOnload` | number | Timestamp when creative loaded |
| `slotRenderEnded` | number | Timestamp when render completed |
| `impressionViewable` | number | Timestamp when IAB viewable threshold met |
| `targetingMap` | object | Full targeting snapshot at request time |
| `advertiserId` | number | GAM advertiser ID |
| `campaignId` | number | GAM campaign ID |
| `lineItemId` | number | GAM line item ID |
| `creativeId` | number | GAM creative ID |
| `isEmpty` | boolean | Whether slot returned empty |
| `isBackfill` | boolean | Whether ad is backfill |
| `size` | array | Rendered size [width, height] |
| `sizeW` | number | Rendered width |
| `sizeH` | number | Rendered height |
| `googleQueryId` | string | Google query ID for debugging |
| `inViewPercentage` | number | Current in-view percentage |
| `isViewable` | boolean | Currently meets 50% threshold |
| `isViewableAchieved` | boolean | Has ever met viewability threshold |
| `isViewableTimeFirst` | number | First time slot became viewable |
| `isViewableTimeStart` | number | Current viewability session start |
| `isViewableTimeEnd` | number | Current viewability session end |
| `isViewableTimeInView` | number | Cumulative time in view (ms) |
| `latency_slotResponseReceived` | number | ms from request to response |
| `latency_slotOnload` | number | ms from request to creative load |
| `latency_slotRenderEnded` | number | ms from request to render complete |
| `latency_impressionViewable` | number | ms from request to viewable |

### adStack Section

Page lifecycle and loader milestone timestamps:

| Key | Description |
|-----|-------------|
| `page_DOMContentLoaded` | DOMContentLoaded event fired |
| `page_load` | Window load event fired |
| `page_readyState_*` | Document readyState changes |
| `pubsub_loader_core_ready` | Core modules initialized |
| `pubsub_loader_ads_create` | Ad request initiated |
| `pubsub_loader_ads_requested` | Ad request completed |
| `pubsub_loader_partners_ready` | Blocking partners complete |

### events Section

PubSub topic timestamps (auto-tracked):

```javascript
{
  pubsub_loader_core_ready: 145,
  pubsub_loader_ads_create: 716,
  pubsub_loader_partners_ready: 712
}
```

### vendors Section

Partner/plugin load performance:

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Current status: init, requested, loaded, error, timeout, ignore, inactive |
| `init` | number | Initialization timestamp |
| `requested` | number | Script request timestamp |
| `received` | number | Script load timestamp |
| `preload` | number | Preload function execution timestamp |
| `error` | number | Error timestamp (-1 if none) |
| `timeout` | number | Timeout timestamp (-1 if none) |
| `latency` | number | Time from request to completion (ms) |

### Module Functions

```javascript
// Track custom adStack milestone
metrics.trackAdStack('custom_milestone');

// Track custom event
metrics.trackEvent('custom.topic');

// Get specific sections
metrics.getAdStack();
metrics.getEvents();
metrics.getAll();  // Complete metrics object

// Reset metrics (SPA navigation)
metrics.reset();
```

## Usage

Metrics tracking is automatic. The module:

1. Initializes early to capture page lifecycle events
2. Subscribes to key PubSub topics for auto-tracking
3. Aggregates slot metrics from gptEvents module
4. Aggregates vendor metrics from plugin loader

### Auto-Tracked PubSub Topics

- `loader.core.ready`
- `loader.ads.create`
- `loader.ads.requested`
- `loader.ads.priorityRequested`
- `loader.ads.priorityComplete`
- `loader.gptEvents.ready`
- `loader.partners.ready`

### Custom Milestone Tracking

```javascript
// Track custom milestones in adStack
proton.metrics.adStack.my_custom_event = performance.now();

// Or use the metrics module directly
import metrics from './metrics';
metrics.trackAdStack('my_custom_event');
```

## Usage Example

### Accessing Metrics in Console

```javascript
// Full metrics object
proton.metrics
// {
//   ads: {
//     advert_site_mpu_1: {
//       slotRequested: 823,
//       slotRenderEnded: 1305,
//       latency_slotRenderEnded: 482,
//       advertiserId: 14636214,
//       targetingMap: { div: ['advert_site_mpu_1'], pos: ['1'], ... },
//       ...
//     }
//   },
//   adStack: {
//     page_DOMContentLoaded: 441,
//     page_load: 1650,
//     pubsub_loader_core_ready: 145,
//     pubsub_loader_ads_create: 716
//   },
//   events: {
//     pubsub_loader_core_ready: 145,
//     pubsub_loader_ads_create: 716
//   },
//   vendors: {
//     gpt: { status: 'loaded', latency: 31, ... },
//     prebid: { status: 'loaded', latency: 122, ... }
//   }
// }

// Check specific slot performance
proton.metrics.ads.advert_site_ban_1.latency_slotRenderEnded
// 463

// Check vendor load times
proton.metrics.vendors.prebid.latency
// 122

// Get page load timeline
proton.metrics.adStack
// { page_DOMContentLoaded: 441, pubsub_loader_ads_create: 716, ... }
```

### Analytics Integration

```javascript
// Send slot metrics to analytics
Object.entries(proton.metrics.ads).forEach(([slotId, data]) => {
  if (!data.isEmpty) {
    analytics.track('ad_rendered', {
      slotId,
      advertiser: data.advertiserId,
      latency: data.latency_slotRenderEnded,
      size: data.size,
      viewable: data.isViewableAchieved
    });
  }
});

// Track vendor performance
Object.entries(proton.metrics.vendors).forEach(([name, data]) => {
  analytics.track('vendor_loaded', {
    vendor: name,
    status: data.status,
    latency: data.latency
  });
});
```

### Debugging Slow Ads

```javascript
// Find slowest slots
const slots = Object.entries(proton.metrics.ads)
  .filter(([_, d]) => d.latency_slotRenderEnded)
  .sort((a, b) => b[1].latency_slotRenderEnded - a[1].latency_slotRenderEnded);

console.table(slots.map(([id, d]) => ({
  slot: id,
  latency: d.latency_slotRenderEnded,
  size: d.size?.join('x'),
  advertiser: d.advertiserId
})));
```
