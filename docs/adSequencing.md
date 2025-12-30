# Ad Sequencing Module

> **Optional Module**: Can be excluded from build by setting `optionalModules.sequencing: false` in `config/loader.js`

## Description

Staggers ad requests so priority slots load first, allowing response-based decisions before subsequent requests. When a sequencing rule matches, priority slots request first - enabling takeover detection, auction partner disabling, or other conditional logic based on the initial response.

## Functionality / Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `init(options)` | options: {rules} | `Object` | Initialize with rules from config |
| `decide()` | none | `boolean` | Evaluate rules against current context |
| `isActive()` | none | `boolean` | Check if sequencing is active |
| `getReason()` | none | `string\|null` | Get reason for current state |
| `getMatchedConfig()` | none | `Object\|null` | Get the matched rule |
| `getState()` | none | `Object` | Get full module state |
| `addRule(rule)` | rule: Object | `boolean` | Add a rule at runtime |
| `getRules()` | none | `Array` | Get all configured rules |
| `reset()` | none | void | Reset module state |

## Usage

Configure in `config/sequencing.json`:

```json
{
  "enabled": true,
  "prioritySlotTypes": ["ftr"],
  "priorityTimeout": 2000,
  "waitForRender": false,
  "rules": [
    {
      "name": "Homepage Takeover Check",
      "description": "Check for takeover on homepage before other slots",
      "properties": ["mysite"],
      "include": {
        "pagetype": ["index"]
      }
    },
    {
      "name": "Sensitive Content",
      "description": "Sequence news stories except sponsored",
      "properties": ["mysite"],
      "include": {
        "pagetype": ["story"],
        "section": ["news"]
      },
      "exclude": {
        "section": ["sponsored"]
      }
    }
  ]
}
```

### Rule Structure

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Unique rule identifier |
| `description` | string | No | Human-readable description |
| `properties` | string[] | No | Limit rule to specific properties |
| `include` | object | No | Dimension criteria that must match |
| `exclude` | object | No | Dimension criteria that must NOT match |
| `prioritySlotTypes` | string[] | No | Override global priority types for this rule |
| `prioritySlotIds` | string[] | No | Override global priority IDs for this rule |
| `priorityTimeout` | number | No | Override global timeout for this rule |

### Include/Exclude Objects

The `include` and `exclude` objects contain key-value pairs where:
- **Keys** reference dimensions from `config/dimensions.json`
- **Values** are arrays of strings to match against

All `include` criteria must match AND no `exclude` criteria can match.
Multiple values within a criterion use OR logic.

```json
{
  "include": {
    "pagetype": ["story", "article"],  // pagetype is "story" OR "article"
    "section": ["news", "sport"]       // AND section is "news" OR "sport"
  },
  "exclude": {
    "section": ["sponsored"]           // BUT NOT if section is "sponsored"
  }
}
```

### Special Values

| Value | Description |
|-------|-------------|
| `"all"` | Matches any value for that key |

## Usage Example

```javascript
// The module is typically called automatically during ad request flow
// But you can also check state manually:

// Check if sequencing is active
const isSequenced = proton.adSequencing.isActive();

if (isSequenced) {
  console.log('Sequencing active:', proton.adSequencing.getReason());
  // "Rule match: Homepage Takeover Check"

  // Priority slot requests first, check response for takeover...
}

// Check current state
const state = proton.adSequencing.getState();
// {
//   active: true,
//   reason: "Rule match: Homepage Takeover Check",
//   matchedConfig: { name: "Homepage Takeover Check", include: {...} },
//   evaluatedAt: "2024-01-15T10:30:00.000Z",
//   rules: [...]
// }

// Add a rule at runtime
proton.adSequencing.addRule({
  name: "Section Front Takeover",
  properties: ["mysite"],
  include: {
    pagetype: ["section"]
  }
});

// Reset state (e.g., for SPA navigation)
proton.adSequencing.reset();
```

## Priority Slots Configuration

Priority slots are defined by ad type in `config/sequencing.json`:

