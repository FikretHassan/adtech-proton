import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PubSub } from '../src/pubsub';

describe('PubSub', () => {
  let pubsub: PubSub;

  beforeEach(() => {
    pubsub = new PubSub();
  });

  describe('constructor', () => {
    it('creates instance with unique ID', () => {
      expect(pubsub.instanceId).toBeDefined();
      expect(typeof pubsub.instanceId).toBe('string');
    });

    it('starts with empty topics', () => {
      expect(pubsub.topics).toEqual([]);
    });

    it('starts with empty publishedTopics', () => {
      expect(pubsub.publishedTopics).toEqual([]);
    });

    it('creates different IDs for different instances', () => {
      const pubsub2 = new PubSub();
      expect(pubsub.instanceId).not.toBe(pubsub2.instanceId);
    });
  });

  describe('generateInstanceId', () => {
    it('returns a UUID-like string', () => {
      const id = pubsub.generateInstanceId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('subscribe', () => {
    it('returns a token on successful subscribe', () => {
      const token = pubsub.subscribe({
        topic: 'test-topic',
        func: () => {}
      });
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('returns false when func is not a function', () => {
      const result = pubsub.subscribe({
        topic: 'test-topic',
        func: 'not-a-function' as any
      });
      expect(result).toBe(false);
    });

    it('adds subscription to topics array', () => {
      pubsub.subscribe({
        topic: 'test-topic',
        func: () => {}
      });
      expect(pubsub.topics.length).toBe(1);
      expect(pubsub.topics[0].topic).toBe('test-topic');
    });

    it('returns unique tokens for each subscription', () => {
      const token1 = pubsub.subscribe({ topic: 'topic1', func: () => {} });
      const token2 = pubsub.subscribe({ topic: 'topic2', func: () => {} });
      expect(token1).not.toBe(token2);
    });

    it('calls func immediately if runIfAlreadyPublished and topic was published', () => {
      const callback = vi.fn();

      // Publish first
      pubsub.publish({ topic: 'test-topic' });

      // Then subscribe with runIfAlreadyPublished
      pubsub.subscribe({
        topic: 'test-topic',
        func: callback,
        runIfAlreadyPublished: true
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does not call func if runIfAlreadyPublished is false', () => {
      const callback = vi.fn();

      pubsub.publish({ topic: 'test-topic' });

      pubsub.subscribe({
        topic: 'test-topic',
        func: callback,
        runIfAlreadyPublished: false
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('does not call func if topic was not published', () => {
      const callback = vi.fn();

      pubsub.subscribe({
        topic: 'test-topic',
        func: callback,
        runIfAlreadyPublished: true
      });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('removes subscription and returns true', () => {
      const token = pubsub.subscribe({
        topic: 'test-topic',
        func: () => {}
      }) as string;

      const result = pubsub.unsubscribe({ topic: 'test-topic', token });

      expect(result).toBe(true);
      expect(pubsub.topics.length).toBe(0);
    });

    it('returns false if subscription not found', () => {
      const result = pubsub.unsubscribe({ topic: 'nonexistent', token: '999' });
      expect(result).toBe(false);
    });

    it('returns false if token matches but topic does not', () => {
      const token = pubsub.subscribe({
        topic: 'topic1',
        func: () => {}
      }) as string;

      const result = pubsub.unsubscribe({ topic: 'topic2', token });
      expect(result).toBe(false);
    });
  });

  describe('publish', () => {
    it('calls subscribed function with data', () => {
      const callback = vi.fn();
      pubsub.subscribe({ topic: 'test-topic', func: callback });

      pubsub.publish({ topic: 'test-topic', data: { foo: 'bar' } });

      expect(callback).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('calls multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      pubsub.subscribe({ topic: 'test-topic', func: callback1 });
      pubsub.subscribe({ topic: 'test-topic', func: callback2 });

      pubsub.publish({ topic: 'test-topic' });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('only calls subscribers of the published topic', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      pubsub.subscribe({ topic: 'topic1', func: callback1 });
      pubsub.subscribe({ topic: 'topic2', func: callback2 });

      pubsub.publish({ topic: 'topic1' });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).not.toHaveBeenCalled();
    });

    it('adds topic to publishedTopics', () => {
      pubsub.publish({ topic: 'test-topic' });
      expect(pubsub.publishedTopics).toContain('test-topic');
    });

    it('handles subscriber errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const goodCallback = vi.fn();

      pubsub.subscribe({
        topic: 'test-topic',
        func: () => { throw new Error('test error'); }
      });
      pubsub.subscribe({ topic: 'test-topic', func: goodCallback });

      // Should not throw
      expect(() => pubsub.publish({ topic: 'test-topic' })).not.toThrow();

      // Second callback should still be called
      expect(goodCallback).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

});
