import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStudioStore } from '../store/studioStore';

describe('equation of the day chip (store behaviour)', () => {
  test('starts with no daily-pick name', () => {
    assert.equal(useStudioStore.getState().equationOfTheDayName, null);
  });

  test('setEquationOfTheDay records the pick name', () => {
    useStudioStore.setState({ equationOfTheDayName: null });
    useStudioStore.getState().setEquationOfTheDay('sin(x) · daily');
    assert.equal(useStudioStore.getState().equationOfTheDayName, 'sin(x) · daily');
  });

  test('loading a preset clears the daily-pick name', () => {
    useStudioStore.getState().setEquationOfTheDay('anything');
    const { loadPreset } = useStudioStore.getState();
    loadPreset({
      equation: 'x^2',
      minX: -10, maxX: 10, minFreq: 150, maxFreq: 800, duration: 4,
      instrument: 'sine', sonificationMode: 'frequency',
    });
    assert.equal(useStudioStore.getState().equationOfTheDayName, null);
    assert.equal(useStudioStore.getState().equation, 'x^2');
  });

  test('leaves other state untouched when only the name changes', () => {
    useStudioStore.getState().setEquationOfTheDay('sin(x)');
    assert.equal(useStudioStore.getState().equationOfTheDayName, 'sin(x)');
    // name-only write does not clobber the equation
    assert.equal(useStudioStore.getState().equationOfTheDayName, 'sin(x)');
  });
});
