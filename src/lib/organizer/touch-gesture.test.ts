import { describe, expect, it } from 'vitest';
import { TouchGesture } from './touch-gesture';
describe('touch gestures', () => {
  it('recognizes two taps on the same target only once', () => {
    const gesture = new TouchGesture();
    gesture.start('a', 0, 0, 0); expect(gesture.end(50)).toBe('tap');
    gesture.start('a', 0, 0, 100); expect(gesture.end(150)).toBe('double');
    gesture.start('a', 0, 0, 200); expect(gesture.end(250)).toBe('tap');
  });
  it('does not combine different targets or slow taps', () => {
    const gesture = new TouchGesture();
    gesture.start('a', 0, 0, 0); gesture.end(20);
    gesture.start('b', 0, 0, 50); expect(gesture.end(80)).toBe('tap');
    gesture.start('b', 0, 0, 500); expect(gesture.end(520)).toBe('tap');
  });
  it('cancels scrolling, long presses and interrupted pointers', () => {
    const gesture = new TouchGesture();
    gesture.start('a', 0, 0, 0); expect(gesture.move(11, 0)).toBe(false); expect(gesture.end(80)).toBeUndefined();
    gesture.start('a', 0, 0, 100); expect(gesture.hold()).toBe('a'); expect(gesture.end(700)).toBeUndefined();
    gesture.start('a', 0, 0, 800); gesture.cancel(); expect(gesture.end(850)).toBeUndefined();
  });
});
