<script setup lang="ts">
import type { BackgroundProvider } from '@proj-sakura/stage-layouts/components/Backgrounds'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import Header from '@proj-sakura/stage-layouts/components/Layouts/Header.vue'
import InteractiveArea from '@proj-sakura/stage-layouts/components/Layouts/InteractiveArea.vue'
import MobileHeader from '@proj-sakura/stage-layouts/components/Layouts/MobileHeader.vue'
import MobileInteractiveArea from '@proj-sakura/stage-layouts/components/Layouts/MobileInteractiveArea.vue'
import workletUrl from '@proj-sakura/stage-ui/workers/vad/process.worklet?worker&url'

import { useBackgroundThemeColor } from '@proj-sakura/stage-layouts/composables/theme-color'
import { useBackgroundStore } from '@proj-sakura/stage-layouts/stores/background'
import { WidgetStage } from '@proj-sakura/stage-ui/components/scenes'
import { useAudioRecorder } from '@proj-sakura/stage-ui/composables/audio/audio-recorder'
import { useVAD } from '@proj-sakura/stage-ui/stores/ai/models/vad'
import { useChatOrchestratorStore } from '@proj-sakura/stage-ui/stores/chat'
import { useLive2d } from '@proj-sakura/stage-ui/stores/live2d'
import { useConsciousnessStore } from '@proj-sakura/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline } from '@proj-sakura/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-sakura/stage-ui/stores/providers'
import { useSettingsAudioDevice } from '@proj-sakura/stage-ui/stores/settings'
import { breakpointsTailwind, useBreakpoints, useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

const paused = ref(false)

function handleSettingsOpen(open: boolean) {
  paused.value = open
}

const positionCursor = useMouse()
const { scale, position, positionInPercentageString } = storeToRefs(useLive2d())
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

const backgroundStore = useBackgroundStore()
const { selectedOption, sampledColor } = storeToRefs(backgroundStore)
const backgroundSurface = useTemplateRef<InstanceType<typeof BackgroundProvider>>('backgroundSurface')

const { syncBackgroundTheme } = useBackgroundThemeColor({ backgroundSurface, selectedOption, sampledColor })
onMounted(() => syncBackgroundTheme())

// Audio + transcription pipeline (mirrors stage-tamagotchi)
const settingsAudioDeviceStore = useSettingsAudioDevice()
const { stream, enabled } = storeToRefs(settingsAudioDeviceStore)
const { startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)
const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForRecording } = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const { activeProvider: activeChatProvider, activeModel: activeChatModel } = storeToRefs(consciousnessStore)
const chatStore = useChatOrchestratorStore()

const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

const {
  init: initVAD,
  dispose: disposeVAD,
  start: startVAD,
  loaded: vadLoaded,
} = useVAD(workletUrl, {
  threshold: ref(0.6),
  onSpeechStart: () => handleSpeechStart(),
  onSpeechEnd: () => handleSpeechEnd(),
})

let stopOnStopRecord: (() => void) | undefined

async function startAudioInteraction() {
  try {
    await initVAD()
    if (stream.value)
      await startVAD(stream.value)

    // Hook once
    stopOnStopRecord = onStopRecord(async (recording) => {
      const text = await transcribeForRecording(recording)
      if (!text || !text.trim())
        return

      try {
        const provider = await providersStore.getProviderInstance(activeChatProvider.value)
        if (!provider || !activeChatModel.value)
          return

        await chatStore.ingest(text, { model: activeChatModel.value, chatProvider: provider as ChatProvider })
      }
      catch (err) {
        console.error('Failed to send chat from voice:', err)
      }
    })
  }
  catch (e) {
    console.error('Audio interaction init failed:', e)
  }
}

async function handleSpeechStart() {
  // For streaming providers, ChatArea component handles transcription manually
  // The main page should not start automatic transcription to avoid duplicate sessions
  if (shouldUseStreamInput.value) {
    return
  }

  startRecord()
}

async function handleSpeechEnd() {
  if (shouldUseStreamInput.value) {
    // Keep streaming session alive; idle timer in pipeline will handle teardown.
    return
  }

  stopRecord()
}

function stopAudioInteraction() {
  try {
    stopOnStopRecord?.()
    stopOnStopRecord = undefined
    disposeVAD()
  }
  catch {}
}

watch(enabled, async (val) => {
  if (val) {
    await startAudioInteraction()
  }
  else {
    stopAudioInteraction()
  }
}, { immediate: true })

onUnmounted(() => {
  stopAudioInteraction()
})

watch([stream, () => vadLoaded.value], async ([s, loaded]) => {
  if (enabled.value && loaded && s) {
    try {
      await startVAD(s)
    }
    catch (e) {
      console.error('Failed to start VAD with stream:', e)
    }
  }
})
</script>

<template>
  <div class="relative min-h-100dvh w-100vw of-hidden bg-[#e5e5e5] text-black font-black">
    <!-- Neobrutalist background pattern -->
    <div
      class="pointer-events-none absolute inset-0 z-0 opacity-10"
      :style="{ backgroundImage: 'radial-gradient(#000 2px, transparent 0)', backgroundSize: '30px 30px' }"
    />

    <div relative flex="~ col" z-2 h-100dvh w-100vw>
      <!-- header -->
      <div class="p-3 md:p-4" w-full gap-1>
        <Header class="hidden md:flex" />
        <MobileHeader class="flex md:hidden" />
      </div>
      <!-- page -->
      <div relative flex="~ 1 row gap-y-0 gap-x-4 <md:col px-3 md:px-4 pb-4">
        <div :class="['flex-1 min-w-[40%] neo-box bg-white relative overflow-hidden']">
          <WidgetStage
            h-full w-full
            :paused="paused"
            :focus-at="{
              x: positionCursor.x.value,
              y: positionCursor.y.value,
            }"
            :x-offset="`${isMobile ? position.x : position.x - 10}%`"
            :y-offset="positionInPercentageString.y"
            :scale="scale"
          />
          <!-- Decorative Corner -->
          <div class="neo-tag bg-neo-pink absolute right-0 top-0 text-white !px-4 !py-2">
            ACTIVE_SESSION_001
          </div>
        </div>

        <div v-if="!isMobile" :class="['w-full max-w-[650px] min-w-[30%] flex flex-col h-full']">
          <InteractiveArea h-full />
        </div>
        <MobileInteractiveArea v-if="isMobile" @settings-open="handleSettingsOpen" />
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
name: ChatScenePage
meta:
  layout: stage
  stageTransition:
    name: bubble-wave-out
</route>
