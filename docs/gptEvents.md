# GPT Events Module

## Description

Handles GPT event listeners for slot lifecycle tracking, UI updates (opacity, classes, height), and metrics collection. Automatically registers all GPT pubads events and maintains per-slot metrics.

## Functionality / Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `init(options)` | options: {pubsub, getTimestamp} | void | Initialize module with PubSub and optional timestamp function |
| `registerEventListeners()` | none | `boolean` | Register all GPT event listeners |
| `getSlotMetrics(slotId)` | slotId: string | `Object\|null` | Get metrics for a specific slot |
| `getAllMetrics()` | none | `Object` | Get all slot metrics |
| `getConfig()` | none | `Object` | Get event handler configuration |
| `hasFirstAdRendered()` | none | `boolean` | Check if any ad has rendered |
| `reset()` | none | void | Reset all state (for SPA navigation) |

## Usage

Configure in `config/gptEvents.json`:

```json
{
  "classes": {
    "loaded": "is-loaded",
    "empty": "is-empty"
  },
  "emptySlots": {
    "collapse": true,
    "hideContainer": true,
    "containerSuffix": "_container"
  },
  "opacity": {
    "filled": 1,
    "empty": 0
  },
  "pubsub": {
    "slotRendered": "ads.slot.{slotId}.rendered",
    "firstAdRendered": "ads.firstAdRendered",
    "slotEmpty": "ads.slot.{slotId}.empty"
  },
  "metrics": {
    "enabled": true
  }
}
```

### Configuration Options

| Key | Description |
|-----|-------------|
| `classes.loaded` | Class added when slot is filled |
| `classes.empty` | Class added when slot is empty |
| `emptySlots.collapse` | Set height to 0 for empty slots |
| `emptySlots.hideContainer` | Hide container element for empty slots |
| `emptySlots.containerSuffix` | Suffix for container element ID |
| `opacity.filled` | Opacity value for filled slots |
| `opacity.empty` | Opacity value for empty slots |
| `pubsub.slotRendered` | Topic template for slot rendered event |
| `pubsub.firstAdRendered` | Topic for first ad rendered event |
| `pubsub.slotEmpty` | Topic template for slot empty event |

### Events Handled

| GPT Event | What It Does |
|-----------|--------------|
| `slotRequested` | Initializes metrics object for slot |
| `slotResponseReceived` | Records response timestamp |
| `slotOnload` | Records load timestamp |
| `slotRenderEnded` | Sets opacity, classes, height; records metrics |
| `slotVisibilityChanged` | Tracks inViewPercentage |
| `impressionViewable` | Records viewability achieved |

### Metrics Collected Per Slot

```javascript
{
  // Timestamps
  slotRequested: 823,
  slotResponseReceived: 1275,
  slotOnload: 1305,
  slotRenderEnded: 1305,
  impressionViewable: 3207,

  // Targeting snapshot at request time
  targetingMap: { div: ['advert_mysite_mpu_1'], pos: ['1'], ... },

  // GAM response data
  advertiserId: 14636214,
  campaignId: 396853494,
  lineItemId: 6343297574,
  creativeId: 138439515715,
  isEmpty: false,
  isBackfill: false,
  size: [300, 250],
  sizeW: 300,
  sizeH: 250,
  googleQueryId: 'CNG4kYazzZEDFSR2kQUd70I5vQ',

  // Viewability tracking
  inViewPercentage: 100,
  isViewable: true,
  isViewableAchieved: true,
  isViewableTimeFirst: 3207,      // first time slot became viewable
  isViewableTimeStart: 3207,      // current viewability session start
  isViewableTimeEnd: 0,           // current session end (0 if still viewable)
  isViewableTimeInView: 5000,     // cumulative time in view (ms)

  // Latency calculations (ms from slotRequested)
  latency_slotResponseReceived: 452,
  latency_slotOnload: 482,
  latency_slotRenderEnded: 482,
  latency_impressionViewable: 2384
}
```

## Usage Example

```javascript
// Module is auto-initialized in entry.js
// Access via proton.gptEvents

// Get metrics for a specific slot
const metrics = proton.gptEvents.getSlotMetrics('advert_mysite_ban_1');
console.log(metrics.latency_slotRenderEnded); // 245.67

// Get all slot metrics
const allMetrics = proton.gptEvents.getAllMetrics();

// Check if first ad has rendered
if (proton.gptEvents.hasFirstAdRendered()) {
  console.log('At least one ad has rendered');
}

// Subscribe to slot rendered events
PubSub.subscribe({
  topic: 'ads.slot.advert_mysite_ban_1.rendered',
  func: (data) => {
    console.log('Banner rendered:', data.size);
  }
});

// Subscribe to first ad rendered
PubSub.subscribe({
  topic: 'ads.firstAdRendered',
  func: (data) => {
    console.log('First ad rendered:', data.slotId);
  }
});

// Reset for SPA navigation
proton.gptEvents.reset();
```
