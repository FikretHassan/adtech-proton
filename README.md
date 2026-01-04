# Proton

[![Build](https://github.com/FikretHassan/adtech-proton/actions/workflows/build.yml/badge.svg)](https://github.com/FikretHassan/adtech-proton/actions/workflows/build.yml)
[![CI](https://github.com/FikretHassan/adtech-proton/actions/workflows/ci.yml/badge.svg)](https://github.com/FikretHassan/adtech-proton/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

A configurable commercial ad tech orchestration framework for publishers. Work in Progress.

## Features

- **Multi-Property Support** - Property-keyed configs for different sites/brands
- **Wrapper Auctions** - Generic adapter pattern for header bidding (Prebid, Amazon APS, etc.)
- **Plugin Management** - Conditional script loading with consent, targeting, and A/B testing
- **Partner Orchestration** - Blocking/Independent/NonCore partners with timeout management and parallel loading
- **GPT Slot Management** - Slot discovery, lazy loading, responsive sizemapping
- **Ad Targeting** - Page and slot-level KVPs from configurable sources
- **Dynamic Injection** - Character and block-counting ad placement in article content
- **Ad Refresh** - Timer-based refresh with visibility detection
- **Lifecycle Hooks** - Inject custom code at key points in the ad lifecycle
- **Metrics Collection** - Unified performance tracking

> **Note:** Browser-only. Requires `window` and `document`. Not SSR-safe.

---

## Installation

```bash
npm install
npm run build
```

| Command | Output | Description |
|---------|--------|-------------|
| `npm run build` | `dist/proton.min.js` | Production bundle |
| `npm run build:dev` | `dist/proton.js` | Development with sourcemaps |
| `npm run build:pubsub` | `dist/pubsub.min.js` | Standalone PubSub |
| `npm run proton:tms` | `dist/proton-tms.min.js` | Tag Manager build (no ads) |

### Optional Modules

Reduce bundle size by disabling features in `config/loader.js`:

```javascript
optionalModules: {
  sequencing: true,      // Ad sequencing
  injection: {           // Dynamic article ad injection
    enabled: true,       // Master switch
    charMode: true,      // Character-based counting
    blockMode: true      // Block-based counting
  },
  customSlots: true,     // Dimension-targeted slot injection
  experiences: true,     // Experience loader
  refresh: true,         // Ad refresh timer
  experiments: true,     // A/B testing
  wrappers: true,        // Header bidding wrapper auctions
  customFunctions: true, // Custom utility functions (exposed on loader)
  sraBatching: true      // Build-time flag for SRA batching helpers
}
```

Runtime SRA batching lives under `ads.sraBatching.enabled` (see `config/loader.js`). The `optionalModules.sraBatching` flag removes the batching helpers from the bundle entirely.

### Proton Tag Manager (TMS)

Lightweight build for loading third-party scripts without ad functionality. Use when you need partner orchestration and plugin loading but not GAM/advertising features.

**Build:**
```bash
npm run proton:tms        # Production
npm run proton:tms:dev    # Development
```

**Config:** Uses `config-tms/` folder (separate from main config):
```
config-tms/
├── partners.json         # Orchestration config
└── partners/
    ├── index.js          # Partner exports
    └── mypartner.js      # Partner definitions
```

**Included:** PubSub, Orchestrator, Plugin Loader, Hooks, Consent

**Excluded:** GPT, Slots, Targeting, Refresh, Injection, Wrappers, Experiments

---

## Quick Start

### 1. Configure your property

Edit `config/properties.json` with your GAM network:

```json
{
  "common": {
    "selector": ".js-advert"
  },
  "properties": {
    "default": {
      "prefix": "site",
      "networkId": "12345678",
      "adUnitPath": "/12345678/{site}/{zone}"
    }
  }
}
```

### 2. Build

```bash
npm install
npm run build
```

### 3. Add scripts to page

```html
<script src="pubsub.min.js"></script>
<script src="proton.min.js"></script>
```

### 4. Add slot containers

```html
<div class="js-advert" id="advert_site_mpu_1" data-ad-type="mpu"></div>
<div class="js-advert" id="advert_site_ban_1" data-ad-type="ban"></div>
```

Slots are discovered from the DOM using the `selector` class. Container IDs follow the pattern: `advert_{prefix}_{adType}_{index}`

### 5. Trigger CMP ready

```javascript
window.PubSub.publish({ topic: 'cmp.ready' });
```

Proton initializes immediately, waits for `cmp.ready` before loading partners, then requests ads when partners are ready. The command queue is processed on DOM ready.

### What's Next?

| Want to... | Read |
|------------|------|
| Add header bidding (Prebid, APS) | [wrapperAuctions.md](docs/wrapperAuctions.md) |
| Load third-party scripts | [partnerOrchestration.md](docs/partnerOrchestration.md) |
| Add targeting key-values | [adTargeting.md](docs/adTargeting.md) |
| Inject ads into articles | [dynamicInjection.md](docs/dynamicInjection.md) |
| Configure multiple sites | [multiProperty.md](docs/multiProperty.md) |
| Add lifecycle hooks | [hooks.md](docs/hooks.md) |
| Enable ad refresh | [adRefresh.md](docs/adRefresh.md) |
| Load scripts without ads | [README.md](#proton-tag-manager-tms) (TMS section above) |

---

## Project Structure

```
proton/
|-- config/                  # Configuration (JSON + JS)
|   |-- loader.js            # Global settings
|   |-- properties.json      # Property domains, slot config
|   |-- partners/            # Partner definitions (one per partner)
|   |-- partners.json        # Partner orchestration
|   |-- targeting.json       # GPT targeting sources
|   |-- sizemapping.json     # Responsive breakpoints
|   |-- dimensions.json      # Targeting dimension sources
|   |-- hooks.js             # Lifecycle hooks
|   +-- ...                  # See docs/configuration.md
|
|-- src/                     # TypeScript source
|   |-- index.ts             # Proton class
|   |-- entry.ts             # Auto-init entry point
|   |-- slots.ts             # GPT slot management
|   +-- optional/            # Tree-shaken modules
|
|-- docs/                    # Documentation
+-- dist/                    # Build output
```

See [docs/configuration.md](docs/configuration.md) for complete file reference.

### Config Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              loader.js                                      │
│                     (global settings, optional modules)                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          ▼                          ▼                          ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  properties.json │      │   consent.js     │      │   hooks.js       │
│  ─────────────── │      │  ─────────────── │      │  ─────────────── │
│  • domains       │      │  • getState()    │      │  • lifecycle     │
│  • networkId     │      │    returns       │      │    injection     │
│  • adUnitPath    │      │    consent       │      │    points        │
│  • slot config   │      │    state         │      │                  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
          │
          │ property detected by domain
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           dimensions.json                                   │
│              (defines targeting criteria: pagetype, viewport, geo, etc.)    │
│                    Powers include/exclude rules everywhere                  │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          │ dimensions used by
          ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  partners.json   │      │  targeting.json  │      │ sizemapping.json │
│  ─────────────── │      │  ─────────────── │      │  ─────────────── │
│  • blocking      │      │  • pageLevel     │      │  • breakpoints   │
│  • independent   │◄────►│  • slotLevel     │◄────►│  • adTypes       │
│  • nonCore       │      │  • sources       │      │  • sizes         │
│  • timeouts      │      │                  │      │                  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
          │
          │ references
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         config/partners/*.js                                │
│                    (individual partner configurations)                      │
│          Each partner has: url, include/exclude rules, callbacks            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Data flow:**
1. `loader.js` → Global settings, which optional modules to include
2. `properties.json` → Domain detection determines active property
3. `dimensions.json` → Resolves context values (pagetype, viewport, geo)
4. `partners.json` + `partners/*.js` → Which partners load, in what order, with what timeouts
5. `targeting.json` → What key-values to send to GAM
6. `sizemapping.json` → What ad sizes for each viewport breakpoint

---

## Core Concepts

### Dimensions

Dimensions are targeting criteria defined in `dimensions.json`. They power `include`/`exclude` rules across partners, experiences, custom slots, refresh, and injection.

```json
{
  "pagetype": { "source": "meta", "key": "ads.pagetype" },
  "viewport": { "source": "internal", "fn": "sizemapping.getBreakpoint" },
  "geo": { "source": "meta", "key": "ads.geo" }
}
```

Use in any targeting config:
```javascript
{ include: { pagetype: ['story'], viewport: ['x', 'l'] } }
```

### Partner Orchestration

**All partners load immediately in parallel.** Partners are categorized by their relationship to GAM:

| Category | Description |
|----------|-------------|
| **Blocking** | Must complete (or timeout) before GAM, supports `dependsOn` for ordered dependencies |
| **Independent** | Must complete (or timeout) before GAM, no dependencies or ordering |
| **NonCore** | Never blocks GAM, loads independently |

See [docs/partnerOrchestration.md](docs/partnerOrchestration.md).

### Wrapper Auctions

Generic adapter pattern for header bidding. Implement `WrapperAdapter` interface to add any bidding solution:

```typescript
interface WrapperAdapter {
  readonly name: string;
  isLibraryLoaded(): boolean;
  init(context: WrapperContext): void | Promise<void>;
  hasSlotConfig(slotId: string, context: AuctionContext): boolean;
  getAdUnit(slotId: string, context: AuctionContext): AdUnitConfig | null;
  requestBids(slotId: string, context: AuctionContext, timeout: number): Promise<AuctionResult>;
  applyTargeting(slotId: string, gptSlot?: unknown): void;
}
```

See [docs/wrapperAuctions.md](docs/wrapperAuctions.md).

### Lifecycle Hooks

Inject custom code at any lifecycle point:

```javascript
// config/hooks.js
export default {
  'slot.afterRender': [{
    name: 'trackImpression',
    fn: (slotId, event, info) => analytics.track('ad_impression', { slot: slotId })
  }]
};
```

Available hooks: `loader.beforeInit`, `loader.afterInit`, `loader.ready`, `partners.afterReady`, `partners.allReady`, `partners.nonCoreReady`, `partners.onTimeout`, `slot.beforeDefine`, `slot.afterDefine`, `ads.beforeRequest`, `slot.beforeRequest`, `slot.afterRequest`, `ads.afterRequest`, `slot.beforeRender`, `slot.afterRender`, `slot.onEmpty`, `slot.beforeRefresh`, `slot.afterRefresh`, `injection.beforeInject`, `injection.afterInject`

See [docs/hooks.md](docs/hooks.md).

---

## Runtime API

Access via `window.proton` (or configured `globalName`):

```javascript
// Slot data registry
proton.ads

// Manual ad request (SPA navigation)
proton.requestAds()

// Command queue
window.proton = window.proton || { cmd: [] };
window.proton.cmd.push(() => console.log('Loader ready!'));

// Module access
proton.slots.refreshSlot('advert_site_mpu_1')
proton.adTargeting.setPageTargeting('key', 'value')
proton.orchestrator.getState()

// Slot lifecycle (SPA)
proton.functions.recreate('all')
proton.functions.destroySlots('advert_site_mpu_1')

// Dimensions
proton.getDimension()              // All values
proton.getDimension('pagetype')    // Specific value

// Metrics
proton.metrics.ads                 // Per-slot GAM data
proton.metrics.vendors             // Partner load times

// Debug
proton.logs                        // Log array
proton.logSearch('keyword')        // Filter logs
```

---

## URL Parameters

### Debug & Testing

| Parameter | Effect |
|-----------|--------|
| `?adsDebugLog` | Enable console logging (configurable via `loader.js debugParam`) |
| `?hooksDebug` | Enable hooks debug mode |
| `?adtest=value` | Set ad test value for targeting |
| `?adteston` | Force test ad units |
| `?adsShowProductionAds` | Show production ads in dev environment |

### Ads Control

| Parameter | Effect |
|-----------|--------|
| `?adsDisableStack` | Disable all ads |
| `?adSraOn` | Force SRA batching on |
| `?adSraOff` | Force SRA batching off |

### Property & Plugins

| Parameter | Effect |
|-----------|--------|
| `?propertyOverride=name` | Override detected property |
| `?adEnablePlugin=name` | Force enable a plugin |
| `?adDisablePlugin=name` | Force disable a plugin |

### Dynamic Injection

**Character mode:**

| Parameter | Effect |
|-----------|--------|
| `?firstAd=X` | Override first ad character threshold |
| `?otherAd=X` | Override other ad character threshold |
| `?maxAds=X` | Override max ads |
| `?minParaChars=X` | Override min paragraph chars |

**Block mode:**

| Parameter | Effect |
|-----------|--------|
| `?firstAdBlock=X` | Override first ad block threshold |
| `?otherAdBlock=X` | Override other ad block threshold |
| `?maxAds=X` | Override max ads |
| `?minBlockChars=X` | Override min block chars |
| `?countMode=blocks` | Force block counting mode |

### Ad Sequencing

| Parameter | Effect |
|-----------|--------|
| `?adsequenceon` | Force enable ad sequencing |
| `?adsequenceoff` | Force disable ad sequencing |

### Custom Slots & Experiences

| Parameter | Effect |
|-----------|--------|
| `?customSlotEnable=name,name` | Force enable custom slots by name |
| `?customSlotDisable=name,name` | Force disable custom slots by name |
| `?experienceEnable=name,name` | Force enable experiences by name |
| `?experienceDisable=name,name` | Force disable experiences by name |

---

## Documentation

| Document | Description |
|----------|-------------|
| [configuration.md](docs/configuration.md) | All config file options |
| [slots.md](docs/slots.md) | Slot management |
| [sizemapping.md](docs/sizemapping.md) | Responsive sizemapping |
| [adTargeting.md](docs/adTargeting.md) | Targeting sources |
| [adRefresh.md](docs/adRefresh.md) | Refresh system |
| [adSequencing.md](docs/adSequencing.md) | Priority loading |
| [dynamicInjection.md](docs/dynamicInjection.md) | Article ad injection |
| [customSlots.md](docs/customSlots.md) | Custom slot injection |
| [customFunctions.md](docs/customFunctions.md) | Custom utility functions |
| [gptEvents.md](docs/gptEvents.md) | GPT event tracking |
| [hooks.md](docs/hooks.md) | Lifecycle hooks |
| [metrics.md](docs/metrics.md) | Unified metrics |
| [pubsub.md](docs/pubsub.md) | PubSub event system |
| [wrapperAuctions.md](docs/wrapperAuctions.md) | Header bidding orchestration |
| [partnerOrchestration.md](docs/partnerOrchestration.md) | Partner management |
| [pluginLoader.md](docs/pluginLoader.md) | Plugin loading system |
| [experienceLoader.md](docs/experienceLoader.md) | Dimension-targeted code |
| [experiments.md](docs/experiments.md) | A/B testing |
| [multiProperty.md](docs/multiProperty.md) | Multi-property support |
| [spa.md](docs/spa.md) | SPA integration |
| [sraBatching.md](docs/sraBatching.md) | SRA batching optimization |
| [environment.md](docs/environment.md) | Environment utilities |
| [functions.md](docs/functions.md) | Slot lifecycle utilities |

---

## Development

```bash
npm run build        # Production bundle
npm run build:dev    # Development with sourcemaps
npm run typecheck    # TypeScript checking
npm test             # Run tests
npm run lint         # Lint check
```

---

## Credits

**Author:** Fikret Hassan

**Credit:** Sean Dillon. Everything impressive and functional in this codebase is thanks to Sean and his teachings. Anything broken is because I wasn't listening hard enough!

**Contributors:** Joshua Sadler, George Caldwell-Pearce

---

## License

MIT
