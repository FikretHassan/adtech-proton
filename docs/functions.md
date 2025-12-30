# Functions Module

## Description

Provides utility functions for ad slot lifecycle management. Handles observer cleanup, slot destruction, and full slot recreation for SPA navigation and dynamic page updates.

## Functionality / Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `disconnectObservers(filter)` | filter: string \| object | void | Disconnects lazy load IntersectionObservers matching filter |
| `destroySlots(filter)` | filter: string \| object | void | Destroys GPT slots, clears wrapper auctions, cancels refresh timers |
| `recreate(filter)` | filter: string \| object | void | Full lifecycle: disconnect observers, destroy slots, clear classes, re-request |

### Filter Patterns

All functions accept a filter parameter with three patterns:

| Pattern | Example | Matches |
|---------|---------|---------|
| `'all'` | `'all'` | All slots |
| Exact ID | `'advert_mysite_dyn_5'` | Single slot by ID |
| Ad type | `{ adtype: 'dyn' }` | All slots of that type |

### Observer Management

Lazy loaded slots use IntersectionObserver. When destroying slots, observers must be disconnected to prevent orphaned callbacks from firing on destroyed slots.

| Access | Description |
|--------|-------------|
| `proton.slots.getActiveObservers()` | Returns Map of slotId → IntersectionObserver |
| `proton.slots.disconnectObservers(filter)` | Direct access to observer cleanup |

## Usage

The functions module initializes automatically with the loader. Access via `proton.functions`:

```javascript
// Disconnect observers only (without destroying slots)
proton.functions.disconnectObservers('all');
proton.functions.disconnectObservers('advert_mysite_dyn_1');
proton.functions.disconnectObservers({ adtype: 'dyn' });

// Destroy slots (GPT slot + refresh timer + observer + wrapper auction)
proton.functions.destroySlots('all');
proton.functions.destroySlots('advert_mysite_mpu_1');
proton.functions.destroySlots({ adtype: 'mpu' });

// Full recreate (disconnect + destroy + clear classes + re-request)
proton.functions.recreate('all');
proton.functions.recreate('advert_mysite_ban_1');
proton.functions.recreate({ adtype: 'ban' });

// Access active observers directly via slots module
const observers = proton.slots.getActiveObservers();
console.log('Active observers:', observers.size);
```

## Usage Example

```javascript
// SPA Navigation - recreate all ads after route change
function onRouteChange() {
  proton.functions.recreate('all');
}

// Dynamic content update - recreate specific ad type
function onInfiniteScrollLoad() {
  proton.functions.recreate({ adtype: 'dyn' });
}

// Clean up before removing DOM elements
function beforeRemoveSection() {
  proton.functions.destroySlots({ adtype: 'mpu' });
}

// Manual observer cleanup only (rare use case)
function onScrollContainerChange() {
  proton.functions.disconnectObservers('advert_mysite_dyn_3');
}
```
