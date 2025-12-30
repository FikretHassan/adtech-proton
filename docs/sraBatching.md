# SRA Batching

## Description

Optional module that batches above-fold ad slots into fewer HTTP requests using Google Publisher Tag's Single Request Architecture (SRA). Below-fold (lazy) slots continue to request individually as they enter the viewport.

Key features:
- Above-fold slots batched into fewer requests after all auctions complete
- Full compatibility with wrapper auctions (Prebid, Amazon APS)
- Lazy slots remain individual per-slot requests
- URL param overrides for testing
- Build-time optional (tree-shaken when `sraBatching: false`)

## Functionality

### How It Works

Slots are classified as "immediate" or "lazy" based on actual viewport visibility at page load:
- **In viewport** → batched together (even if in lazyload config)
- **Below fold** → lazy loaded individually when scrolled into view

Traditional flow (per-slot requests):
```
Slot A (visible) → Auction A → display(A) → HTTP request
Slot B (visible) → Auction B → display(B) → HTTP request
Slot C (below-fold) → [waits for viewport]
```

SRA batching flow:
```
Slot A (visible) → Auction A → display(A)  }
Slot B (visible) → Auction B → display(B)  } Promise.all + viewport check
                              ↓
           refresh([A,B]) → Batched HTTP request

Slot C (below-fold) → [enters viewport] → Auction C → display(C) → refresh([C])
```

Viewport detection uses `getBoundingClientRect()` to check if slots are visible at page load, regardless of their lazyload config setting.

### GPT Configuration

When SRA batching is enabled, Proton configures GPT with:

```javascript
googletag.pubads().enableSingleRequest();   // Batch slots into single requests
googletag.pubads().disableInitialLoad();    // display() only registers slots
```

Then uses `refresh([slots])` to trigger batched requests after auctions complete.

### Wrapper Auction Compatibility

SRA batching integrates seamlessly with header bidding:

1. All above-fold slots start auctions in parallel
2. Prebid/Amazon auctions run for each slot
3. Promise.all waits for all auctions to complete
4. Bids applied to GPT slot targeting
5. `refresh([allImmediateSlots])` sends batched request

Each slot still gets its own auction with proper bid targeting. Only the GAM request is batched.

### Core Functions

| Function | Description |
|----------|-------------|
| `isSraBatchingEnabled()` | Check if SRA batching is active (build + runtime + URL) |
| `slots.enableServices()` | Configures GPT for SRA mode when enabled |

### PubSub Events

| Topic | Data | Description |
|-------|------|-------------|
| `loader.ads.batchRefresh` | `{ slotIds, count }` | Fired when batch refresh executes |

## Usage

### Build Configuration

Enable/disable at build time in `config/loader.js`:

```javascript
optionalModules: {
  sraBatching: true  // Set false to exclude from bundle
}
```

### Runtime Configuration

```javascript
// config/loader.js
ads: {
  sraBatching: {
    enabled: true   // Enable/disable at runtime
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable SRA batching for above-fold slots |

### URL Parameter Overrides

For testing without changing config:

| Parameter | Effect |
|-----------|--------|
| `?adSraOn` | Force SRA batching ON (overrides config) |
| `?adSraOff` | Force SRA batching OFF (overrides config) |

Priority: URL params > runtime config > build-time flag

## Usage Example

### Basic Setup

```javascript
// config/loader.js
export default {
  ads: {
    sraBatching: {
      enabled: true
    }
  },
  optionalModules: {
    sraBatching: true
  }
}
```

### Testing with URL Params

```
// Normal page load with SRA batching
https://example.com/article?adDebugLogs

// Force OFF for comparison
https://example.com/article?adDebugLogs&adSraOff

// Force ON when config has it disabled
https://example.com/article?adDebugLogs&adSraOn
```

### Debug Output

With `?adDebugLogs`, you'll see:

```
[Slots] enableServices: SRA batching mode - enableSingleRequest + disableInitialLoad
[Slots] processSlots: advert_site_hdr_1 (lazy config, but in viewport - batching)
[Slots] processSlots: advert_site_ftr_1 (lazy config, but in viewport - batching)
[Slots] processSlots: SRA batch mode - 5 immediate slots
[Slots] requestAd: advert_site_mpu_1 running auction first
[Slots] requestAd: advert_site_bin_1 running auction first
[Slots] processSlots: SRA batch refresh - 5 slots [...]
[Slots] processSlots: advert_site_dyn_1 queued for lazy load
```

### Verifying Network Reduction

1. Open DevTools Network tab
2. Filter by `gampad` or `securepubads`
3. Compare request count with `?adSraOff` vs `?adSraOn`
4. Batched slots appear in fewer requests with multiple `iu_parts` parameters
