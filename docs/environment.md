# Environment Detection

## Description

Detects production/development/staging environment from hostname and URL parameters. Controls ad serving mode and provides URL parameter overrides for testing.

## Functionality

### Environment Types

| Type | Description |
|------|-------------|
| `production` | Production ads served |
| `development` | Test/placeholder ads |
| `blocked` | No ads served |

### Detection Logic

1. Check if hostname matches `blockedDomains` → blocked
2. Check if property has `production: true` → production
3. Otherwise → development
4. URL param `?adsShowProductionAds` overrides to production

### API

```javascript
// Environment state
proton.environment.getState()
// { productionAds, debugMode, environment, property, hostname, initialized }

// Environment checks
proton.environment.isProduction()   // true if production ads
proton.environment.isBlocked()      // true if ads blocked
proton.environment.isDebug()        // true if debug mode
proton.environment.getEnvironment() // 'production' | 'development' | 'blocked'

// URL parameter checks
proton.environment.isAdsDisabled()        // adsDisableStack or adkill
proton.environment.useTestAdUnits()       // adteston flag

// Get all URL params
proton.environment.getUrlParams()

// Get specific param
proton.environment.getParam('adtest')
```

### URL Parameters

| Parameter | Type | Effect |
|-----------|------|--------|
| `adsDebugLog` | flag | Enable debug logging (configurable via `loader.js debugParam`) |
| `adsDisableStack` | flag | Disable all ad loading |
| `adsShowProductionAds` | flag | Force production ads |
| `adtest` | value | Set adtest targeting key |
| `adteston` | flag | Use test ad units |
| `adkill` | flag | Kill all ads |
| `adgptoff` | flag | Disable GPT |

## Usage

### Configuration

```json
// config/properties.json
{
  "properties": {
    "dev": {
      "domains": ["localhost"],
      "production": false
    },
    "live": {
      "domains": ["*.example.com"],
      "production": true
    }
  },
  "blockedDomains": ["blocked.example.com"],
  "defaults": {
    "productionAds": false,
    "debugMode": false
  }
}
```

## Usage Example

### Checking Environment in Partners

```javascript
// config/partners/mypartner.js
export default {
  name: 'mypartner',
  preloadFn: () => {
    const env = proton.environment;

    if (env.isBlocked()) {
      return; // Don't load on blocked domains
    }

    window.mypartner = {
      mode: env.isProduction() ? 'live' : 'test'
    };
  }
};
```

### Conditional Ad Units

```javascript
// Use test ad units when ?adteston is set
const adUnitPath = proton.environment.useTestAdUnits()
  ? '/12345/test/article'
  : '/12345/live/article';
```

### Testing with URL Params

```
# Enable debug logging
https://example.com/?adsDebugLog

# Force production ads on localhost
http://localhost:3000/?adsShowProductionAds

# Disable all ads
https://example.com/?adkill

# Set adtest targeting
https://example.com/?adtest=mytest
```

### PubSub Events

| Event | When |
|-------|------|
| `loader.environment.ready` | Environment initialized |

### Debug Mode

Debug mode is enabled via the `debugParam` configured in `loader.js` (default: `adsDebugLog`).

```javascript
if (proton.environment.isDebug()) {
  console.log('Debug mode active');
}
```
