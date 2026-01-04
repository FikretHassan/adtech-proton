/**
 * DOM Styling Utilities
 * Shared utilities for applying styles and creating labels in injection modules
 */

export interface LabelConfig {
  text: string;
  class?: string;
  style?: Record<string, string> | string;
  dataAttributes?: Record<string, string>;
  id?: string;
}

/**
 * Apply styles to an element
 * Supports both string (CSS syntax) and object (camelCase) formats
 * @param element - Target element
 * @param styles - Styles to apply (string or object)
 */
export function applyStyles(element: HTMLElement, styles: Record<string, string> | string): void {
  if (!styles) return;

  if (typeof styles === 'string') {
    // String format: 'min-height: 250px; background: #f5f5f5;'
    element.style.cssText += styles;
  } else if (typeof styles === 'object') {
    // Object format: { minHeight: '250px', background: '#f5f5f5' }
    Object.entries(styles).forEach(([prop, value]) => {
      (element.style as any)[prop] = value;
    });
  }
}

/**
 * Resolve label configuration from source and defaults
 * @param source - Object containing label property (rule or injection config)
 * @param defaultLabel - Default label configuration from globals
 * @returns Resolved label config or null if disabled
 */
export function getLabelConfig(source: any, defaultLabel: LabelConfig | null): LabelConfig | null {
  // Explicitly disabled
  if (source?.label === false) return null;

  // No source label and no default - no label
  if (source?.label === undefined && !defaultLabel) return null;

  // String shorthand: just the text
  if (typeof source?.label === 'string') {
    return { ...defaultLabel, text: source.label } as LabelConfig;
  }

  // Object: merge with defaults
  if (typeof source?.label === 'object' && source.label !== null) {
    return { ...defaultLabel, ...source.label } as LabelConfig;
  }

  // Use default
  return defaultLabel || null;
}

/**
 * Create a label element
 * @param config - Label configuration
 * @returns Label element
 */
export function createLabelElement(config: LabelConfig): HTMLElement {
  const label = document.createElement('div');
  label.className = config.class || 'advert-label';
  label.textContent = config.text;

  if (config.id) {
    label.id = config.id;
  }

  if (config.style) {
    applyStyles(label, config.style);
  }

  if (config.dataAttributes) {
    Object.entries(config.dataAttributes).forEach(([key, value]) => {
      label.setAttribute(key, value);
    });
  }

  return label;
}

export default {
  applyStyles,
  getLabelConfig,
  createLabelElement
};
