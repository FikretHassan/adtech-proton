/**
 * Build script
 * Generates dimension functions from config/dimensions.json
 * Generates about.js with build metadata
 * Validates config files
 * Then bundles with esbuild
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, basename, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);

// Import loader config for optional modules
import loaderConfig from '../config/loader.js';

// ============================================================================
// Config Validation
// ============================================================================

const warnings = [];
const errors = [];

function warn(msg) {
  warnings.push(msg);
  console.warn(`[!] WARNING: ${msg}`);
}

function error(msg) {
  errors.push(msg);
  console.error(`[X] ERROR: ${msg}`);
}

function loadJSON(path, required = true) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    if (required) {
      error(`Failed to load ${path}: ${e.message}`);
    }
    return null;
  }
}

/**
 * Validate properties.json structure
 */
function validateProperties(config) {
  if (!config) return;

  // Check common section
  if (!config.common) {
    warn('properties.json: Missing "common" section');
  } else {
    if (!config.common.selector) {
      warn('properties.json: Missing "common.selector" - ads won\'t be found in DOM');
    }
  }

  // Check properties section
  if (!config.properties) {
    warn('properties.json: Missing "properties" section');
  } else {
    const props = Object.keys(config.properties);
    if (props.length === 0) {
      warn('properties.json: No properties defined');
    }

    // Validate each property
    props.forEach(propName => {
      const prop = config.properties[propName];
      if (!prop.networkId) {
        warn(`properties.json: Property "${propName}" missing "networkId"`);
      }
      if (!prop.prefix) {
        warn(`properties.json: Property "${propName}" missing "prefix"`);
      }
      if (!prop.adUnitPath) {
        warn(`properties.json: Property "${propName}" missing "adUnitPath"`);
      }
    });

    // Check for default property
    if (!config.properties.default) {
      warn('properties.json: No "default" property defined - may cause issues if environment not matched');
    }
  }
}

/**
 * Validate partners.json structure
 */
function validatePartners(config) {
  if (!config) return;

  const categories = ['blocking', 'independent', 'nonCore'];

  categories.forEach(category => {
    if (!Array.isArray(config[category])) {
      warn(`partners.json: Missing or invalid "${category}" array`);
      return;
    }

    config[category].forEach((partner, index) => {
      if (!partner.name) {
        warn(`partners.json: ${category}[${index}] missing "name"`);
      }
      if (typeof partner.active !== 'boolean') {
        warn(`partners.json: ${category}[${index}] (${partner.name || 'unnamed'}) missing "active" boolean`);
      }
    });
  });

  // Check defaults
  if (!config.defaults) {
    warn('partners.json: Missing "defaults" section');
  } else {
    if (typeof config.defaults.universalTimeout !== 'number') {
      warn('partners.json: Missing "defaults.universalTimeout"');
    }
  }
}

/**
 * Validate sizemapping.json structure
 */
function validateSizemapping(config) {
  if (!config) return;

  // Check breakpoints
  if (!config.breakpoints) {
    warn('sizemapping.json: Missing "breakpoints" object');
    return;
  }

  const breakpointKeys = Object.keys(config.breakpoints);
  if (breakpointKeys.length === 0) {
    warn('sizemapping.json: No breakpoints defined');
    return;
  }

  // Validate each breakpoint has minWidth
  breakpointKeys.forEach(bp => {
    if (typeof config.breakpoints[bp].minWidth !== 'number') {
      warn(`sizemapping.json: Breakpoint "${bp}" missing "minWidth"`);
    }
  });

  // Check adTypes
  if (!config.adTypes) {
    warn('sizemapping.json: Missing "adTypes" object');
    return;
  }

  // Validate each adType has all breakpoints
  Object.entries(config.adTypes).forEach(([adType, sizes]) => {
    const missingBreakpoints = breakpointKeys.filter(bp => !sizes[bp]);
    if (missingBreakpoints.length > 0) {
      warn(`sizemapping.json: adType "${adType}" missing breakpoints: ${missingBreakpoints.join(', ')}`);
    }
  });
}

/**
 * Validate targeting.json references valid dimensions
 */
