/**
 * Wrapper Adapter Types
 *
 * Defines the interface contract that wrapper configs must implement.
 * The orchestrator calls these methods without knowing wrapper-specific details.
 */

/**
 * Context passed during wrapper initialization
 */
export interface WrapperContext {
  /** All resolved dimensions (geo, viewport, pagetype, etc.) */
  dimensions: Record<string, string | null>;
  /** Current property name */
  property: string;
  /** Current viewport breakpoint */
  viewport: string;
}

/**
 * Context passed for each auction request
 */
export interface AuctionContext {
  /** Slot element ID */
  slotId: string;
  /** All resolved dimensions */
  dimensions: Record<string, string | null>;
  /** Current viewport breakpoint */
  viewport: string;
  /** Page type (index, story, etc.) */
  pagetype: string;
  /** Site context for ad unit path */
  site: string;
  /** Zone context for ad unit path */
  zone: string;
  /** Ad refresh count (1 = first load, 2+ = refresh) */
  adCount: number;
  /** Slot sizes from sizemapping */
  sizes?: Array<[number, number]>;
}

/**
 * Ad unit configuration returned by adapter
 * Structure is wrapper-specific (Prebid adUnit, Amazon slot, etc.)
 */
export interface AdUnitConfig {
  /** Slot code/ID */
  code: string;
  /** Any additional wrapper-specific config */
  [key: string]: unknown;
}

/**
 * Bid result from auction
 */
export interface BidResult {
  /** Slot ID this bid is for */
  slotId: string;
  /** Whether bid was received */
  hasBid: boolean;
  /** Bid CPM (if available) */
  cpm?: number;
  /** Bidder name */
  bidder?: string;
  /** Time to respond in ms */
  responseTime?: number;
  /** Raw bid data (wrapper-specific) */
  raw?: unknown;
}

/**
 * Result of requestBids call
 */
export interface AuctionResult {
  /** Whether auction completed successfully */
  success: boolean;
  /** Reason for failure (if success=false) */
  reason?: string;
  /** Array of bid results */
  bids: BidResult[];
  /** Time taken in ms */
  duration?: number;
}

/**
 * Wrapper Adapter Interface
 *
 * Each wrapper (Prebid, Amazon, etc.) implements this interface.
 * The orchestrator uses these methods to run auctions without
 * knowing wrapper-specific implementation details.
 */
export interface WrapperAdapter {
  /** Unique name for this wrapper (e.g., 'prebid', 'amazon') */
  readonly name: string;

  /**
   * Check if the wrapper's library is loaded on the page
   * (e.g., window.pbjs for Prebid, window.apstag for Amazon)
   */
  isLibraryLoaded(): boolean;

  /**
   * Initialize the wrapper
   * Called once when the orchestrator initializes
   * @param context - Initialization context with dimensions and property
   */
  init(context: WrapperContext): void | Promise<void>;

  /**
   * Check if this wrapper has config for a given slot
   * @param slotId - Slot element ID
   * @param context - Auction context
   * @returns true if wrapper should participate in auction for this slot
   */
  hasSlotConfig(slotId: string, context: AuctionContext): boolean;

  /**
   * Get ad unit configuration for a slot
   * @param slotId - Slot element ID
   * @param context - Auction context
   * @returns Ad unit config or null if slot not configured
   */
  getAdUnit(slotId: string, context: AuctionContext): AdUnitConfig | null;

  /**
   * Request bids for a slot
   * @param slotId - Slot element ID
   * @param context - Auction context
   * @param timeout - Auction timeout in ms
   * @returns Promise resolving to auction result
   */
  requestBids(slotId: string, context: AuctionContext, timeout: number): Promise<AuctionResult>;

  /**
   * Apply bid targeting to a GPT slot
   * @param slotId - Slot element ID
   * @param gptSlot - GPT slot object (optional, retrieved internally if not provided)
   */
  applyTargeting(slotId: string, gptSlot?: unknown): void;

  /**
   * Clean up after slot is destroyed/refreshed
   * @param slotId - Slot element ID
   */
  clearSlot?(slotId: string): void;

  /**
   * Get wrapper-specific state/debug info
   */
  getState?(): Record<string, unknown>;
}

/**
 * Wrapper registration function type
 * Adapters call this to register themselves with the orchestrator
 */
export type RegisterWrapperFn = (adapter: WrapperAdapter) => void;
