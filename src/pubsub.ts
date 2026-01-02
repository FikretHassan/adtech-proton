/**
 * PubSub - Lightweight publish/subscribe event system
 *
 * Internal performance optimizations use Map/Set for O(1) lookups.
 */

export interface Subscription {
  token: string;
  topic: string;
  func: (data?: unknown) => void;
}

export interface SubscribeConfig {
  topic: string;
  func: (data?: unknown) => void;
  runIfAlreadyPublished?: boolean;
}

export interface UnsubscribeConfig {
  topic: string;
  token: string;
}

export interface PublishConfig {
  topic: string;
  data?: unknown;
}

// Window.PubSub type declared in internalFunctions.ts

export class PubSub {
  instanceId: string;
  publishedTopics: string[];
  private uid: number;

  // O(1) lookup structures
  private subscriptionsByToken: Map<string, Subscription>;
  private subscriptionsByTopic: Map<string, Subscription[]>;
  private publishedTopicsSet: Set<string>;

  constructor() {
    this.instanceId = this.generateInstanceId();
    this.publishedTopics = [];
    this.uid = -1;

    // Initialize O(1) structures
    this.subscriptionsByToken = new Map();
    this.subscriptionsByTopic = new Map();
    this.publishedTopicsSet = new Set();
  }

  /**
   * Get all subscriptions (backward compatibility)
   */
  get topics(): Subscription[] {
    return Array.from(this.subscriptionsByToken.values());
  }

  /**
   * Generate a unique instance ID (UUID v4)
   */
  generateInstanceId(): string {
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
      return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: string) => {
        const num = parseInt(c);
        return (num ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> num / 4).toString(16);
      });
    }
    // Fallback for environments without crypto
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /**
   * Subscribe to a topic
   */
  subscribe({ topic, func, runIfAlreadyPublished = false }: SubscribeConfig): string | false {
    if (typeof func !== 'function') {
      return false;
    }

    // O(1) check if topic was already published
    if (runIfAlreadyPublished && this.publishedTopicsSet.has(topic)) {
      func.call(null);
    }

    const token = (this.uid += 1).toString();
    const subscription: Subscription = { token, topic, func };

    // O(1) add to token map
    this.subscriptionsByToken.set(token, subscription);

    // O(1) add to topic map (amortized)
    if (!this.subscriptionsByTopic.has(topic)) {
      this.subscriptionsByTopic.set(topic, []);
    }
    this.subscriptionsByTopic.get(topic)!.push(subscription);

    return token;
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe({ topic, token }: UnsubscribeConfig): boolean {
    // O(1) token lookup
    const subscription = this.subscriptionsByToken.get(token);
    if (!subscription || subscription.topic !== topic) {
      return false;
    }

    // O(1) delete from token map
    this.subscriptionsByToken.delete(token);

    // O(m) remove from topic array where m = subscribers to this topic (typically small)
    const topicSubs = this.subscriptionsByTopic.get(topic);
    if (topicSubs) {
      const index = topicSubs.findIndex(s => s.token === token);
      if (index !== -1) {
        topicSubs.splice(index, 1);
      }
      // Clean up empty topic arrays
      if (topicSubs.length === 0) {
        this.subscriptionsByTopic.delete(topic);
      }
    }

    return true;
  }

  /**
   * Publish to a topic
   */
  publish({ topic, data }: PublishConfig): void {
    // O(1) add to set + array (for backward compat)
    this.publishedTopicsSet.add(topic);
    this.publishedTopics.push(topic);

    // O(m) iterate only subscribers to this topic
    const subscribers = this.subscriptionsByTopic.get(topic);
    if (subscribers) {
      for (const sub of subscribers) {
        try {
          sub.func.call(null, data);
        } catch (err) {
          console.error(`[PubSub] Subscriber error on "${topic}":`, err);
        }
      }
    }
  }

}

// Auto-create global instance (order-independent)
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PubSub = (window as any).PubSub || new PubSub();
}

export default PubSub;
