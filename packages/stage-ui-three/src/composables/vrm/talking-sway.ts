import type { VRMCore } from '@pixiv/three-vrm-core'

import { Euler, Quaternion } from 'three'

/**
 * Comprehensive procedural body animation for VRM models.
 *
 * Provides four layered animation systems that work together:
 * 1. **Breathing** — Always active. Subtle chest/spine expansion cycle.
 * 2. **Punctuational Accents** — Active during speech. Stochastic head tilts/nods at irregular intervals.
 * 3. **Contextual nods** — Triggered on emotion changes. Small downward head pitch pulse.
 * 4. **Arm gestures** — Active during speech. Periodic forearm/hand movements.
 *
 * All systems use smooth blending to avoid jarring transitions.
 */
export function useVRMTalkingSway() {
  // Accumulated time counters
  let breathTimer = 0

  // Current blend weights
  let gestureBlend = 0

  // --- Accent state (punctuational head movements) ---
  let accentProgress = -1 // -1 = inactive
  let nextAccentDelay = 0
  let accentDuration = 0.5
  let accentType: 'tilt' | 'nod' | 'shift' = 'tilt'
  let accentDirection = 1

  // Nod state (contextual/emotion-based)
  let nodProgress = -1 // -1 = inactive
  const NOD_DURATION = 0.35 // seconds for one nod cycle

  // Gesture cycle state
  let currentGestureSide: 'left' | 'right' = 'right'
  let gesturePhase = 0 // 0..1 progress through current gesture
  let gestureActive = false
  let nextGestureDelay = 0

  // Fade speeds (units/second)
  const GESTURE_FADE_IN = 2.5
  const GESTURE_FADE_OUT = 1.8

  // ---- Breathing parameters ----
  const BREATH_FREQ = 0.25 // Hz (~4s per cycle, natural breathing rate)
  const CHEST_PITCH_AMP = 0.008 // very subtle forward lean on inhale
  const UPPER_CHEST_PITCH_AMP = 0.006
  const SPINE_PITCH_AMP = 0.004

  // ---- Accent parameters (intentional head pulses) ----
  const ACCENT_YAW_AMP = 0.015
  const ACCENT_PITCH_AMP = 0.012
  const ACCENT_ROLL_AMP = 0.008

  // ---- Arm gesture parameters ----
  const UPPER_ARM_PITCH_AMP = 0.18 // forward lift
  const UPPER_ARM_ROLL_AMP = 0.08 // outward spread
  const LOWER_ARM_PITCH_AMP = 0.22 // forearm bend
  const HAND_PITCH_AMP = 0.15 // wrist flick

  // ---- Nod parameters ----
  const NOD_PITCH_AMP = 0.03 // downward pitch for nod

  // Reusable math objects
  const _euler = new Euler()
  const lastRotations = new Map<string, Quaternion>()

  /**
   * Applies a rotation offset to a bone via quaternion multiplication.
   * To prevent infinite accumulation, we undo the previous frame's procedural 
   * rotation before applying the new one.
   */
  function applyRotation(
    vrm: VRMCore,
    boneName: string,
    pitch: number,
    yaw: number,
    roll: number,
  ) {
    const node = vrm.humanoid.getNormalizedBoneNode(boneName as any)
    if (!node)
      return

    // 1. Undo the previous frame's procedural offset
    let last = lastRotations.get(boneName)
    if (last) {
      node.quaternion.multiply(last.clone().conjugate())
    }

    // 2. Calculate and store the new procedural offset
    _euler.set(pitch, yaw, roll)
    if (!last) {
      last = new Quaternion()
      lastRotations.set(boneName, last)
    }
    last.setFromEuler(_euler)

    // 3. Apply the new procedural offset
    node.quaternion.multiply(last)
  }

  /**
   * Easing function for smooth gesture curves.
   * Bell curve: rises then falls over 0..1
   */
  function bellCurve(t: number): number {
    return Math.sin(t * Math.PI)
  }

  /**
   * Main update function. Call every frame in onBeforeRender.
   */
  function update(vrm: VRMCore | undefined, delta: number, speaking: boolean) {
    if (!vrm?.humanoid)
      return

    breathTimer += delta

    // ==========================================
    // 1. BREATHING (always active)
    // ==========================================
    const breathPhase = Math.sin(breathTimer * BREATH_FREQ * Math.PI * 2)
    const breathAmount = (breathPhase + 1) * 0.5

    applyRotation(vrm, 'chest', -CHEST_PITCH_AMP * breathAmount, 0, 0)
    applyRotation(vrm, 'upperChest', -UPPER_CHEST_PITCH_AMP * breathAmount, 0, 0)
    applyRotation(vrm, 'spine', -SPINE_PITCH_AMP * breathAmount, 0, 0)

    // ==========================================
    // 2. PUNCTUATIONAL ACCENTS (during speech)
    // ==========================================
    if (speaking) {
      if (accentProgress < 0) {
        nextAccentDelay -= delta
        if (nextAccentDelay <= 0) {
          accentProgress = 0
          accentDuration = 0.5 + Math.random() * 0.5
          const typeRoll = Math.random()
          if (typeRoll < 0.4) {
            accentType = 'tilt'
          }
          else if (typeRoll < 0.7) {
            accentType = 'nod'
          }
          else {
            accentType = 'shift'
          }
          accentDirection = Math.random() > 0.5 ? 1 : -1
        }
      }

      if (accentProgress >= 0) {
        accentProgress += delta / accentDuration
        if (accentProgress >= 1) {
          accentProgress = -1
          nextAccentDelay = 3.0 + Math.random() * 5.0
        }
        else {
          const power = bellCurve(accentProgress)
          let p = 0
          let y = 0
          let r = 0
          if (accentType === 'tilt') {
            r = ACCENT_ROLL_AMP * power * accentDirection
            y = ACCENT_YAW_AMP * power * 0.3 * accentDirection
          }
          else if (accentType === 'nod') {
            p = ACCENT_PITCH_AMP * power
          }
          else if (accentType === 'shift') {
            y = ACCENT_YAW_AMP * power * accentDirection
          }
          
          applyRotation(vrm, 'head', p, y, r)
        }
      }
    }
    else {
      accentProgress = -1
      applyRotation(vrm, 'head', 0, 0, 0)
    }

    // ==========================================
    // 3. ARM GESTURES (during speech, periodic)
    // ==========================================
    if (speaking) {
      if (!gestureActive) {
        nextGestureDelay -= delta
        if (nextGestureDelay <= 0) {
          gestureActive = true
          gesturePhase = 0
          currentGestureSide = Math.random() > 0.4
            ? (currentGestureSide === 'left' ? 'right' : 'left')
            : currentGestureSide
        }
      }

      if (gestureActive) {
        gestureBlend = Math.min(1, gestureBlend + GESTURE_FADE_IN * delta)
        gesturePhase += delta / 0.8
        if (gesturePhase >= 1) {
          gestureActive = false
          nextGestureDelay = 1.5 + Math.random() * 2.5
          gesturePhase = 0
        }
      }
      else {
        gestureBlend = Math.max(0, gestureBlend - GESTURE_FADE_OUT * delta)
      }
    }
    else {
      gestureBlend = Math.max(0, gestureBlend - GESTURE_FADE_OUT * delta)
      gestureActive = false
      if (gestureBlend < 0.01) {
        ['left', 'right'].forEach((side) => {
          applyRotation(vrm, `${side}UpperArm`, 0, 0, 0)
          applyRotation(vrm, `${side}LowerArm`, 0, 0, 0)
          applyRotation(vrm, `${side}Hand`, 0, 0, 0)
        })
      }
    }

    if (gestureBlend > 0.001) {
      const curve = bellCurve(gesturePhase) * gestureBlend
      const side = currentGestureSide
      const otherSide = side === 'left' ? 'right' : 'left'

      applyRotation(vrm, `${side}UpperArm`, -UPPER_ARM_PITCH_AMP * curve, 0, (side === 'right' ? -1 : 1) * UPPER_ARM_ROLL_AMP * curve)
      applyRotation(vrm, `${side}LowerArm`, -LOWER_ARM_PITCH_AMP * curve, 0, 0)
      applyRotation(vrm, `${side}Hand`, HAND_PITCH_AMP * curve * Math.sin(gesturePhase * Math.PI * 2), 0, 0)

      const sympathetic = curve * 0.2
      applyRotation(vrm, `${otherSide}UpperArm`, -UPPER_ARM_PITCH_AMP * sympathetic, 0, (otherSide === 'right' ? -1 : 1) * UPPER_ARM_ROLL_AMP * sympathetic)
    }

    // ==========================================
    // 4. CONTEXTUAL NOD
    // ==========================================
    if (nodProgress >= 0) {
      nodProgress += delta / NOD_DURATION
      if (nodProgress >= 1) {
        nodProgress = -1
        applyRotation(vrm, 'head', 0, 0, 0)
      }
      else {
        const nodAmount = bellCurve(nodProgress) * NOD_PITCH_AMP
        applyRotation(vrm, 'head', -nodAmount, 0, 0)
      }
    }
  }

  function triggerNod() {
    nodProgress = 0
  }

  return { update, triggerNod }
}
