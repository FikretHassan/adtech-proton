# Wrapper Auctions

## Description

Optional module that orchestrates header bidding auctions through a generic adapter pattern. Supports any wrapper that implements the `WrapperAdapter` interface.

The system uses:
- **Convention-based partner linking**: adapters link to partners in `partners.json` by name
- **Declarative slot configuration**: slot rules defined in `slots.json` with targeting
- **Shared slot resolver**: `wrapperSlotResolver.ts` resolves slot config for all adapters

Key features:
- Generic adapter registry - add any wrapper without modifying core code
- Declarative JSON-based slot rules with dimension targeting
- Per-slot auction state management
- Parallel bid requests across all registered adapters
- Build-time optional (tree-shaken when `wrappers: false`)

## Functionality

### Slot Configuration (slots.json)

Slot rules are defined declaratively in `config/wrapperauctions/slots.json`:

```json
{
  "common": {
    "rules": [
      {
        "match": { "adType": "mpu" },
        "include": { "viewport": ["x", "l"] },
        "exclude": { "pagetype": ["index", "topic"] },
        "sizes": [[300, 250], [300, 600]],
        "wrappers": {
          "prebid": {
            "bidders": {
              "ozone": { "placementId": "12345" },
              "criteo": true
            }
          },
          "amazonaps": true
        }
      }
    ]
  },
  "properties": {
    "mysite": {},
    "dev": {},
    "default": {}
  }
}
```

#### Rule Structure

| Field | Description |
|-------|-------------|
| `match` | Slot matching criteria (adType, slotId, or slotPattern) |
| `include` | Dimension values that must match (uses `evaluateTargeting`) |
| `exclude` | Dimension values that exclude the slot |
| `sizes` | Explicit bid request sizes `[[width, height], ...]` |
| `video` | Optional boolean for video/outstream support |
| `wrappers` | Wrapper-specific configuration |

#### Match Types

```json
// Match by ad type (extracted from slot ID)
{ "match": { "adType": "mpu" } }   // matches advert_mysite_mpu, advert_mpu_0

// Match exact slot ID
{ "match": { "slotId": "advert_custom_slot" } }

// Match by wildcard pattern (* matches any characters)
{ "match": { "slotPattern": "advert_*_dyn_*" } }
```

#### Targeting with Dimensions

Include/exclude use dimensions from `dimensions.json`:

```json
{
  "include": { "viewport": ["x", "l"], "pagetype": ["article"] },
  "exclude": { "zone": ["puzzles"] }
}
```

Targeting is evaluated using `evaluateTargeting()` from targeting.ts with the current context.

### Wrapper Hierarchy

```
wrappers (wrapper level)
├── prebid (wrapper with bidders)
│   └── bidders
│       ├── ozone: { placementId: "..." }
│       └── criteo: true
└── amazonaps: true (standalone wrapper)
```

- **Prebid** contains multiple bidders (ozone, criteo, etc.)
- **Amazon APS** is a standalone wrapper
- Each wrapper can be enabled/disabled per rule

### wrapperSlotResolver API

Located at `src/optional/wrapperSlotResolver.ts`:

| Function | Description |
|----------|-------------|
| `hasSlotConfig(slotId, wrapperName, context)` | Check if slot has config for wrapper |
| `resolveSlotConfig(slotId, wrapperName, context)` | Get generic slot config |
| `resolveSlotConfigForPrebid(slotId, context)` | Get Prebid config with bidders |
| `resolveSlotConfigForAmazonAps(slotId, context)` | Get Amazon APS config |
| `findMatchingRule(slotId, wrapperName, context)` | Get first matching rule |
| `getConfiguredAdTypes(wrapperName)` | Get ad types with rules for wrapper |

### WrapperAdapter Interface

```typescript
interface WrapperAdapter {
  name: string;                    // Must match partner name
  isLibraryLoaded(): boolean;      // Check if vendor library exists
  init(context): void;             // Initialize the library
  hasSlotConfig(slotId, context): boolean;  // Check if slot has config
  getAdUnit(slotId, context): object | null; // Get slot config
  requestBids(slotId, context, timeout): Promise<AuctionResult>;
  applyTargeting(slotId): void;    // Apply bids to GPT slot
  clearSlot?(slotId): void;        // Optional cleanup
  getState?(): object;             // Optional state getter
}
```

### Core Functions

| Function | Description |
|----------|-------------|
| `registerWrapper(adapter)` | Register a WrapperAdapter |
| `getWrapper(name)` | Get adapter by name |
| `getRegisteredWrappers()` | Get array of registered adapter names |
| `requestAuction(slotId, options)` | Run all enabled auctions for a slot |
| `applyBids(slotId)` | Apply all bid targeting to GPT slot |

## Usage

### Build Configuration

Enable/disable at build time in `config/loader.js`:

```javascript
optionalModules: {
  wrappers: true  // Set false to exclude (~33kb savings)
}
```

### Adding a New Wrapper

**Step 1: Add partner in partners.json**

```json
{
  "independent": [
    {
      "name": "myWrapper",
      "active": true,
      "description": "My header bidding wrapper"
    }
  ]
}
```

**Step 2: Add wrapper config in wrappers.json**

```json
{
  "myWrapper": { "enabled": true }
}
```

**Step 3: Add slot rules in slots.json**

