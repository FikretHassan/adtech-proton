# Ad Targeting Module

## Description

Builds page-level and slot-level GPT targeting from configurable sources. Supports property-keyed configuration for multi-site deployments, flexible value resolution from meta tags, cookies, window paths, URL params, internal functions, and static values. Includes automatic KVP normalization for GPT compatibility.

## Functionality / Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `registerInternal(name, fn)` | name: string, fn: Function | void | Registers an internal function for targeting resolution |
| `buildPageTargeting(overrides?)` | overrides?: Object | `Object` | Builds normalized page-level targeting key-values |
| `buildSlotTargeting(slotContext, overrides?)` | slotContext: {id, adType, count}, overrides?: Object | `Object` | Builds normalized slot-level targeting key-values |
| `buildTargeting(slotContext?, overrides?)` | slotContext?: Object, overrides?: Object | `Object` | Builds combined page + slot targeting |
| `getConfig()` | none | `Object` | Returns resolved targeting configuration for current property |
| `setPageTargeting(key, value)` | key: string, value: any | void | Sets a dynamic page-level targeting value |
| `setPageTargetingBulk(targeting)` | targeting: Object | void | Sets multiple dynamic targeting values |
| `getDynamicPageTargeting()` | none | `Object` | Returns all dynamic page targeting |
| `clearDynamicPageTargeting()` | none | void | Clears all dynamic page targeting |
| `removeDynamicTargeting(key)` | key: string | void | Removes a specific dynamic targeting key |

### Utils Namespace

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `utils.normalizeValue(value)` | value: any | `string\|null` | Normalizes a single value (truncate, trim) |
| `utils.normalizeArray(arr)` | arr: Array | `Array` | Normalizes array values, filters nulls |
| `utils.normalizeKey(key)` | key: string | `string\|null` | Validates and normalizes targeting key |
| `utils.normalizeTargeting(targeting)` | targeting: Object | `Object` | Normalizes entire targeting object |

## Usage

Configure in `config/targeting.json` with `common` + `properties` structure:

```json
{
  "normalization": {
    "enabled": true,
    "maxKeyLength": 20,
    "maxValueLength": 40,
    "sanitize": false,
    "trimWhitespace": true
  },

  "common": {
    "pageLevel": {
      "vp": { "source": "internal", "fn": "getBreakpoint" },
      "lang": { "source": "window", "path": "navigator.language", "transform": "lowercase" },
      "testgroup": { "source": "internal", "fn": "getTestgroup" }
    },
    "slotLevel": {
      "div": { "source": "slot", "property": "id" },
      "at": { "source": "slot", "property": "adType" },
      "pos": { "source": "slot", "property": "count" }
    }
  },

  "properties": {
    "dev": {
      "pageLevel": {
        "devtest": { "source": "static", "value": "true" }
      }
    },
    "mysite": {
      "pageLevel": {
        "sc": { "source": "meta", "key": "ads.zone" },
        "userstate": { "source": "window", "path": "site.user.loginStatus", "default": "anon" }
      }
    },
    "propertyB": {
      "pageLevel": {
        "sc": { "source": "meta", "key": "pb.section" },
        "userstate": { "source": "internal", "fn": "getPropertyBUserState" }
      }
    }
  }
}
```

### Config Resolution

At runtime, targeting config is merged: `common` + `properties[currentProperty]`

- Property-specific keys override common keys with the same name
- Different properties can use the same targeting key name with different data sources
- Properties without specific config only get common targeting

### Property Filtering

Common keys can be restricted to specific properties using the `properties` array:

```json
{
  "common": {
    "pageLevel": {
      "vp": { "source": "internal", "fn": "getBreakpoint" },
      "userstate": {
        "source": "window",
        "path": "site.user.loginStatus",
        "properties": ["siteA", "siteB", "dev"]
      }
    }
  }
}
```

| Behavior | Description |
|----------|-------------|
| No `properties` array | Key applies to all properties |
| `properties: ["siteA", "siteB"]` | Key only applies to those properties |
| `properties: ["all"]` | Key applies to all properties (explicit) |