function validateTargeting(targetingConfig, dimensionsConfig) {
  if (!targetingConfig || !dimensionsConfig) return;

  const validDimensions = Object.keys(dimensionsConfig);

  // Check pageLevel targeting sources
  if (targetingConfig.pageLevel) {
    Object.entries(targetingConfig.pageLevel).forEach(([key, config]) => {
      if (config.source === 'dimension' && config.dimension) {
        if (!validDimensions.includes(config.dimension)) {
          warn(`targeting.json: pageLevel.${key} references unknown dimension "${config.dimension}"`);
        }
      }
    });
  }

  // Check slotLevel targeting sources
  if (targetingConfig.slotLevel) {
    Object.entries(targetingConfig.slotLevel).forEach(([key, config]) => {
      if (config.source === 'dimension' && config.dimension) {
        if (!validDimensions.includes(config.dimension)) {
          warn(`targeting.json: slotLevel.${key} references unknown dimension "${config.dimension}"`);
        }
      }
    });
  }
}

/**
 * Run all config validations
 */
function validateConfigs() {
  console.log('\nValidating configs...');

  const properties = loadJSON(`${ROOT}/config/properties.json`);
  const partners = loadJSON(`${ROOT}/config/partners.json`);
  const sizemapping = loadJSON(`${ROOT}/config/sizemapping.json`);
  const targeting = loadJSON(`${ROOT}/config/targeting.json`, false);
  const dimensions = loadJSON(`${ROOT}/config/dimensions.json`);

  validateProperties(properties);
  validatePartners(partners);
  validateSizemapping(sizemapping);
  validateTargeting(targeting, dimensions);

  if (warnings.length === 0 && errors.length === 0) {
    console.log('[OK] All configs valid\n');
  } else {
    console.log(`\nValidation complete: ${errors.length} errors, ${warnings.length} warnings\n`);
  }

  // Fail build on errors (not warnings)
  if (errors.length > 0) {
    console.error('Build failed due to config errors');
    process.exit(1);
  }
}

// Run validation
validateConfigs();

// ============================================================================
// Code Generation
// ============================================================================

// Read about config (site owner creates about.json, falls back to scaffold)
const aboutPath = existsSync(`${ROOT}/config/about.json`)
  ? `${ROOT}/config/about.json`
  : `${ROOT}/config/about.scaffold.json`;
const aboutConfig = JSON.parse(readFileSync(aboutPath, 'utf8'));

// Read dimensions config
const dimensionsPath = `${ROOT}/config/dimensions.json`;
const dimensions = JSON.parse(readFileSync(dimensionsPath, 'utf8'));

/**
 * Map of internal module names to their import paths
 */
const internalModules = {
  sizemapping: '../sizemapping.ts',
  adTargeting: '../adTargeting.ts'
};

/**
 * Generate import statements for internal modules
 */
function generateImports(modules) {
  if (modules.size === 0) return '';

  const imports = Array.from(modules)
    .map(mod => `import ${mod} from '${internalModules[mod]}';`)
    .join('\n');

  return imports + '\n\n';
}

/**
 * Generate getter function code for a dimension based on its source type
 */
function generateGetter(name, config) {
  // Support both 'key' and 'path' for flexibility
  const key = config.key || config.path;

  switch (config.source) {
    case 'meta':
      return `  ${name}: () => document.querySelector('meta[name="${key}"]')?.content || ''`;

    case 'window':
      // Handle nested paths like "dataLayer.pageType" or "myApp.user.country"
      let pathStr = key;
      // Strip leading "window." if present
      if (pathStr.startsWith('window.')) {
        pathStr = pathStr.slice(7);
      }
      const pathParts = pathStr.split('.');
      const safeAccess = pathParts.reduce((acc, part, i) => {
        if (i === 0) return `window.${part}`;
        return `${acc}?.${part}`;
      }, '');

      // If mapping is defined, apply it to the raw value
      if (config.mapping) {
        const mappingJson = JSON.stringify(config.mapping);
        const defaultVal = config.default ? JSON.stringify(config.default) : "''";
        return `  ${name}: () => { const raw = ${safeAccess}; const mapping = ${mappingJson}; return mapping[raw] || ${defaultVal}; }`;
      }

      // If just default is defined (no mapping), use it as fallback
      if (config.default !== undefined) {
        return `  ${name}: () => ${safeAccess} || ${JSON.stringify(config.default)}`;
      }

      return `  ${name}: () => ${safeAccess} || ''`;

    case 'cookie':
      return `  ${name}: () => document.cookie.split('; ').find(c => c.startsWith('${key}='))?.split('=')[1] || ''`;

    case 'localStorage':
      return `  ${name}: () => localStorage.getItem('${key}') || ''`;

    case 'sessionStorage':
      return `  ${name}: () => sessionStorage.getItem('${key}') || ''`;

    case 'queryParam':
      return `  ${name}: () => new URLSearchParams(window.location.search).get('${key}') || ''`;

    case 'dataAttribute':
      return `  ${name}: () => document.querySelector('${config.selector}')?.dataset['${key}'] || ''`;

    case 'internal':
      // Handle internal module function calls
      // Format: "moduleName.functionName" with optional args array
      const fnPath = config.fn;
      const args = config.args ? config.args.map(a => JSON.stringify(a)).join(', ') : '';
      return `  ${name}: () => ${fnPath}(${args}) || ''`;

    case 'static':
      // Return a static/hardcoded value
      const staticValue = config.value !== undefined ? JSON.stringify(config.value) : "''";
      return `  ${name}: () => ${staticValue}`;

    default:
      console.warn(`Unknown source type: ${config.source} for dimension: ${name}`);
      return `  ${name}: () => ''`;
  }
}