```json
{
  "common": {
    "rules": [
      {
        "match": { "adType": "mpu" },
        "include": { "viewport": ["x", "l"] },
        "sizes": [[300, 250]],
        "wrappers": {
          "myWrapper": {
            "customParam": "value"
          }
        }
      }
    ]
  }
}
```

**Step 4: Create adapter file**

Copy a scaffold from `config/wrapperauctions/`:
- `_scaffold.prebid.js` - For Prebid-based wrappers with multiple bidders
- `_scaffold.amazonaps.js` - For Amazon-style single wrappers
- `_scaffold.wrapper.js` - Generic template for any wrapper

**Step 5: Register in index.js**

```javascript
// config/wrapperauctions/index.js
import myWrapperAdapter from './myWrapper.js';

if (wrappersConfig.myWrapper?.enabled !== false) {
  wrapperAuctions.registerWrapper(myWrapperAdapter);
}
```

### Adding a Bidder to Prebid

**Step 1: Add bidder config in slots.json**

```json
{
  "wrappers": {
    "prebid": {
      "bidders": {
        "newBidder": { "placementId": "12345" }
      }
    }
  }
}
```

**Step 2: Add bidder builder in prebid.js**

```javascript
function buildNewBidderBid(slotId, bidderParams) {
  const config = getBidderConfig();
  return {
    bidder: 'newBidder',
    params: {
      publisherId: config.newBidder.publisherId,
      placementId: bidderParams.placementId
    }
  };
}
```

**Step 3: Add to buildBids()**

```javascript
function buildBids(slotId, resolvedConfig) {
  const bids = [];
  const bidders = resolvedConfig.bidders;

  if (bidders.newBidder) {
    const params = bidders.newBidder === true ? {} : bidders.newBidder;
    bids.push(buildNewBidderBid(slotId, params));
  }

  return bids;
}
```

### Runtime Configuration

**config/wrappers.json**:
```json
{
  "enabled": true,
  "timeout": 1000,
  "timeoutRules": [
    { "include": { "viewport": ["all"] }, "add": 250 }
  ],
  "prebid": { "enabled": true },
  "amazonaps": { "enabled": true }
}
```

## Usage Example

### Check Slot Config

```javascript
import slotResolver from '../src/wrapperSlotResolver.js';

// Check if slot has prebid config
const hasPrebid = slotResolver.hasSlotConfig('advert_mpu', 'prebid', context);

// Get resolved config with sizes and bidders
const config = slotResolver.resolveSlotConfigForPrebid('advert_mpu', context);
console.log(config.sizes);   // [[300, 250], [300, 600]]
console.log(config.bidders); // { ozone: { placementId: "..." }, criteo: true }
```

### Manual Auction

```javascript
const result = await proton.wrapperAuctions.requestAuction('advert_mpu', {
  adcount: 1
});

console.log(result.prebid);    // { success: true, bids: [...] }
console.log(result.amazonaps); // { success: true, bids: [...] }

proton.wrapperAuctions.applyBids('advert_mpu');
```

### Adapter Using Slot Resolver

```javascript
// In your adapter file
import slotResolver from '../../src/wrapperSlotResolver.js';

const myAdapter = {
  name: 'myWrapper',

  hasSlotConfig(slotId, context) {
    return slotResolver.hasSlotConfig(slotId, 'myWrapper', context);
  },

  getAdUnit(slotId, context) {
    const resolved = slotResolver.resolveSlotConfig(slotId, 'myWrapper', context);
    if (!resolved) return null;

    return {
      slotId,
      sizes: resolved.sizes,
      customData: resolved.wrapperConfig.customParam
    };
  }
};
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  slots.json (Declarative Slot Rules)                            │
│  - Match patterns (adType, slotId, slotPattern)                 │
│  - Dimension targeting (include/exclude)                        │
│  - Explicit sizes                                               │
│  - Wrapper configs (prebid.bidders, amazonaps, etc.)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ resolves config
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  wrapperSlotResolver.ts (Shared Utility)                        │
│  - findMatchingRule(slotId, wrapper, context)                   │
│  - evaluateTargeting() for include/exclude                      │
│  - Returns sizes + wrapper config                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ used by adapters
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  wrapperAuctions.ts (Orchestrator)                              │
│  - Registry: Map<name, adapter>                                 │
│  - Manages auction timing/state                                 │
│  - Calls interface methods                                      │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ implements WrapperAdapter
          ┌───────────────────┴───────────────────┐
          │                                       │
┌─────────┴─────────┐               ┌─────────────┴─────────────┐
│  prebid.js        │               │  amazonaps.js             │
│  - Multiple       │               │  - Standalone wrapper     │
│    bidders        │               │  - Uses slotResolver      │
│  - Ozone, Criteo  │               │                           │
└───────────────────┘               └───────────────────────────┘
```

## Scaffolds

Scaffold files in `config/wrapperauctions/`:

| File | Use Case |
|------|----------|
| `_scaffold.slots.json` | Slot rules configuration template |
| `_scaffold.prebid.js` | Prebid wrapper with multiple bidders |
| `_scaffold.amazonaps.js` | Amazon APS-style standalone wrapper |
| `_scaffold.wrapper.js` | Generic template for any new wrapper |

Copy scaffolds, configure credentials and slot rules, then register adapters in index.js.
