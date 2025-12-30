# Multi-Property Support

## Description

Enables a single Proton build to serve multiple websites/brands with property-specific configurations. Properties are detected from hostname and used to select appropriate configs for targeting, slots, sizemapping, and partners.

## Functionality

### Property Detection

Properties are detected by matching `window.location.hostname` against domain patterns in `config/properties.json`. Matching uses two passes:

1. **First pass:** Exact domain matches (takes priority)
2. **Second pass:** Wildcard matches
3. **Fallback:** `default` property if no match

| Feature | Description |
|---------|-------------|
| Exact match | `staging.example.com` matches only `staging.example.com` |
| Wildcard match | `*.example.com` matches any subdomain |
| Match priority | Exact matches always win over wildcards |
| Fallback | Unmatched hostnames fall back to `default` property |
| URL override | `?propertyOverride=name` forces a specific property |

This allows you to have a wildcard for production (`*.example.com`) while explicitly routing specific subdomains (`staging.example.com`) to a different property.

### API

```javascript
// Get current property ID
proton.environment.getProperty()  // 'mysite', 'propertyB', 'dev'

// Check if production
proton.environment.isProduction()  // true/false

// Get environment type
proton.environment.getEnvironment()  // 'production', 'development', 'blocked'

// Get full environment state
proton.environment.getState()  // { initialized, productionAds, debugMode, environment, property, hostname }

// Also available via config
proton.config.property  // 'mysite' (current property ID)
```

### Property-Keyed Configs

These config files support property-specific overrides:

| Config | Property Key |
|--------|--------------|
| `properties.json` | `properties.{propertyId}.*` (slots, adUnitMappings) |
| `targeting.json` | `properties.{propertyId}.pageLevel/slotLevel` |
| `sizemapping.json` | `properties.{propertyId}.adTypes` |

Config merging: `common` + `properties[currentProperty]` at runtime.

## Usage

### Properties Configuration

```json
// config/properties.json
{
  "properties": {
    "siteA": {
      "domains": ["*.sitea.com"],
      "description": "Site A - Production",
      "production": true
    },
    "siteB": {
      "domains": ["*.siteb.co.uk"],
      "description": "Site B - Production",
      "production": true
    },
    "dev": {
      "domains": ["localhost", "127.0.0.1", "staging.sitea.com", "staging.siteb.co.uk"],
      "description": "Development/staging environments",
      "production": false
    },
    "default": {
      "description": "Fallback for unmatched domains",
      "production": false
    }
  },
  "blockedDomains": [],
  "defaults": {
    "productionAds": false,
    "debugMode": false
  }
}
```

In this example:
- `www.sitea.com` → matches `siteA` (wildcard)
- `staging.sitea.com` → matches `dev` (exact match wins over wildcard)
- `localhost` → matches `dev` (exact match)
- `unknown.com` → matches `default` (fallback)

### Property-Specific Targeting

```json
// config/targeting.json
{
  "common": {
    "pageLevel": {
      "vp": { "source": "internal", "fn": "getBreakpoint" },
      "env": { "source": "static", "value": "proton" }
    }
  },
  "properties": {
    "siteA": {
      "pageLevel": {
        "sc": { "source": "meta", "key": "sitea.section" },
        "userstate": { "source": "window", "path": "siteA.user.state" }
      }
    },
    "siteB": {
      "pageLevel": {
        "sc": { "source": "meta", "key": "siteb.zone" },
        "userstate": { "source": "cookie", "key": "sb_user" }
      }
    }
  }
}
```

### Property-Specific Slots (in properties.json)

Slot configuration is part of `properties.json`:

```json
// config/properties.json
{
  "common": {
    "selector": ".js-advert",
    "observedClass": "js-advert-observed"
  },
  "properties": {
    "siteA": {
      "domains": ["*.sitea.com"],
      "prefix": "sitea",
      "networkId": "12345",
      "adUnitPath": "/12345/{site}.{zone}/{zone}",
      "adUnitMappings": {
        "site": { "static": "sitea" },
        "zone": "section"
      }
    },
    "siteB": {
      "domains": ["*.siteb.co.uk"],
      "prefix": "siteb",
      "networkId": "67890",
      "adUnitPath": "/67890/{site}.{zone}/{zone}",
      "adUnitMappings": {
        "site": { "static": "siteb" },
        "zone": "section"
      }
    }
  }
}
```

## Usage Example

### Testing Different Properties

```
# Force siteA property on localhost
http://localhost:3000/?propertyOverride=siteA

# Force siteB property
http://localhost:3000/?propertyOverride=siteB
```

### Conditional Logic by Property

```javascript
// In a hook or partner
const property = proton.environment.getProperty();

if (property === 'siteA') {
  // Site A specific logic
  googletag.pubads().setTargeting('site', 'sitea');
} else if (property === 'siteB') {
  // Site B specific logic
  googletag.pubads().setTargeting('site', 'siteb');
}
```

### Partner with Property Targeting

```javascript
// config/partners/siteAonly.js
export default {
  name: 'siteAonly',
  url: 'https://cdn.sitea.com/partner.js',
  active: true,
  properties: ['siteA']  // Only load on siteA
};
```

### Checking Production Status

```javascript
// Different ad units for prod vs dev
const isProd = proton.environment.isProduction();
const adUnitPath = isProd
  ? '/12345/sitea/article'
  : '/12345/sitea/test';
```