/**
 * Generate dimensionConfig for matchTypes
 */
function generateDimensionConfig(dimensions) {
  const entries = Object.entries(dimensions)
    .filter(([_, config]) => config.matchType && config.matchType !== 'exact')
    .map(([name, config]) => `  ${name}: { matchType: '${config.matchType}' }`);

  if (entries.length === 0) return '{}';
  return `{\n${entries.join(',\n')}\n}`;
}

/**
 * Generate inline getter code (without property name prefix) for use in switch cases
 */
function generateInlineGetter(config) {
  const key = config.key || config.path;

  switch (config.source) {
    case 'meta':
      return `document.querySelector('meta[name="${key}"]')?.content || ''`;

    case 'window':
      let pathStr = key;
      if (pathStr.startsWith('window.')) {
        pathStr = pathStr.slice(7);
      }
      const pathParts = pathStr.split('.');
      const safeAccess = pathParts.reduce((acc, part, i) => {
        if (i === 0) return `window.${part}`;
        return `${acc}?.${part}`;
      }, '');

      if (config.mapping) {
        const mappingJson = JSON.stringify(config.mapping);
        const defaultVal = config.default ? JSON.stringify(config.default) : "''";
        return `(() => { const raw = ${safeAccess}; const mapping = ${mappingJson}; return mapping[raw] || ${defaultVal}; })()`;
      }

      if (config.default !== undefined) {
        return `${safeAccess} || ${JSON.stringify(config.default)}`;
      }

      return `${safeAccess} || ''`;

    case 'cookie':
      return `document.cookie.split('; ').find(c => c.startsWith('${key}='))?.split('=')[1] || ''`;

    case 'localStorage':
      return `localStorage.getItem('${key}') || ''`;

    case 'sessionStorage':
      return `sessionStorage.getItem('${key}') || ''`;

    case 'queryParam':
      return `new URLSearchParams(window.location.search).get('${key}') || ''`;

    case 'dataAttribute':
      return `document.querySelector('${config.selector}')?.dataset['${key}'] || ''`;

    case 'internal':
      const fnPath = config.fn;
      const args = config.args ? config.args.map(a => JSON.stringify(a)).join(', ') : '';
      return `${fnPath}(${args}) || ''`;

    case 'static':
      return config.value !== undefined ? JSON.stringify(config.value) : "''";

    default:
      return "''";
  }
}

/**
 * Identify which dimensions are property-specific (differ across properties)
 * Returns: { dimensionName: { propertyName: config, ... }, ... }
 */
function getPropertySpecificDimensions(dims) {
  if (!dims.properties) return {};

  const propertySpecific = {};
  const properties = dims.properties;

  // Collect all dimension names that appear in any property
  const allPropertyDimNames = new Set();
  Object.values(properties).forEach(propConfig => {
    Object.keys(propConfig).forEach(dimName => allPropertyDimNames.add(dimName));
  });

  // For each dimension that appears in properties, collect all property configs
  allPropertyDimNames.forEach(dimName => {
    propertySpecific[dimName] = {};
    Object.entries(properties).forEach(([propName, propConfig]) => {
      if (propConfig[dimName]) {
        propertySpecific[dimName][propName] = propConfig[dimName];
      }
    });
  });

  return propertySpecific;
}

/**
 * Generate a property-aware getter that switches based on current property
 */