This avoids duplicating keys across property sections when most properties share the same config but some don't need certain keys.

### Normalization Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable normalization |
| `maxKeyLength` | number | `20` | Max characters for targeting keys |
| `maxValueLength` | number | `40` | Max characters for targeting values |
| `sanitize` | boolean | `false` | Remove non-alphanumeric chars (except `_-.:`) |
| `trimWhitespace` | boolean | `true` | Trim leading/trailing whitespace |

### Source Types

| Source | Properties | Description |
|--------|------------|-------------|
| `meta` | `key` | Reads from `<meta name="key">` or `<meta property="key">` |
| `cookie` | `key` | Reads cookie value by name |
| `window` | `path` | Reads nested window path (e.g., `navigator.language`) |
| `url` | `key` | Reads URL query parameter |
| `internal` | `fn` | Calls registered internal function |
| `static` | `value` | Returns static value |
| `slot` | `property` | Reads from slot context object |

### Fallback Chains

Use `sources` array to try multiple sources in order. First truthy value wins:

```json
{
  "geo": {
    "sources": [
      { "source": "window", "path": "user.country" },
      { "source": "cookie", "key": "geo_country" },
      { "source": "meta", "key": "geo" },
      { "source": "static", "value": "unknown" }
    ]
  }
}
```

### Value Modifiers

All source types support these optional modifiers:

| Modifier | Type | Description |
|----------|------|-------------|
| `sources` | array | Fallback chain of sources (first truthy value wins) |
| `mapping` | object | Map source values to different output values |
| `default` | string | Fallback value if source returns null/empty |
| `type` | string | Set to `"array"` to split string into array |
| `delimiter` | string | Delimiter for array splitting (default: `,`) |
| `transform` | string | Transform value (`lowercase`, `uppercase`, `trim`, `removeTrailingColon`) |

**Mapping Example:**
```json
{
  "userstate": {
    "source": "window",
    "path": "user.loginStatus",
    "mapping": {
      "anonymous": "anon",
      "registered": "reg",
      "subscriber": "sub"
    },
    "default": "anon"
  }
}
```

**Array Type Example:**
```json
{
  "keywords": {
    "source": "meta",
    "key": "article:tag",
    "type": "array",
    "delimiter": ","
  }
}
```

### Transforms

| Transform | Description |
|-----------|-------------|
| `lowercase` | Converts string to lowercase |
| `uppercase` | Converts string to uppercase |
| `removeTrailingColon` | Removes trailing `:` from string |
| `toString` | Converts value to string |

## Usage Example

```javascript
// Build page-level targeting only
const pageTargeting = proton.adTargeting.buildPageTargeting();
// { vp: 'x', lang: 'en-gb', rd: 'localhost', biw: 1920, bih: 1080, testgroup: '0' }

// Build slot-level targeting
const slotTargeting = proton.adTargeting.buildSlotTargeting({
  id: 'advert_mysite_ban_1',
  adType: 'ban',
  count: '0'
});
// { div: 'advert_mysite_ban_1', at: 'ban', pos: '0' }

// Build combined targeting (used by slots.defineGPTSlot)
const combined = proton.adTargeting.buildTargeting(
  { id: 'advert_mysite_ban_1', adType: 'ban', count: '0' },
  { custom: 'override' }
);
// { vp: 'x', lang: 'en-gb', div: 'advert_mysite_ban_1', at: 'ban', pos: '0', custom: 'override' }

// Set dynamic targeting at runtime
proton.adTargeting.setPageTargeting('article_id', '12345');
proton.adTargeting.setPageTargetingBulk({ author: 'smith', category: 'news' });

// Register custom internal function
proton.adTargeting.registerInternal('getCustomValue', () => {
  return someExternalLibrary.getValue();
});

// Get resolved config for current property
const config = proton.adTargeting.getConfig();
console.log('Targeting keys:', Object.keys(config.pageLevel));
```