```json
{
  "enabled": true,
  "prioritySlotTypes": ["ftr", "oop1"],
  "priorityTimeout": 2000,
  "waitForRender": true,
  "rules": [...]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `prioritySlotTypes` | string[] | Ad types that request first when sequencing is active |
| `priorityTimeout` | number | Max wait time (ms) for priority slots before continuing |
| `waitForRender` | boolean | Wait for render event (true) or just request (false) |

### How Slot Types Are Determined

The ad type is extracted from the slot ID's third segment:

```
advert_mysite_ftr    → type: "ftr"
advert_mysite_oop1   → type: "oop1"
advert_mysite_mpu    → type: "mpu"
```

### API

```javascript
// Check if a slot is a priority slot
proton.adSequencing.isPrioritySlot('advert_mysite_ftr')  // true (if "ftr" in prioritySlotTypes)

// Get all priority slot types
proton.adSequencing.getPrioritySlotTypes()  // ["ftr", "oop1"]
```

## URL Parameter Overrides

| Parameter | Effect |
|-----------|--------|
| `?adsequenceon` | Force enable sequencing (bypasses all rules) |
| `?adsequenceoff` | Force disable sequencing |

These are useful for testing sequencing behavior without matching rules.

## Integration with Dimensions

The sequencing module uses dimensions for rule matching:

1. **Define dimensions** in `config/dimensions.json`:
   ```json
   {
     "pagetype": { "source": "meta", "key": "pagetype" },
     "section": { "source": "meta", "key": "section" },
     "geo": { "source": "window", "path": "siteAds.geo" }
   }
   ```

2. **Reference those dimensions** in `config/sequencing.json`:
   ```json
   {
     "rules": [{
       "name": "My Rule",
       "include": {
         "pagetype": ["story"],
         "section": ["news"]
       }
     }]
   }
   ```

3. **The loader resolves dimensions** automatically when evaluating rules. No manual invocation needed - sequencing is evaluated during the ad request flow.

## Matching Logic

### Value Matching

- **Match type**: Determined by `matchType` in `dimensions.json` for each dimension (`exact`, `startsWith`, `includes`)
- **Case sensitivity**: All matching is case-insensitive
- **Array values**: Any element matching any criterion triggers a match
- **Empty/missing values**: Won't match unless criterion is `["all"]`

### Examples

```javascript
// Dimension context (resolved from dimensions.json)
{ pagetype: "index", section: "homepage", geo: "gb" }

// Rule 1: Matches (pagetype is "index")
{ include: { pagetype: ["index"] } }

// Rule 2: Matches (section is "homepage")
{ include: { section: ["homepage"] } }

// Rule 3: Does NOT match (pagetype is not "story")
{ include: { pagetype: ["story"] } }

// Rule 4: Matches (all include criteria satisfied)
{ include: { pagetype: ["index"], section: ["homepage"] } }

// Rule 5: Does NOT match (section is excluded)
{ include: { pagetype: ["index"] }, exclude: { section: ["homepage"] } }
```

## Use Cases

### Takeover Detection

Sequence ads so the priority slot requests first. When it renders, check if it's a takeover and disable auctions for subsequent slots.

**1. Configure sequencing rule with priority slots:**

```json
// config/sequencing.json
{
  "enabled": true,
  "prioritySlotTypes": ["ftr"],
  "priorityTimeout": 2000,
  "waitForRender": true,
  "rules": [{
    "name": "Homepage Takeover Check",
    "properties": ["mysite"],
    "include": { "pagetype": ["index"] }
  }]
}
```

**2. Add hook to check response and disable auctions:**

```javascript
// config/hooks.js
'slot.afterRender': [{
  name: 'takeoverCheck',
  fn: (slotId, event, advertiserInfo) => {
    // Only check priority slots
    if (!proton.adSequencing.isPrioritySlot(slotId)) return;

    // Detect takeover (by advertiser ID, line item, or creative)
    const isTakeover = advertiserInfo?.advertiserId === 12345
                    || event.lineItemId === 67890;

    if (isTakeover) {
      // Disable auctions for all subsequent slot requests
      proton.wrapperAuctions.getConfig().prebid.enabled = false;
      proton.wrapperAuctions.getConfig().amazonaps.enabled = false;

      proton.log('Takeover detected - auctions disabled');
    }
  }
}]
```

**Result:** On homepage, the billboard requests first. If GAM returns a takeover creative, Prebid/APS are disabled before remaining slots request - ensuring the takeover runs without auction competition.

## Best Practices

1. **Order rules by specificity** - More specific rules should come first
2. **Use descriptive names** - Makes debugging easier
3. **Test with URL overrides** - Use `?adsequenceon` to verify behavior
4. **Keep rules minimal** - Only include necessary criteria
5. **Document business logic** - Use the `description` field