function generatePropertyAwareGetter(name, propertyConfigs) {
  const cases = Object.entries(propertyConfigs)
    .filter(([propName]) => propName !== 'default')
    .map(([propName, config]) => {
      return `      case '${propName}': return ${generateInlineGetter(config)};`;
    })
    .join('\n');

  // Default case - use 'default' property config if exists
  const defaultConfig = propertyConfigs.default;
  const defaultReturn = defaultConfig
    ? generateInlineGetter(defaultConfig)
    : "''";

  return `  ${name}: () => {
    switch (getProperty()) {
${cases}
      default: return ${defaultReturn};
    }
  }`;
}

/**
 * Collect internal imports from ALL dimension configs (common + all properties)
 */
function collectAllInternalImports(dims) {
  const imports = new Set();

  const scanConfig = (config) => {
    if (config.source === 'internal' && config.fn) {
      const moduleName = config.fn.split('.')[0];
      if (internalModules[moduleName]) {
        imports.add(moduleName);
      }
    }
  };

  // Scan common dimensions
  if (dims.common) {
    Object.values(dims.common).forEach(scanConfig);
  }

  // Scan all property dimensions
  if (dims.properties) {
    Object.values(dims.properties).forEach(propConfig => {
      Object.values(propConfig).forEach(scanConfig);
    });
  }

  // Fallback for flat structure
  if (!dims.common && !dims.properties) {
    Object.values(dims).forEach(scanConfig);
  }

  return imports;
}

// Analyze dimensions structure
const hasPropertyStructure = dimensions.common || dimensions.properties;
const common = hasPropertyStructure ? (dimensions.common || {}) : dimensions;
const propertySpecificDims = hasPropertyStructure ? getPropertySpecificDimensions(dimensions) : {};

// Generate the dimensions module
const requiredImports = collectAllInternalImports(dimensions);
const importsCode = generateImports(requiredImports);

// Check if we need getProperty import (only if there are property-specific dimensions)
const needsPropertyImport = Object.keys(propertySpecificDims).length > 0;
const propertyImport = needsPropertyImport ? "import { getProperty } from '../property';\n" : '';

// Generate common dimension getters
const commonGetters = Object.entries(common)
  .map(([name, config]) => generateGetter(name, config))
  .join(',\n');

// Generate property-aware getters for property-specific dimensions
const propertyAwareGetters = Object.entries(propertySpecificDims)
  .map(([name, propConfigs]) => generatePropertyAwareGetter(name, propConfigs))
  .join(',\n');

// Combine all getters
const allGetters = [commonGetters, propertyAwareGetters].filter(Boolean).join(',\n');

// Collect matchTypes: common + first available from each property-specific dimension
const allDimensionConfigs = { ...common };
Object.entries(propertySpecificDims).forEach(([dimName, propConfigs]) => {
  const config = propConfigs.default || Object.values(propConfigs)[0];
  if (config) allDimensionConfigs[dimName] = config;
});

const dimensionConfig = generateDimensionConfig(allDimensionConfigs);

const generatedCode = `/**
 * AUTO-GENERATED - Do not edit directly
 * Generated from config/dimensions.json
 */

${importsCode}${propertyImport}export const dimensions = {
${allGetters}
};

export const dimensionConfig = ${dimensionConfig};

export default { dimensions, dimensionConfig };
`;

// Ensure generated directory exists
mkdirSync(`${ROOT}/src/generated`, { recursive: true });

// Write generated dimensions file
const outputPath = `${ROOT}/src/generated/dimensions.js`;
writeFileSync(outputPath, generatedCode);
console.log(`Generated: ${outputPath}`);

// Generate about.js with build metadata
const buildDate = new Date().toISOString();
const mode = process.argv[2] || 'prod';

const aboutCode = `/**
 * AUTO-GENERATED - Do not edit directly
 * Build metadata generated at build time
 * Configure via config/about.json (copy from about.scaffold.json)
 */

export const about = {
  name: '${aboutConfig.name || 'proton'}',
  version: '${aboutConfig.version || '1.0.0'}',
  author: '${aboutConfig.author || ''}',
  credit: '${aboutConfig.credit || ''}',
  contributors: ${JSON.stringify(aboutConfig.contributors || [])},
  description: '${aboutConfig.description || ''}',
  buildDate: '${buildDate}',
  buildMode: '${mode}',
  repository: '${aboutConfig.repository || ''}'
};

export default about;
`;

const aboutOutputPath = `${ROOT}/src/generated/about.js`;
writeFileSync(aboutOutputPath, aboutCode);
console.log(`Generated: ${aboutOutputPath}`);

// Run esbuild (mode already defined above)

// ============================================================================
// Optional Modules - Generate esbuild --define flags
// ============================================================================

