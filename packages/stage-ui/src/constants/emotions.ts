export enum Emotion {
  Happy = 'happy',
  Sad = 'sad',
  Angry = 'angry',
  Think = 'think',
  Surprise = 'surprised',
  Awkward = 'awkward',
  Question = 'question',
  Curious = 'curious',
  Neutral = 'neutral',
  Excited = 'excited',
  Relieved = 'relieved',
  Confused = 'confused',
}

export const EMOTION_VALUES = Object.values(Emotion)

export const EmotionHappyMotionName = 'Tap'
export const EmotionSadMotionName = 'FlickDown'
export const EmotionAngryMotionName = 'Flick'
export const EmotionAwkwardMotionName = 'Tap@Body'
export const EmotionThinkMotionName = 'FlickDown'
export const EmotionSurpriseMotionName = 'FlickUp'
export const EmotionQuestionMotionName = 'FlickUp'
export const EmotionNeutralMotionName = 'Idle'
export const EmotionCuriousMotionName = 'Flick'
export const EmotionExcitedMotionName = 'Tap'
export const EmotionRelievedMotionName = 'Idle'
export const EmotionConfusedMotionName = 'FlickUp'

export const EMOTION_EmotionMotionName_value = {
  [Emotion.Happy]: EmotionHappyMotionName,
  [Emotion.Sad]: EmotionSadMotionName,
  [Emotion.Angry]: EmotionAngryMotionName,
  [Emotion.Think]: EmotionThinkMotionName,
  [Emotion.Surprise]: EmotionSurpriseMotionName,
  [Emotion.Awkward]: EmotionAwkwardMotionName,
  [Emotion.Question]: EmotionQuestionMotionName,
  [Emotion.Neutral]: EmotionNeutralMotionName,
  [Emotion.Curious]: EmotionCuriousMotionName,
  [Emotion.Excited]: EmotionExcitedMotionName,
  [Emotion.Relieved]: EmotionRelievedMotionName,
  [Emotion.Confused]: EmotionConfusedMotionName,
}

export const EMOTION_VRMExpressionName_value = {
  [Emotion.Happy]: 'happy',
  [Emotion.Sad]: 'sad',
  [Emotion.Angry]: 'angry',
  [Emotion.Think]: 'think',
  [Emotion.Surprise]: 'surprised',
  [Emotion.Awkward]: 'awkward',
  [Emotion.Question]: undefined,
  [Emotion.Neutral]: undefined,
  [Emotion.Curious]: 'curious',
  [Emotion.Excited]: 'excited',
  [Emotion.Relieved]: 'relieved',
  [Emotion.Confused]: 'confused',
} satisfies Record<Emotion, string | undefined>

export interface EmotionPayload {
  name: Emotion
  intensity: number
  motion?: string
}
