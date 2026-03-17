import type { Cubism4InternalModel, InternalModel } from 'pixi-live2d-display/cubism4'
import type { Ref } from 'vue'

import type { EmotionAnimator } from './emotion-animator'

import { useLive2DIdleEyeFocus } from './animation'

type CubismModel = Cubism4InternalModel['coreModel']
type CubismEyeBlink = Cubism4InternalModel['eyeBlink']

export type PixiLive2DInternalModel = InternalModel & {
  eyeBlink?: CubismEyeBlink
  coreModel: CubismModel
}

export interface MotionManagerUpdateContext {
  model: CubismModel
  now: number
  timeDelta: number
  hookedUpdate?: (model: CubismModel, now: number) => boolean
}

export type MotionManagerPluginContext = MotionManagerUpdateContext & {
  internalModel: PixiLive2DInternalModel
  motionManager: PixiLive2DInternalModel['motionManager']
  modelParameters: Ref<any>
  live2dIdleAnimationEnabled: Ref<boolean>
  live2dAutoBlinkEnabled: Ref<boolean>
  live2dForceAutoBlinkEnabled: Ref<boolean>
  isIdleMotion: boolean
  handled: boolean
  markHandled: () => void
}

export type MotionManagerPlugin = (ctx: MotionManagerPluginContext) => void

export interface UseLive2DMotionManagerUpdateOptions {
  internalModel: PixiLive2DInternalModel
  motionManager: PixiLive2DInternalModel['motionManager']
  modelParameters: Ref<any>
  live2dIdleAnimationEnabled: Ref<boolean>
  live2dAutoBlinkEnabled: Ref<boolean>
  live2dForceAutoBlinkEnabled: Ref<boolean>
  lastUpdateTime: Ref<number>
}

export function useLive2DMotionManagerUpdate(options: UseLive2DMotionManagerUpdateOptions) {
  const {
    internalModel,
    motionManager,
    modelParameters,
    live2dIdleAnimationEnabled,
    live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled,
    lastUpdateTime,
  } = options

  const prePlugins: MotionManagerPlugin[] = []
  const postPlugins: MotionManagerPlugin[] = []

  function register(plugin: MotionManagerPlugin, stage: 'pre' | 'post' = 'pre') {
    if (stage === 'pre')
      prePlugins.push(plugin)
    else
      postPlugins.push(plugin)
  }

  function runPlugins(plugins: MotionManagerPlugin[], ctx: MotionManagerPluginContext, force: boolean = false) {
    for (const plugin of plugins) {
      if (ctx.handled && !force)
        break
      plugin(ctx)
    }
  }

  function hookUpdate(model: CubismModel, now: number, hookedUpdate?: (model: CubismModel, now: number) => boolean) {
    const timeDelta = lastUpdateTime.value ? now - lastUpdateTime.value : 0
    const selectedMotionGroup = localStorage.getItem('selected-runtime-motion-group')
    const isIdleMotion = !motionManager.state.currentGroup
      || motionManager.state.currentGroup === motionManager.groups.idle
      || (!!selectedMotionGroup && motionManager.state.currentGroup === selectedMotionGroup)

    const ctx: MotionManagerPluginContext = {
      model,
      now,
      timeDelta,
      hookedUpdate,
      internalModel,
      motionManager,
      modelParameters,
      live2dIdleAnimationEnabled,
      live2dAutoBlinkEnabled,
      live2dForceAutoBlinkEnabled,
      isIdleMotion,
      handled: false,
      markHandled: () => {
        ctx.handled = true
      },
    }

    runPlugins(prePlugins, ctx)

    if (!ctx.handled && ctx.hookedUpdate) {
      const result = ctx.hookedUpdate.call(motionManager, model, now)
      if (result)
        ctx.handled = true
    }

    // Emotion animation should run even if a motion is playing (it layers on top)
    runPlugins(postPlugins, ctx, true)

    lastUpdateTime.value = now
    return ctx.handled
  }

  return {
    register,
    hookUpdate,
  }
}

// -- Plugins ---------------------------------------------------------------

export function useMotionUpdatePluginIdleDisable(idleEyeFocus = useLive2DIdleEyeFocus()): MotionManagerPlugin {
  return (ctx) => {
    if (ctx.handled)
      return

    // Stop idle motions if they're disabled
    if (!ctx.live2dIdleAnimationEnabled.value && ctx.isIdleMotion) {
      ctx.motionManager.stopAllMotions()

      // Still update eye focus and blink even if idle motion is stopped
      idleEyeFocus.update(ctx.internalModel, ctx.now)
      if (ctx.internalModel.eyeBlink != null) {
        ctx.internalModel.eyeBlink.updateParameters(ctx.model, ctx.timeDelta / 1000)
      }

      // Apply manual eye parameters after auto eye blink
      ctx.model.setParameterValueById('ParamEyeLOpen', ctx.modelParameters.value.leftEyeOpen)
      ctx.model.setParameterValueById('ParamEyeROpen', ctx.modelParameters.value.rightEyeOpen)

      ctx.markHandled()
    }
  }
}