const optionalModules = loaderConfig.optionalModules || {};

// Injection config - supports both nested object and simple boolean (backward compat)
const injectionConfig = optionalModules.injection;
const injectionEnabled = typeof injectionConfig === 'object'
  ? injectionConfig.enabled !== false
  : injectionConfig !== false;
const injectionCharMode = injectionEnabled && (
  typeof injectionConfig === 'object'
    ? injectionConfig.charMode !== false
    : true  // default to true if simple boolean
);
const injectionBlockMode = injectionEnabled && (
  typeof injectionConfig === 'object'
    ? injectionConfig.blockMode !== false
    : true  // default to true if simple boolean
);

const defineFlags = [
  `--define:FEATURE_SEQUENCING=${optionalModules.sequencing !== false}`,
  `--define:FEATURE_INJECTION=${injectionEnabled}`,
  `--define:FEATURE_INJECTION_CHAR_MODE=${injectionCharMode}`,
  `--define:FEATURE_INJECTION_BLOCK_MODE=${injectionBlockMode}`,
  `--define:FEATURE_CUSTOM_SLOTS=${optionalModules.customSlots !== false}`,
  `--define:FEATURE_EXPERIENCES=${optionalModules.experiences !== false}`,
  `--define:FEATURE_REFRESH=${optionalModules.refresh !== false}`,
  `--define:FEATURE_EXPERIMENTS=${optionalModules.experiments !== false}`,
  `--define:FEATURE_CUSTOM_FUNCTIONS=${optionalModules.customFunctions !== false}`,
  `--define:FEATURE_WRAPPERS=${optionalModules.wrappers !== false}`,
  `--define:FEATURE_SRA_BATCHING=${optionalModules.sraBatching !== false}`
].join(' ');

// Log which features are enabled
console.log('\nOptional modules:');
console.log(`  sequencing:   ${optionalModules.sequencing !== false ? '[+] enabled' : '[-] disabled'}`);
console.log(`  injection:    ${injectionEnabled ? '[+] enabled' : '[-] disabled'}`);
if (injectionEnabled) {
  console.log(`    |-- charMode:  ${injectionCharMode ? '[+] enabled' : '[-] disabled'}`);
  console.log(`    +-- blockMode: ${injectionBlockMode ? '[+] enabled' : '[-] disabled'}`);
}
console.log(`  customSlots:  ${optionalModules.customSlots !== false ? '[+] enabled' : '[-] disabled'}`);
console.log(`  experiences:  ${optionalModules.experiences !== false ? '[+] enabled' : '[-] disabled'}`);
console.log(`  refresh:      ${optionalModules.refresh !== false ? '[+] enabled' : '[-] disabled'}`);
console.log(`  experiments:  ${optionalModules.experiments !== false ? '[+] enabled' : '[-] disabled'}`);
console.log(`  customFuncs:  ${optionalModules.customFunctions !== false ? '[+] enabled' : '[-] disabled'}`);
console.log(`  wrappers:     ${optionalModules.wrappers !== false ? '[+] enabled' : '[-] disabled'}`);
console.log(`  sraBatching:  ${optionalModules.sraBatching !== false ? '[+] enabled' : '[-] disabled'}`);
console.log('');

const commands = {
  // entry.ts = auto-initializing bundle
  prod: `npx esbuild src/entry.ts --bundle --minify --format=iife ${defineFlags} --outfile=dist/proton.min.js`,
  dev: `npx esbuild src/entry.ts --bundle --format=iife --sourcemap ${defineFlags} --outfile=dist/proton.js`,
  // Library-only build (for manual instantiation)
  lib: 'npx esbuild src/index.ts --bundle --minify --format=iife --global-name=Proton --outfile=dist/proton.lib.min.js',
  esm: 'npx esbuild src/index.ts --bundle --minify --format=esm --outfile=dist/proton.esm.min.js',
  // Standalone PubSub (sets window.PubSub internally)
  pubsub: 'npx esbuild src/pubsub.ts --bundle --minify --format=iife --outfile=dist/pubsub.min.js',
  // PubSub dev build (reference implementation for experimentalPubsub)
  'pubsub:dev': 'npx esbuild src/pubsub.ts --bundle --format=iife --sourcemap --outfile=dist/pubsub.js'
};

if (mode === 'all') {
  Object.entries(commands).forEach(([name, cmd]) => {
    console.log(`Building: ${name}`);
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  });
} else {
  const cmd = commands[mode] || commands.prod;
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

console.log('Build complete!');
