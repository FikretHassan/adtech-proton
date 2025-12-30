import Ajv from 'ajv';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const configDir = join(rootDir, 'config');
const schemasDir = join(rootDir, 'schemas');

// Map config files to their schemas
const configSchemaMap = {
  'partners.json': 'partners.schema.json',
  'properties.json': 'properties.schema.json',
  'targeting.json': 'targeting.schema.json',
  'sizemapping.json': 'sizemapping.schema.json',
  'lazyload.json': 'lazyload.schema.json',
  'refresh.json': 'refresh.schema.json',
  'sequencing.json': 'sequencing.schema.json',
  'wrappers.json': 'wrappers.schema.json',
  'customSlots.json': 'customSlots.schema.json',
  'experiences.json': 'experiences.schema.json',
  'dimensions.json': 'dimensions.schema.json',
  'gptEvents.json': 'gptEvents.schema.json'
  // Note: injection config is now JS-based (config/injection/index.js)
  // Validated at build time through TypeScript/esbuild
};

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function loadJson(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return { error: error.message };
  }
}

function formatError(error) {
  const path = error.instancePath || '/';
  const message = error.message;
  const params = error.params;

  let detail = `  → ${path}: ${message}`;

  if (params) {
    if (params.allowedValues) {
      detail += ` (allowed: ${params.allowedValues.join(', ')})`;
    }
    if (params.additionalProperty) {
      detail += ` (property: "${params.additionalProperty}")`;
    }
    if (params.missingProperty) {
      detail += ` (missing: "${params.missingProperty}")`;
    }
  }

  return detail;
}

function validateConfigs() {
  console.log(`\n${colors.cyan}Proton Config Validation${colors.reset}\n`);
  console.log(`${colors.dim}Validating config files against JSON schemas...${colors.reset}\n`);

  const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    strict: false
  });

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const errors = [];

  // Load all schemas first
  const schemas = {};
  for (const schemaFile of Object.values(configSchemaMap)) {
    const schemaPath = join(schemasDir, schemaFile);
    const schema = loadJson(schemaPath);
    if (schema.error) {
      console.log(`${colors.yellow}⚠${colors.reset} Schema ${schemaFile}: ${schema.error}`);
      continue;
    }
    schemas[schemaFile] = schema;
  }

  // Validate each config
  for (const [configFile, schemaFile] of Object.entries(configSchemaMap)) {
    const configPath = join(configDir, configFile);
    const config = loadJson(configPath);

    if (config.error) {
      console.log(`${colors.yellow}⊘${colors.reset} ${configFile} - ${colors.dim}skipped (${config.error})${colors.reset}`);
      skipped++;
      continue;
    }

    const schema = schemas[schemaFile];
    if (!schema) {
      console.log(`${colors.yellow}⊘${colors.reset} ${configFile} - ${colors.dim}skipped (no schema)${colors.reset}`);
      skipped++;
      continue;
    }

    const validate = ajv.compile(schema);
    const valid = validate(config);

    if (valid) {
      console.log(`${colors.green}✓${colors.reset} ${configFile}`);
      passed++;
    } else {
      console.log(`${colors.red}✗${colors.reset} ${configFile}`);
      validate.errors.forEach(err => {
        const formatted = formatError(err);
        console.log(`${colors.red}${formatted}${colors.reset}`);
        errors.push({ file: configFile, error: formatted });
      });
      failed++;
    }
  }

  // Summary
  console.log(`\n${colors.dim}─────────────────────────────────${colors.reset}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset}  ${colors.red}Failed: ${failed}${colors.reset}  ${colors.yellow}Skipped: ${skipped}${colors.reset}`);

  if (failed > 0) {
    console.log(`\n${colors.red}Config validation failed with ${failed} error(s)${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}All configs valid!${colors.reset}\n`);
    process.exit(0);
  }
}

validateConfigs();