export function useMotionUpdatePluginIdleFocus(idleEyeFocus = useLive2DIdleEyeFocus()): MotionManagerPlugin {
  return (ctx) => {
    if (!ctx.isIdleMotion || ctx.handled)
      return

    idleEyeFocus.update(ctx.internalModel, ctx.now)
  }
}

export function useMotionUpdatePluginAutoEyeBlink(): MotionManagerPlugin {
  const blinkState = {
    phase: 'idle' as 'idle' | 'closing' | 'opening',
    progress: 0,
    startLeft: 1,
    startRight: 1,
    delayMs: 0,
  }
  const blinkCloseDuration = 200 // ms
  const blinkOpenDuration = 200 // ms
  const minDelay = 3000
  const maxDelay = 8000

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

  function resetBlinkState() {
    blinkState.phase = 'idle'
    blinkState.progress = 0
    blinkState.delayMs = minDelay + Math.random() * (maxDelay - minDelay)
  }
  resetBlinkState()

  function easeOutQuad(t: number) {
    return 1 - (1 - t) * (1 - t)
  }
  function easeInQuad(t: number) {
    return t * t
  }

  function updateForcedBlink(dt: number, baseLeft: number, baseRight: number) {
    // Idle: count down delay to next blink.
    if (blinkState.phase === 'idle') {
      blinkState.delayMs = Math.max(0, blinkState.delayMs - dt)
      if (blinkState.delayMs === 0) {
        blinkState.phase = 'closing'
        blinkState.progress = 0
        blinkState.startLeft = baseLeft
        blinkState.startRight = baseRight
      }

      return { eyeLOpen: baseLeft, eyeROpen: baseRight }
    }

    // Closing: move toward zero with ease-out.
    if (blinkState.phase === 'closing') {
      blinkState.progress = Math.min(1, blinkState.progress + dt / blinkCloseDuration)
      const eased = easeOutQuad(blinkState.progress)
      const eyeLOpen = clamp01(blinkState.startLeft * (1 - eased))
      const eyeROpen = clamp01(blinkState.startRight * (1 - eased))

      if (blinkState.progress >= 1) {
        blinkState.phase = 'opening'
        blinkState.progress = 0
      }

      return { eyeLOpen, eyeROpen }
    }

    // Opening: move back to the base with ease-in.
    blinkState.progress = Math.min(1, blinkState.progress + dt / blinkOpenDuration)
    const eased = easeInQuad(blinkState.progress)
    const eyeLOpen = clamp01(blinkState.startLeft * eased)
    const eyeROpen = clamp01(blinkState.startRight * eased)

    if (blinkState.progress >= 1) {
      resetBlinkState()
    }

    return { eyeLOpen, eyeROpen }
  }

  return (ctx) => {
    // Possibility 1: Only update eye focus when the model is idle
    // Possibility 2: For models having no motion groups, currentGroup will be undefined while groups can be { idle: ... }
    if (!ctx.isIdleMotion || ctx.handled)
      return

    const baseLeft = clamp01(ctx.modelParameters.value.leftEyeOpen)
    const baseRight = clamp01(ctx.modelParameters.value.rightEyeOpen)

    // If the user disabled auto blink entirely, keep manual values and bail. Reset state so re-enabling starts fresh.
    if (!ctx.live2dAutoBlinkEnabled.value) {
      resetBlinkState()
      ctx.model.setParameterValueById('ParamEyeLOpen', baseLeft)
      ctx.model.setParameterValueById('ParamEyeROpen', baseRight)
      ctx.markHandled()
      return
    }

    // Option 1: Force auto blink via our own timer (for models without eyeBlink or when forced in settings).
    if (ctx.live2dForceAutoBlinkEnabled.value || !ctx.internalModel.eyeBlink) {
      // timeDelta can be seconds or milliseconds depending on source; normalize to ms.
      const rawDelta = Math.max(ctx.timeDelta ?? 0, 0)
      const dt = rawDelta < 5 ? rawDelta * 1000 : rawDelta // If less than 5, treat as seconds (e.g., 0.016s -> 16ms).
      const safeDt = dt || 16 // Fallback to ~1 frame to avoid getting stuck when timeDelta is 0 on first tick.

      const { eyeLOpen, eyeROpen } = updateForcedBlink(safeDt, baseLeft, baseRight)

      ctx.model.setParameterValueById('ParamEyeLOpen', eyeLOpen)
      ctx.model.setParameterValueById('ParamEyeROpen', eyeROpen)
      ctx.markHandled()
      return
    }

    // Option 2: Let Cubism drive the blink, but scale it with the user-provided base.
    // If the model has eye blink parameters
    if (ctx.internalModel.eyeBlink != null) {
      // For the part of the auto eye blink implementation in pixi-live2d-display
      //
      // this.emit("beforeMotionUpdate");
      // const motionUpdated = this.motionManager.update(this.coreModel, now);
      // this.emit("afterMotionUpdate");
      // model.saveParameters();
      // this.motionManager.expressionManager?.update(model, now);
      // if (!motionUpdated) {
      //   this.eyeBlink?.updateParameters(model, dt);
      // }
      //
      // https://github.com/guansss/pixi-live2d-display/blob/31317b37d5e22955a44d5b11f37f421e94a11269/src/cubism4/Cubism4InternalModel.ts#L202-L214
      //
      // If the this.motionManager.update returns true, as motion updated flag on,
      // the eye blink parameters will not be updated, in another hand, the auto eye blink is disabled
      //
      // Since we are hooking the motionManager.update method currently,
      // and previously a always `true` was returned, eye blink parameters were never updated.
      //
      // Thous we are here to manually update the eye blink parameters within this hooked method
      ctx.internalModel.eyeBlink.updateParameters(ctx.model, ctx.timeDelta / 1000)
    }

    // Apply manual eye parameters after auto eye blink
    const blinkLeft = ctx.model.getParameterValueById('ParamEyeLOpen') as number
    const blinkRight = ctx.model.getParameterValueById('ParamEyeROpen') as number

    ctx.model.setParameterValueById('ParamEyeLOpen', clamp01(blinkLeft * baseLeft))
    ctx.model.setParameterValueById('ParamEyeROpen', clamp01(blinkRight * baseRight))

    ctx.markHandled()
  }
}

