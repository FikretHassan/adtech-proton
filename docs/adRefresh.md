# Ad Refresh Module

> **Optional Module**: Can be excluded from build by setting `optionalModules.refresh: false` in `config/loader.js`

## Description

Handles timer-based ad refresh with visibility checks, user activity detection, and dimension-based configuration. Rules use the same `include/exclude` pattern as other configs for consistent dimension targeting.

## Functionality / Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `init()` | none | void | Initializes refresh module |
| `scheduleRefresh(slotId, options)` | slotId: string, options: {adType} | `boolean` | Schedules refresh for a slot |
| `cancelRefresh(slotId)` | slotId: string | `boolean` | Cancels refresh timer for a slot |
| `cancelAllRefreshes()` | none | void | Cancels all active refresh timers |
| `getState(slotId)` | slotId: string | `Object\|null` | Returns refresh state for a slot |
| `getAllStates()` | none | `Object` | Returns all active refresh timer states |
| `getRefreshConfig()` | none | `Object\|null` | Gets matching refresh rule for current dimensions |
| `isTabVisible()` | none | `boolean` | Returns tab visibility state |
| `reset()` | none | void | Cancels all timers and resets state |
| `getConfig()` | none | `Object` | Returns refresh configuration |

## Usage

Configure in `config/refresh.json`:

```json
{
  "enabled": true,
  "pauseOnHidden": true,
  "requireUserActivity": true,
  "fadeOutDuration": 300,
  "defaults": {
    "refreshRate": 11000,
    "refreshCycle": 0
  },
  "rules": [
    {
      "include": { "pagetype": ["story"], "viewport": ["x", "l"] },
      "adType": "mpu",
      "refreshRate": 11000,
      "refreshCycle": 0
    },
    {
      "include": { "pagetype": ["story"], "viewport": ["m", "s", "xs"] },
      "adType": "ban",
      "refreshRate": 15000,
      "refreshCycle": 2
    },
    {
      "include": { "pagetype": ["index"], "viewport": ["all"] },
      "adType": "ban",
      "refreshRate": 11000,
      "refreshCycle": 1
    }
  ]
}
```

### Configuration Options

| Key | Type | Description |
|-----|------|-------------|
| `enabled` | boolean | Master enable/disable for refresh |
| `pauseOnHidden` | boolean | Pause countdown when tab is hidden |
| `requireUserActivity` | boolean | Wait for user activity (scroll, mousemove) before triggering refresh |
| `fadeOutDuration` | number | Milliseconds to fade out ad before refresh (0 to disable) |
| `defaults.refreshRate` | number | Default time between refreshes in milliseconds |
| `defaults.refreshCycle` | number | Default max refresh count (0 = unlimited) |

### Rule Properties

| Property | Type | Description |
|----------|------|-------------|
| `include` | object | Dimension values to match (from dimensions.json) |
| `exclude` | object | Dimension values to exclude |
| `properties` | array | Property IDs where rule applies (e.g., `["mysite", "dev"]`) - if omitted, applies to all |
| `adType` | string | Target ad type - only slots with this type will refresh |
| `slotIds` | array | Specific slot IDs to target (if omitted, applies to all slots matching adType) |
| `refreshRate` | number | Time between refreshes in milliseconds |
| `refreshCycle` | number | Max refreshes (0 = unlimited) |
| `slotVisibleThreshold` | number | Visibility threshold (0.5 to 1.0) - percentage of slot that must be visible. Default: 0.5 |

### How Dimension Matching Works

Rules use the same `include/exclude` pattern as plugins and experiences:

```json
{
  "include": { "pagetype": ["story"], "viewport": ["x", "l"] },
  "adType": "mpu"
}
```

This rule matches when:
- `pagetype` dimension returns "story" AND
- `viewport` dimension returns "x" or "l"

The `adType` then filters which slots actually refresh - only MPU slots will refresh on this rule.

### Targeting Specific Slots

Use `slotIds` to target specific slots within an adType. Useful for sticky ads where only certain positions should refresh:

```json
{
  "rules": [
    {
      "include": { "pagetype": ["story"] },
      "adType": "bin",
      "slotIds": ["advert_mysite_bin_1"],
      "refreshRate": 11000
    }
  ]
}
```

This refreshes only `advert_mysite_bin_1`, not `advert_mysite_bin_2` or other bins.

## Usage Example

```javascript
// Auto-scheduling via processSlots (recommended)
// Refresh rules from config/refresh.json are matched using generated dimensions
proton.slots.processSlots(
  { site: 'mysite', zone: 'news' }
);

// Check scheduled refreshes
proton.adRefresh.getAllStates();
// {
//   'advert_mysite_mpu_1': { slotId: 'advert_mysite_mpu_1', countdown: 8, adcount: 1, ... },
//   'advert_mysite_ban_1': { slotId: 'advert_mysite_ban_1', countdown: 12, adcount: 1, ... }
// }

// Manual scheduling
proton.adRefresh.init();
proton.adRefresh.scheduleRefresh('advert_mysite_mpu_1', { adType: 'mpu' });

// Check single slot state
proton.adRefresh.getState('advert_mysite_mpu_1');
// { slotId: 'advert_mysite_mpu_1', countdown: 5, adcount: 1, refreshCycle: 0, refreshing: false }

// Cancel refresh for a slot
proton.adRefresh.cancelRefresh('advert_mysite_mpu_1');

// Cancel all refreshes (done automatically by slots.reset())
proton.adRefresh.cancelAllRefreshes();

// Disable auto-refresh when processing slots
proton.slots.processSlots(
  { site: 'mysite', zone: 'news' },
  { enableRefresh: false }
);
```
