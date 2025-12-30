# Sizemapping Module

## Description

Provides responsive ad sizes based on viewport breakpoints. Maps ad types to size arrays per breakpoint, supports slot-specific overrides, and builds GPT-compatible size mappings.

**Breakpoint names are user-defined.** You can use any names (e.g., 'desktop', 'tablet', 'mobile') and define any number of breakpoints. Keys must match across `sizemapping.json`, `lazyload.json`, `refresh.json`, and `wrappers.json`.

## Functionality / Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `getBreakpoint()` | none | `string` | Returns current breakpoint key based on viewport width |
| `getViewport()` | none | `{width, height}` | Returns current viewport dimensions |
| `getSizes(adType, breakpoint?)` | adType: string, breakpoint?: string | `Array` | Returns size array for ad type at breakpoint |
| `getSizesForSlot(slotId, breakpoint?)` | slotId: string, breakpoint?: string | `Array` | Returns sizes with slot override support |
| `extractAdType(slotId)` | slotId: string | `string` | Extracts ad type from slot ID (e.g., `advert_mysite_ban_1` -> `ban`) |
| `buildGPTSizeMapping(adType)` | adType: string | `Array` | Builds GPT-compatible size mapping array |
| `buildGPTSizeMappingForSlot(slotId)` | slotId: string | `Array` | Builds size mapping with slot override support |
| `getBreakpoints()` | none | `Object` | Returns all breakpoint definitions |
| `getAdTypes()` | none | `Array` | Returns list of configured ad type names |
| `getConfig()` | none | `Object` | Returns full sizemapping config |

## Usage

Configure in `config/sizemapping.json`:

```json
{
  "breakpoints": {
    "x":  { "minWidth": 1200, "minHeight": 900 },
    "l":  { "minWidth": 1024, "minHeight": 768 },
    "m":  { "minWidth": 768, "minHeight": 480 },
    "s":  { "minWidth": 480, "minHeight": 320 },
    "xs": { "minWidth": 0, "minHeight": 0 }
  },
  "adTypes": {
    "ban": {
      "x":  [[970,250], [940,250], [1,1], "fluid"],
      "l":  [[970,250], [940,250], [1,1], "fluid"],
      "m":  [[728,90], [1,1], "fluid"],
      "s":  [[300,250], [320,50], [1,1], "fluid"],
      "xs": [[300,250], [320,50], [1,1], "fluid"]
    },
    "mpu": {
      "x":  [[300,600], [300,250], [1,1], "fluid"],
      "...": "..."
    }
  },
  "slotOverrides": {
    "advert_mysite_nat_story_1": {
      "x": [[970,250], [1,1], "fluid"],
      "...": "..."
    }
  }
}
```

## Usage Example

```javascript
// Get current breakpoint
const bp = proton.sizemapping.getBreakpoint(); // 'x'

// Get sizes for an ad type
const bannerSizes = proton.sizemapping.getSizes('ban');
// [[970,250], [940,250], [1,1], "fluid"]

// Get sizes for a specific slot (checks overrides first)
const slotSizes = proton.sizemapping.getSizesForSlot('advert_mysite_ban_1');

// Build GPT size mapping for defineSlot
const mapping = proton.sizemapping.buildGPTSizeMappingForSlot('advert_mysite_mpu_1');
// [{ viewport: [1200, 900], sizes: [[300,600], [300,250]] }, ...]

// Extract ad type from slot ID
const adType = proton.sizemapping.extractAdType('advert_mysite_ban_1'); // 'ban'
```

### Custom Breakpoint Names

You can use any breakpoint names and define any number of breakpoints:

```json
{
  "breakpoints": {
    "desktop": { "minWidth": 1024, "minHeight": 768 },
    "tablet":  { "minWidth": 768, "minHeight": 480 },
    "mobile":  { "minWidth": 0, "minHeight": 0 }
  },
  "adTypes": {
    "ban": {
      "desktop": [[970,250], [728,90]],
      "tablet":  [[728,90]],
      "mobile":  [[320,50], [300,50]]
    }
  }
}
```

Or even just 2 breakpoints:

```json
{
  "breakpoints": {
    "desktop": { "minWidth": 768, "minHeight": 0 },
    "mobile":  { "minWidth": 0, "minHeight": 0 }
  }
}
```
