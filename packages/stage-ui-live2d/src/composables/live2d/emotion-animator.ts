import type { EmotionKeyframe, EmotionParameterTargets, EmotionPreset } from './emotion-presets'

import { getNeutralTargets } from './emotion-presets'

/**
 * Easing functions for smooth animation curves.
 */
const easings = {
  'linear': (t: number) => t,
  'ease-in': (t: number) => t * t,
  'ease-out': (t: number) => 1 - (1 - t) * (1 - t),
  'ease-in-out': (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  'bounce': (t: number) => {
    // Overshoot and settle
    const c4 = (2 * Math.PI) / 3
    return t === 0 ? 0 : t === 1 ? 1 : (2 ** (-10 * t)) * Math.sin((t * 10 - 0.75) * c4) + 1
  },
}

type EasingName = keyof typeof easings

/**
 * Animation state for a single emotion expression.
 * Tracks which keyframe we're on, elapsed time, and start/current parameter values.
 */
interface AnimationState {
  preset: EmotionPreset
  intensity: number
  /** Index of the current keyframe in the preset's keyframes array */
  keyframeIndex: number
  /** Elapsed time within the current keyframe (seconds) */
  keyframeElapsed: number
  /** Parameter values at the start of the current keyframe transition */
  startValues: EmotionParameterTargets
  /** Whether we've finished all keyframes and are in the hold phase */
  holding: boolean
  /** Elapsed time in the hold phase (seconds) */
  holdElapsed: number
  /** Whether we've started decaying back to neutral */
  decaying: boolean
  /** Elapsed time in the decay phase (seconds) */
  decayElapsed: number
  /** Parameter values at the start of the decay transition */
  decayStartValues: EmotionParameterTargets
  /** Whether the animation is completely finished */
  finished: boolean
}

/**
 * Get the easing function for a keyframe.
 */
function getEasing(name?: EasingName): (t: number) => number {
  return easings[name ?? 'ease-in-out']
}

/**
 * Linearly interpolate between two values.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Interpolate between two sets of parameter targets.
 * Only interpolates parameters that exist in the `to` targets.
 */
function interpolateTargets(
  from: EmotionParameterTargets,
  to: EmotionParameterTargets,
  t: number,
  intensity: number,
): EmotionParameterTargets {
  const result: EmotionParameterTargets = {}
  const neutral = getNeutralTargets()

  for (const key of Object.keys(to) as Array<keyof EmotionParameterTargets>) {
    const toVal = to[key]
    if (toVal === undefined)
      continue

    const fromVal = from[key] ?? neutral[key] ?? 0
    // Scale the target by intensity (neutral + (target - neutral) * intensity)
    const neutralVal = neutral[key] ?? 0
    const scaledTarget = neutralVal + (toVal - neutralVal) * intensity
    result[key] = lerp(fromVal, scaledTarget, t)
  }

  return result
}

/**
 * Creates an emotion animator that manages animation state and applies
 * parameter changes to a Live2D model per-frame.
 */
export function createEmotionAnimator() {
  let currentState: AnimationState | null = null
  /** The last applied parameter values (used as starting point for new transitions) */
  let lastAppliedValues: EmotionParameterTargets = {}

  /**
   * Start a new emotion animation. Interrupts any current animation.
   */
  function play(preset: EmotionPreset, intensity: number = 1) {
    // Use current applied values as the starting point for smooth transition
    currentState = {
      preset,
      intensity: Math.min(1, Math.max(0, intensity)),
      keyframeIndex: 0,
      keyframeElapsed: 0,
      startValues: { ...lastAppliedValues },
      holding: false,
      holdElapsed: 0,
      decaying: false,
      decayElapsed: 0,
      decayStartValues: {},
      finished: false,
    }
  }

  /**
   * Force-stop the current animation and reset to neutral.
   */
  function stop() {
    currentState = null
    lastAppliedValues = {}
  }

  /**
   * Check if an animation is currently active.
   */
  function isActive(): boolean {
    return currentState !== null && !currentState.finished
  }

  /**
   * Advance the animation by `dt` seconds and return the current
   * parameter targets to apply to the model.
   * Returns null if no animation is active.
   */
  function update(dt: number): EmotionParameterTargets | null {
    if (!currentState || currentState.finished)
      return null

    const state = currentState

    // Phase 1: Keyframe animation
    if (!state.holding && !state.decaying) {
      const keyframe: EmotionKeyframe = state.preset.keyframes[state.keyframeIndex]!
      state.keyframeElapsed += dt

      const progress = Math.min(1, state.keyframeElapsed / keyframe.durationSeconds)
      const eased = getEasing(keyframe.easing as EasingName | undefined)(progress)

      const interpolated = interpolateTargets(
        state.startValues,
        keyframe.targets,
        eased,
        state.intensity,
      )

      lastAppliedValues = { ...lastAppliedValues, ...interpolated }

      // Check if this keyframe is complete
      if (progress >= 1) {
        // Move to next keyframe or start holding
        if (state.keyframeIndex < state.preset.keyframes.length - 1) {
          state.keyframeIndex++
          state.keyframeElapsed = 0
          state.startValues = { ...lastAppliedValues }
        }
        else {
          // All keyframes done, start holding
          state.holding = true
          state.holdElapsed = 0
        }
      }

      return lastAppliedValues
    }

    // Phase 2: Hold at final pose
    if (state.holding && !state.decaying) {
      state.holdElapsed += dt

      if (state.holdElapsed >= state.preset.holdDurationSeconds) {
        // Start decay back to neutral
        state.decaying = true
        state.decayElapsed = 0
        state.decayStartValues = { ...lastAppliedValues }
      }

      return lastAppliedValues
    }

    // Phase 3: Decay back to neutral
    if (state.decaying) {
      state.decayElapsed += dt

      const decayProgress = Math.min(1, state.decayElapsed / state.preset.decayDurationSeconds)
      const eased = getEasing('ease-in-out')(decayProgress)

      const neutral = getNeutralTargets()
      const interpolated = interpolateTargets(
        state.decayStartValues,
        neutral,
        eased,
        1, // Decay always goes fully to neutral
      )

      lastAppliedValues = { ...lastAppliedValues, ...interpolated }

      if (decayProgress >= 1) {
        state.finished = true
        currentState = null
        lastAppliedValues = {}
      }

      return lastAppliedValues
    }

    return null
  }

  return {
    play,
    stop,
    isActive,
    update,
  }
}

export type EmotionAnimator = ReturnType<typeof createEmotionAnimator>
