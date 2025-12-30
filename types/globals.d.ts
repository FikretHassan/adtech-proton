/**
 * Global type definitions for plugin-loader
 * Core types for GPT and loader globals
 *
 * Note: Third-party integrations (Prebid, Amazon APS, etc.) should define
 * their own types in config/partners/ if type safety is needed.
 */

// =============================================================================
// Config JSON Module Declarations
// Treat config JSON as 'any' - these are runtime configuration, not our logic
// =============================================================================

declare module '../config/*.json' {
  const value: any;
  export default value;
}

declare module '../config/**/*.json' {
  const value: any;
  export default value;
}

// =============================================================================
// Google Publisher Tag (GPT) Types
// =============================================================================

/** GPT Slot object returned by defineSlot */
interface GoogleTagSlot {
  addService(service: GoogleTagPubAdsService): GoogleTagSlot;
  defineSizeMapping(sizeMapping: GoogleTagSizeMapping): GoogleTagSlot;
  setTargeting(key: string, value: string | string[]): GoogleTagSlot;
  getSlotElementId(): string;
  getAdUnitPath(): string;
  getTargeting(key: string): string[];
  getTargetingKeys(): string[];
  clearTargeting(key?: string): GoogleTagSlot;
  getResponseInformation(): GoogleTagResponseInfo | null;
  getSizes(viewport?: [number, number]): Array<[number, number] | 'fluid'>;
}

/** GPT Response information */
interface GoogleTagResponseInfo {
  advertiserId: number | null;
  campaignId: number | null;
  creativeId: number | null;
  lineItemId: number | null;
  sourceAgnosticCreativeId: number | null;
  sourceAgnosticLineItemId: number | null;
}

/** GPT Size Mapping Builder */
interface GoogleTagSizeMappingBuilder {
  addSize(viewport: [number, number], sizes: Array<[number, number]> | []): GoogleTagSizeMappingBuilder;
  build(): GoogleTagSizeMapping | null;
}

/** GPT Size Mapping (opaque type returned by builder) */
type GoogleTagSizeMapping = object;

/** GPT Event object */
interface GoogleTagEvent {
  slot: GoogleTagSlot;
  serviceName: string;
}

/** GPT SlotRenderEnded event */
interface GoogleTagSlotRenderEndedEvent extends GoogleTagEvent {
  isEmpty: boolean;
  size: [number, number] | null;
  creativeId: number | null;
  lineItemId: number | null;
  advertiserId: number | null;
  campaignId: number | null;
  sourceAgnosticCreativeId: number | null;
  sourceAgnosticLineItemId: number | null;
}

/** GPT SlotVisibilityChanged event */
interface GoogleTagSlotVisibilityChangedEvent extends GoogleTagEvent {
  inViewPercentage: number;
}

/** GPT event listener callback type */
type GoogleTagEventCallback<T extends GoogleTagEvent = GoogleTagEvent> = (event: T) => void;

/** GPT PubAds Service */
interface GoogleTagPubAdsService {
  addEventListener<T extends GoogleTagEvent>(
    eventType: string,
    listener: GoogleTagEventCallback<T>
  ): GoogleTagPubAdsService;
  removeEventListener(eventType: string, listener: GoogleTagEventCallback): void;
  setPublisherProvidedId(ppid: string): GoogleTagPubAdsService;
  setTargeting(key: string, value: string | string[]): GoogleTagPubAdsService;
  clearTargeting(key?: string): GoogleTagPubAdsService;
  refresh(slots?: GoogleTagSlot[] | null, options?: { changeCorrelator?: boolean }): void;
  enableSingleRequest(): GoogleTagPubAdsService;
  collapseEmptyDivs(collapse?: boolean): GoogleTagPubAdsService;
  disableInitialLoad(): void;
  getSlots(): GoogleTagSlot[];
  getTargeting(key: string): string[];
  getTargetingKeys(): string[];
}

/** Main googletag namespace */
interface GoogleTag {
  cmd: Array<() => void>;
  pubads(): GoogleTagPubAdsService;
  defineSlot(adUnitPath: string, size: Array<[number, number]> | [number, number], elementId: string): GoogleTagSlot | null;
  defineOutOfPageSlot(adUnitPath: string, elementId: string): GoogleTagSlot | null;
  display(elementId: string | HTMLElement): void;
  enableServices(): void;
  destroySlots(slots?: GoogleTagSlot[]): boolean;
  sizeMapping(): GoogleTagSizeMappingBuilder;
  setAdIframeTitle(title: string): void;
  apiReady?: boolean;
  pubadsReady?: boolean;
}

