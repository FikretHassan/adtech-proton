/**
 * PubSub - Lightweight publish/subscribe event system
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
  topics: Subscription[];
  publishedTopics: string[];
  private uid: number;

  constructor() {
    this.instanceId = this.generateInstanceId();
    this.topics = [];
    this.publishedTopics = [];
    this.uid = -1;
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

    // If topic was already published and runIfAlreadyPublished is true, execute immediately
    if (runIfAlreadyPublished) {
      for (let i = 0; i < this.publishedTopics.length; i++) {
        if (this.publishedTopics[i] === topic) {
          func.call(null);
          break;
        }
      }
    }

    const token = (this.uid += 1).toString();
    this.topics.push({ token, topic, func });
    return token;
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe({ topic, token }: UnsubscribeConfig): boolean {
    for (let i = 0; i < this.topics.length; i++) {
      if (this.topics[i].token === token && this.topics[i].topic === topic) {
        this.topics.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Publish to a topic
   */
  publish({ topic, data }: PublishConfig): void {
    this.publishedTopics.push(topic);

    for (let i = 0; i < this.topics.length; i++) {
      if (this.topics[i].topic === topic) {
        try {
          this.topics[i].func.call(null, data);
        } catch (err) {
          console.error(`[PubSub] Subscriber error on "${topic}":`, err);
        }
      }
    }
  }

  /**
   * Check if a topic has been published
   */
  hasPublished(topic: string): boolean {
    return this.publishedTopics.includes(topic);
  }

  /**
   * Clear all subscriptions and published history
   */
  clear(): void {
    this.topics = [];
    this.publishedTopics = [];
    this.uid = -1;
  }
}

// Auto-create global instance (order-independent)
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PubSub = (window as any).PubSub || new PubSub();
}

export default PubSub;