/**
 * Motion manager plugin that applies parameter-based emotion animations.
 * Reads parameter targets from the emotion animator each frame and applies
 * them to the model. Runs as a 'post' plugin so it layers on top of
 * idle motions, eye blink, and beat sync.
 */
export function useMotionUpdatePluginEmotionAnimation(animator: EmotionAnimator): MotionManagerPlugin {
  // Map from our internal parameter names to Live2D parameter IDs
  const PARAM_MAP: Record<string, string> = {
    angleX: 'ParamAngleX',
    angleY: 'ParamAngleY',
    angleZ: 'ParamAngleZ',
    leftEyeOpen: 'ParamEyeLOpen',
    rightEyeOpen: 'ParamEyeROpen',
    leftEyeSmile: 'ParamEyeLSmile',
    rightEyeSmile: 'ParamEyeRSmile',
    leftEyebrowLR: 'ParamBrowLX',
    rightEyebrowLR: 'ParamBrowRX',
    leftEyebrowY: 'ParamBrowLY',
    rightEyebrowY: 'ParamBrowRY',
    leftEyebrowAngle: 'ParamBrowLAngle',
    rightEyebrowAngle: 'ParamBrowRAngle',
    leftEyebrowForm: 'ParamBrowLForm',
    rightEyebrowForm: 'ParamBrowRForm',
    mouthOpen: 'ParamMouthOpenY',
    mouthForm: 'ParamMouthForm',
    cheek: 'ParamCheek',
    bodyAngleX: 'ParamBodyAngleX',
    bodyAngleY: 'ParamBodyAngleY',
    bodyAngleZ: 'ParamBodyAngleZ',
    breath: 'ParamBreath',
  }

  return (ctx) => {
    if (!animator.isActive())
      return

    // Convert timeDelta to seconds (timeDelta can be in seconds or ms)
    const rawDelta = Math.max(ctx.timeDelta ?? 0, 0)
    const dt = rawDelta < 5 ? rawDelta : rawDelta / 1000

    const targets = animator.update(dt)
    if (!targets)
      return

    // Apply each animated parameter to the model
    for (const [key, value] of Object.entries(targets)) {
      const paramId = PARAM_MAP[key]
      if (paramId && value !== undefined) {
        ctx.model.setParameterValueById(paramId, value)
      }
    }
  }
}
