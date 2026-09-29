import { describe, expect, it } from 'vitest';
import { parseCollectionLimit } from './collection-helpers.js';

describe('xiaohongshu collection helpers', () => {
    it('validates collection limits instead of silently clamping', () => {
        expect(parseCollectionLimit('20')).toBe(20);
        expect(() => parseCollectionLimit(0)).toThrow(/between 1 and 100/);
        expect(() => parseCollectionLimit(101)).toThrow(/between 1 and 100/);
        expect(() => parseCollectionLimit('1.5')).toThrow(/integer/);
    });
});
