/**
 * cache.test.js - Tests for the in-memory cache (api/utility/cache.js)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const cache = require('../../api/utility/cache');

beforeEach(() => {
  cache.clear();
});

// =========================================================================
// get / set basics
// =========================================================================

describe('get / set', () => {
  it('should return null for a key that was never set', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should store and retrieve a value', () => {
    cache.set('key1', { foo: 'bar' }, 60000);
    expect(cache.get('key1')).toEqual({ foo: 'bar' });
  });

  it('should store primitive values', () => {
    cache.set('num', 42, 60000);
    cache.set('str', 'hello', 60000);
    cache.set('bool', true, 60000);
    expect(cache.get('num')).toBe(42);
    expect(cache.get('str')).toBe('hello');
    expect(cache.get('bool')).toBe(true);
  });

  it('should store arrays', () => {
    cache.set('arr', [1, 2, 3], 60000);
    expect(cache.get('arr')).toEqual([1, 2, 3]);
  });

  it('should overwrite existing key', () => {
    cache.set('key1', 'first', 60000);
    cache.set('key1', 'second', 60000);
    expect(cache.get('key1')).toBe('second');
  });
});

// =========================================================================
// TTL expiration
// =========================================================================

describe('TTL expiration', () => {
  it('should return null after TTL expires', () => {
    vi.useFakeTimers();
    try {
      cache.set('expiring', 'data', 1000);
      expect(cache.get('expiring')).toBe('data');

      vi.advanceTimersByTime(999);
      expect(cache.get('expiring')).toBe('data');

      vi.advanceTimersByTime(2);
      expect(cache.get('expiring')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should clean up expired entry on get', () => {
    vi.useFakeTimers();
    try {
      cache.set('temp', 'value', 500);
      vi.advanceTimersByTime(501);
      expect(cache.get('temp')).toBeNull();
      expect(cache.get('temp')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

// =========================================================================
// invalidate
// =========================================================================

describe('invalidate', () => {
  it('should remove a specific key', () => {
    cache.set('a', 1, 60000);
    cache.set('b', 2, 60000);

    cache.invalidate('a');
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
  });

  it('should not throw when invalidating a non-existent key', () => {
    expect(() => cache.invalidate('ghost')).not.toThrow();
  });
});

// =========================================================================
// invalidatePrefix
// =========================================================================

describe('invalidatePrefix', () => {
  it('should remove all keys matching the prefix', () => {
    cache.set('user:1:profile', 'alice', 60000);
    cache.set('user:1:posts', [1, 2], 60000);
    cache.set('user:2:profile', 'bob', 60000);
    cache.set('thread:1', 'data', 60000);

    cache.invalidatePrefix('user:1:');
    expect(cache.get('user:1:profile')).toBeNull();
    expect(cache.get('user:1:posts')).toBeNull();
    expect(cache.get('user:2:profile')).toBe('bob');
    expect(cache.get('thread:1')).toBe('data');
  });

  it('should not throw when no keys match', () => {
    expect(() => cache.invalidatePrefix('zzz:')).not.toThrow();
  });
});

// =========================================================================
// clear
// =========================================================================

describe('clear', () => {
  it('should remove all entries', () => {
    cache.set('a', 1, 60000);
    cache.set('b', 2, 60000);
    cache.set('c', 3, 60000);

    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
    expect(cache.get('c')).toBeNull();
  });

  it('should not throw when cache is already empty', () => {
    cache.clear();
    expect(() => cache.clear()).not.toThrow();
  });
});