// =============================================================================
// PubSub Types
// =============================================================================

/** PubSub message structure */
interface PubSubMessage {
  topic: string;
  data?: unknown;
}

/** PubSub subscription options */
interface PubSubSubscribeOptions {
  topic: string;
  callback: (data: unknown) => void;
  once?: boolean;
}

/** PubSub instance */
interface PubSubInstance {
  publish(message: PubSubMessage): void;
  subscribe(options: PubSubSubscribeOptions): () => void;
  unsubscribe(topic: string, callback?: (data: unknown) => void): void;
}

// =============================================================================
// Loader Instance Types
// =============================================================================

/** Proton loader instance */
interface ProtonInstance {
  cmd: Array<() => void>;
  log: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  requestAds: (slotIds?: string[]) => Promise<void>;
  createSlot: (config: unknown) => void;
  refreshSlot: (slotId: string, targeting?: Record<string, string>) => void;
  destroySlot: (slotId: string) => void;
  getSlot: (slotId: string) => unknown;
  getAllSlots: () => Record<string, unknown>;
  setTargeting: (key: string, value: string | string[]) => void;
  clearTargeting: (key?: string) => void;
  getTargeting: () => Record<string, string | string[]>;
  about?: {
    version: string;
    buildTime: string;
    environment: string;
  };
  [key: string]: unknown;
}

// =============================================================================
// Window Interface Augmentation
// =============================================================================

interface Window {
  // GPT - required for ad serving
  googletag: any;

  // Plugin loader globals (dynamic based on config)
  [key: string]: any;

  // Common globals
  dataLayer?: Array<Record<string, unknown>>;
}

// =============================================================================
// Config Module Types (for imported JSON)
// =============================================================================

/** Slot data in registry */
interface SlotData {
  slotId: string;
  adType: string;
  pagetype?: string;
  viewport?: string;
  element?: HTMLElement;
  gptSlot?: GoogleTagSlot;
  state: 'pending' | 'defined' | 'displayed' | 'loaded' | 'empty' | 'error';
  targeting?: Record<string, string | string[]>;
  requestTime?: number;
  loadTime?: number;
  renderTime?: number;
  refreshCount?: number;
  [key: string]: unknown;
}

/** Refresh configuration */
interface RefreshConfig {
  enabled?: boolean;
  rules?: RefreshRule[];
  [key: string]: unknown;
}

/** Refresh rule */
interface RefreshRule {
  adTypes?: string[];
  pagetypes?: string[];
  viewports?: string[];
  interval?: number;
  maxRefreshes?: number;
  viewability?: number;
  [key: string]: unknown;
}

/** Targeting configuration */
interface TargetingConfig {
  maxValueLength?: number;
  trimWhitespace?: boolean;
  normalization?: {
    enabled: boolean;
    maxKeyLength: number;
    maxValueLength: number;
    sanitize: boolean;
    trimWhitespace: boolean;
  };
  pageLevel?: Record<string, unknown>;
  slotLevel?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Sequencing configuration */
interface SequencingConfig {
  rules?: SequencingRule[];
  [key: string]: unknown;
}

/** Sequencing rule */
interface SequencingRule {
  adTypes?: string[];
  pagetypes?: string[];
  priority?: number;
  waitFor?: string[];
  [key: string]: unknown;
}

// =============================================================================
// Injection Styling Types
// =============================================================================

/** Label configuration for injection styling */
interface LabelConfig {
  text: string;
  class?: string;
  style?: Record<string, string> | string;
}

/** Dynamic injection rule styling options */
interface InjectionRule {
  match: Record<string, string[]>;
  exclude?: Record<string, string[]>;
  config: {
    firstAd?: number;
    otherAd?: number;
    minParaChars?: number;
    maxAds?: number;
    firstAdBlock?: number;
    otherAdBlock?: number;
    minBlockChars?: number;
  };
  wrapperClass?: string;
  wrapperStyle?: Record<string, string> | string;
  adClass?: string;
  adStyle?: Record<string, string> | string;
  label?: string | LabelConfig | false;
}

/** Custom slot injection configuration */
interface CustomSlotInjection {
  selector: string;
  poscount?: number;
  position: 'before' | 'after' | 'prepend' | 'append' | 'replace';
  wrapperClass?: string;
  wrapperStyle?: Record<string, string> | string;
  adClass?: string;
  adStyle?: Record<string, string> | string;
  label?: string | LabelConfig | false;
}
