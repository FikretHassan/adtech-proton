# SPA Integration

## Description

Proton supports Single Page Applications through slot lifecycle management and partner re-evaluation. On navigation, slots are destroyed, DOM is swapped, and ads are re-requested with fresh context.

## Functionality / Functions

| Function | Access | Description |
|----------|--------|-------------|
| `destroySlots(filter)` | `proton.functions.destroySlots()` | Destroys GPT slots, cancels refresh timers, disconnects observers, clears wrapper auctions |
| `recreate(filter)` | `proton.functions.recreate()` | Full cycle: destroy + clear classes + re-request ads |
| `requestAds()` | `proton.requestAds()` | Discovers slots, runs injection, sets up lazy loading |
| `reevaluatePartners()` | `proton.reevaluatePartners()` | Re-checks partners that didn't load (consent/targeting may have changed) |

### Filter Patterns

| Pattern | Example | Matches |
|---------|---------|---------|
| `'all'` | `'all'` | All slots |
| Exact ID | `'advert_mysite_dyn_5'` | Single slot by ID |
| Ad type | `{ adtype: 'dyn' }` | All slots of that type |

### Slot Cleanup Behavior

| Slot Type | Cleanup Action |
|-----------|----------------|
| Hardcoded | GPT slot destroyed, observed/loaded classes removed |
| Injected (dyn) | Entire container element removed from DOM |

### Partner Re-evaluation

| Previous Status | Action |
|-----------------|--------|
| `loaded`, `timeout`, `error` | Skipped (already tried) |
| `inactive` | Re-evaluated (consent may have changed) |
| `ignore` | Re-evaluated (targeting may have changed) |

## Usage

### Full Navigation Pattern

```javascript
function onRouteChange(newPage) {
  // 1. Destroy all slots
  proton.functions.destroySlots('all');

  // 2. Cancel refresh timers
  proton.adRefresh?.cancelAllRefreshes();

  // 3. Update meta tags (targeting context)
  document.querySelector('meta[name="ads.pagetype"]').content = newPage.pagetype;
  document.querySelector('meta[name="ads.section"]').content = newPage.section;

  // 4. Swap DOM content
  document.getElementById('content').innerHTML = newPage.html;

  // 5. Request ads (discovers new slots, runs injection)
  proton.requestAds();

  // 6. Re-evaluate partners that didn't load initially
  proton.reevaluatePartners();
}
```

### Same-Page Refresh

```javascript
// Recreate all ads without full navigation
proton.functions.recreate('all');

// Recreate only dynamic ads
proton.functions.recreate({ adtype: 'dyn' });
```

## Usage Example

```javascript
// React/Next.js router integration
useEffect(() => {
  const handleRouteChange = () => {
    proton.functions.destroySlots('all');
    proton.adRefresh?.cancelAllRefreshes();
  };

  const handleRouteComplete = () => {
    proton.requestAds();
    proton.reevaluatePartners();
  };

  router.events.on('routeChangeStart', handleRouteChange);
  router.events.on('routeChangeComplete', handleRouteComplete);

  return () => {
    router.events.off('routeChangeStart', handleRouteChange);
    router.events.off('routeChangeComplete', handleRouteComplete);
  };
}, []);

// Vue Router integration
router.beforeEach((to, from, next) => {
  proton.functions.destroySlots('all');
  proton.adRefresh?.cancelAllRefreshes();
  next();
});

router.afterEach(() => {
  proton.requestAds();
  proton.reevaluatePartners();
});
```

### PubSub Events

```javascript
// Listen for partner re-evaluation results
PubSub.subscribe({
  topic: 'loader.partners.reevaluated',
  func: (data) => {
    console.log(`${data.loaded} of ${data.evaluated} partners now loaded`);
  }
});
```
