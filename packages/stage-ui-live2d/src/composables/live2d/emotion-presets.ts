import type { defaultModelParameters } from '../../stores/live2d'

/**
 * Partial target values for Live2D model parameters.
 * Only specified parameters will be animated; others remain unchanged.
 */
export type EmotionParameterTargets = Partial<typeof defaultModelParameters>

/**
 * A single keyframe in a multi-step emotion animation.
 * Each keyframe specifies target parameter values and a duration
 * for the transition to those values.
 */
export interface EmotionKeyframe {
  /** Target parameter values for this keyframe */
  targets: EmotionParameterTargets
  /** Duration in seconds to reach these targets from the previous state */
  durationSeconds: number
  /** Optional easing curve name */
  easing?: 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear' | 'bounce'
}

/**
 * Complete emotion animation preset.
 * Can be a single static pose (targets only) or a multi-step
 * keyframed animation sequence.
 */
export interface EmotionPreset {
  /** Human-readable label for debug/UI */
  label: string
  /** How long (seconds) the emotion holds before decaying to neutral */
  holdDurationSeconds: number
  /** How long (seconds) the decay transition to neutral takes */
  decayDurationSeconds: number
  /**
   * Animation keyframes. If only one keyframe, the emotion is a static pose.
   * Multiple keyframes create a sequence (e.g., surprise jolt → settle).
   */
  keyframes: EmotionKeyframe[]
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const NEUTRAL_TARGETS: EmotionParameterTargets = {
  angleX: 0,
  angleY: 0,
  angleZ: 0,
  leftEyeOpen: 1,
  rightEyeOpen: 1,
  leftEyeSmile: 0,
  rightEyeSmile: 0,
  leftEyebrowY: 0,
  rightEyebrowY: 0,
  leftEyebrowAngle: 0,
  rightEyebrowAngle: 0,
  leftEyebrowForm: 0,
  rightEyebrowForm: 0,
  mouthOpen: 0,
  mouthForm: 0,
  cheek: 0,
  bodyAngleX: 0,
  bodyAngleY: 0,
  bodyAngleZ: 0,
  breath: 0,
}

export const EMOTION_PRESETS: Record<string, EmotionPreset> = {
  happy: {
    label: 'Happy',
    holdDurationSeconds: 3,
    decayDurationSeconds: 1.5,
    keyframes: [
      {
        durationSeconds: 0.3,
        easing: 'ease-out',
        targets: {
          // Face: big smile and squinted happy eyes
          leftEyeSmile: 1,
          rightEyeSmile: 1,
          leftEyeOpen: 0.5,
          rightEyeOpen: 0.5,
          mouthForm: 1,
          mouthOpen: 0.5,
          cheek: 1,
          leftEyebrowY: 0.8,
          rightEyebrowY: 0.8,
          leftEyebrowAngle: 0.5,
          rightEyebrowAngle: 0.5,
          // Body: MAJOR happy tilt and bounce
          angleX: 20,
          angleZ: -20,
          bodyAngleX: 10,
          bodyAngleY: 5,
          breath: 1,
        },
      },
      {
        durationSeconds: 0.4,
        easing: 'bounce',
        targets: {
          // Settle into a happy idle
          leftEyeSmile: 0.8,
          rightEyeSmile: 0.8,
          leftEyeOpen: 0.8,
          rightEyeOpen: 0.8,
          mouthForm: 0.8,
          mouthOpen: 0.1,
          cheek: 0.7,
          leftEyebrowY: 0.3,
          rightEyebrowY: 0.3,
          angleX: 10,
          angleZ: -10,
          bodyAngleX: 5,
          bodyAngleY: 2,
          breath: 0.6,
        },
      },
    ],
  },

  sad: {
    label: 'Sad',
    holdDurationSeconds: 4,
    decayDurationSeconds: 2,
    keyframes: [
      {
        durationSeconds: 0.6,
        easing: 'ease-in-out',
        targets: {
          // Face: drooping eyes, down eyebrows, frown
          leftEyeOpen: 0.5,
          rightEyeOpen: 0.5,
          leftEyeSmile: 0,
          rightEyeSmile: 0,
          leftEyebrowY: -0.5,
          rightEyebrowY: -0.5,
          leftEyebrowAngle: -0.4,
          rightEyebrowAngle: -0.4,
          mouthForm: -0.5,
          mouthOpen: 0,
          cheek: 0,
          // Body: head drops, body sinks
          angleY: 10,
          angleZ: 3,
          bodyAngleY: 5,
          bodyAngleX: -2,
          breath: 0.2,
        },
      },
    ],
  },

  angry: {
    label: 'Angry',
    holdDurationSeconds: 3,
    decayDurationSeconds: 1.5,
    keyframes: [
      {
        durationSeconds: 0.15,
        easing: 'ease-out',
        targets: {
          // Face: furrowed brows, narrowed eyes, tight mouth
          leftEyeOpen: 0.6,
          rightEyeOpen: 0.6,
          leftEyeSmile: 0,
          rightEyeSmile: 0,
          leftEyebrowY: -0.6,
          rightEyebrowY: -0.6,
          leftEyebrowAngle: -0.7,
          rightEyebrowAngle: -0.7,
          leftEyebrowForm: -0.5,
          rightEyebrowForm: -0.5,
          mouthForm: -0.6,
          mouthOpen: 0.2,
          cheek: 0,
          // Body: lean forward aggressively
          angleX: -3,
          angleY: -5,
          bodyAngleX: -5,
          bodyAngleY: -8,
          breath: 1,
        },
      },
      {
        // Quick shake
        durationSeconds: 0.15,
        easing: 'linear',
        targets: {
          angleX: 5,
          angleY: -5,
          bodyAngleX: 3,
          leftEyeOpen: 0.5,
          rightEyeOpen: 0.5,
          leftEyebrowY: -0.7,
          rightEyebrowY: -0.7,
          leftEyebrowAngle: -0.8,
          rightEyebrowAngle: -0.8,
          mouthForm: -0.7,
          mouthOpen: 0.3,
          breath: 1,
        },
      },
      {
        // Settle into angry glare
        durationSeconds: 0.3,
        easing: 'ease-in-out',
        targets: {
          angleX: 0,
          angleY: -3,
          bodyAngleX: -2,
          bodyAngleY: -4,
          leftEyeOpen: 0.6,
          rightEyeOpen: 0.6,
          leftEyebrowY: -0.5,
          rightEyebrowY: -0.5,
          leftEyebrowAngle: -0.6,
          rightEyebrowAngle: -0.6,
          leftEyebrowForm: -0.4,
          rightEyebrowForm: -0.4,
          mouthForm: -0.5,
          mouthOpen: 0.1,
          breath: 0.7,
        },
      },
    ],
  },

  think: {
    label: 'Think',
    holdDurationSeconds: 4,
    decayDurationSeconds: 1.5,
    keyframes: [
      {
        durationSeconds: 0.5,
        easing: 'ease-in-out',
        targets: {
          // Face: look up-right, one eyebrow raised
          leftEyeOpen: 0.85,
          rightEyeOpen: 0.85,
          leftEyeSmile: 0,
          rightEyeSmile: 0,
          leftEyebrowY: 0.8,
          rightEyebrowY: -0.5,
          leftEyebrowAngle: 0.5,
          rightEyebrowAngle: -0.2,
          mouthForm: 0.1,
          mouthOpen: 0,
          cheek: 0,
          // Body: MAJOR head tilt
          angleX: -25,
          angleY: -15,
          angleZ: 15,
          bodyAngleX: -10,
          breath: 0.3,
        },
      },
    ],
  },

  surprised: {
    label: 'Surprise',
    holdDurationSeconds: 2.5,
    decayDurationSeconds: 1,
    keyframes: [
      {
        // Initial jolt
        durationSeconds: 0.1,
        easing: 'ease-out',
        targets: {
          // Face: eyes wide, eyebrows up, mouth open
          leftEyeOpen: 1,
          rightEyeOpen: 1,
          leftEyeSmile: 0,
          rightEyeSmile: 0,
          leftEyebrowY: 1,
          rightEyebrowY: 1,
          leftEyebrowAngle: 0.5,
          rightEyebrowAngle: 0.5,
          mouthOpen: 0.8,
          mouthForm: 0,
          cheek: 0,
          // Body: jolt back
          angleY: -8,
          bodyAngleY: -10,
          bodyAngleX: 2,
          breath: 1,
        },
      },
      {
        // Settle with wide eyes
        durationSeconds: 0.4,
        easing: 'bounce',
        targets: {
          leftEyeOpen: 1,
          rightEyeOpen: 1,
          leftEyebrowY: 0.7,
          rightEyebrowY: 0.7,
          leftEyebrowAngle: 0.3,
          rightEyebrowAngle: 0.3,
          mouthOpen: 0.4,
          mouthForm: 0.1,
          angleY: -3,
          bodyAngleY: -4,
          bodyAngleX: 0,
          breath: 0.6,
        },
      },
    ],
  },

  curious: {
    label: 'Curious',
    holdDurationSeconds: 3.5,
    decayDurationSeconds: 1.5,
    keyframes: [
      {
        durationSeconds: 0.4,
        easing: 'ease-in-out',
        targets: {
          // Face: eyes slightly wide, one eyebrow up
          leftEyeOpen: 0.95,
          rightEyeOpen: 0.95,
          leftEyeSmile: 0,
          rightEyeSmile: 0,
          leftEyebrowY: 0.5,
          rightEyebrowY: 0.1,
          leftEyebrowAngle: 0.2,
          rightEyebrowAngle: 0,
          mouthForm: 0.2,
          mouthOpen: 0.1,
          cheek: 0,
          // Body: lean in, head tilt
          angleX: 8,
          angleZ: -5,
          bodyAngleX: 3,
          bodyAngleY: -5,
          breath: 0.4,
        },
      },
    ],
  },

  awkward: {
    label: 'Awkward',
    holdDurationSeconds: 3,
    decayDurationSeconds: 1.5,
    keyframes: [
      {
        durationSeconds: 0.3,
        easing: 'ease-in-out',
        targets: {
          // Face: half-smile, shifty eyes
          leftEyeOpen: 0.75,
          rightEyeOpen: 0.85,
          leftEyeSmile: 0.3,
          rightEyeSmile: 0.1,
          leftEyebrowY: 0.2,
          rightEyebrowY: -0.1,
          leftEyebrowAngle: 0.1,
          rightEyebrowAngle: -0.1,
          mouthForm: 0.3,
          mouthOpen: 0.05,
          cheek: 0.4,
          // Body: slight sway
          angleX: -6,
          angleZ: 3,
          bodyAngleX: -3,
          bodyAngleZ: 2,
          breath: 0.3,
        },
      },
      {
        // Sway to other side
        durationSeconds: 0.5,
        easing: 'ease-in-out',
        targets: {
          leftEyeOpen: 0.8,
          rightEyeOpen: 0.75,
          angleX: 4,
          angleZ: -2,
          bodyAngleX: 2,
          bodyAngleZ: -1,
          mouthForm: 0.2,
          cheek: 0.3,
          breath: 0.3,
        },
      },
    ],
  },

  neutral: {
    label: 'Neutral',
    holdDurationSeconds: 0,
    decayDurationSeconds: 0.8,
    keyframes: [
      {
        durationSeconds: 0.5,
        easing: 'ease-in-out',
        targets: NEUTRAL_TARGETS,
      },
    ],
  },

  question: {
    label: 'Question',
    holdDurationSeconds: 3,
    decayDurationSeconds: 1.5,
    keyframes: [
      {
        durationSeconds: 0.35,
        easing: 'ease-out',
        targets: {
          // Face: one eyebrow raised, slight squint
          leftEyeOpen: 0.9,
          rightEyeOpen: 0.8,
          leftEyebrowY: 0.7,
          rightEyebrowY: -0.1,
          leftEyebrowAngle: 0.4,
          rightEyebrowAngle: -0.1,
          mouthForm: 0.1,
          mouthOpen: 0.15,
          cheek: 0,
          // Body: slight tilt
          angleX: 7,
          angleZ: -4,
          bodyAngleX: 3,
          breath: 0.35,
        },
      },
    ],
  },
}

/** Get a preset by emotion name, falling back to neutral */
export function getEmotionPreset(emotionName: string): EmotionPreset {
  return EMOTION_PRESETS[emotionName.toLowerCase()] ?? EMOTION_PRESETS.neutral!
}

/** Get the neutral parameter targets (used for decay) */
export function getNeutralTargets(): EmotionParameterTargets {
  return { ...NEUTRAL_TARGETS }
}
