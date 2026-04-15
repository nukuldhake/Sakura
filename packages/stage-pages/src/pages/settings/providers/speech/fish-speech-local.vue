<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  SpeechPlaygroundOpenAICompatible,
  SpeechProviderSettings,
} from '@proj-sakura/stage-ui/components'
import { useProviderValidation } from '@proj-sakura/stage-ui/composables/use-provider-validation'
import { useSpeechStore } from '@proj-sakura/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-sakura/stage-ui/stores/providers'
import { FieldInput, FieldRange } from '@proj-sakura/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

// Default settings optimized for Fish-Speech
const defaultVoiceSettings = {
  speed: 1.0,
}

const providerId = 'fish-speech-local'
const defaultModel = 'fish-speech-1.5'

const speed = ref<number>(
  (providers.value[providerId] as any)?.voiceSettings?.speed
  || (providers.value[providerId] as any)?.speed
  || defaultVoiceSettings.speed,
)

const model = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

const voice = computed({
  get: () => providers.value[providerId]?.voice || 'default',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].voice = value
  },
})

// Watch provider config changes
watch(
  () => providers.value[providerId],
  (newConfig) => {
    if (newConfig) {
      const config = newConfig as any
      const newSpeed = config.voiceSettings?.speed || config.speed || defaultVoiceSettings.speed
      if (Math.abs(speed.value - newSpeed) > 0.001)
        speed.value = newSpeed
      
      if (!config.model && model.value !== defaultModel)
        model.value = defaultModel
    }
  },
  { deep: true, immediate: true },
)

onMounted(async () => {
  if (!providers.value[providerId]) {
    providers.value[providerId] = {}
  }
  if (!providers.value[providerId].model) {
    providers.value[providerId].model = defaultModel
  }
  if (!providers.value[providerId].baseUrl) {
    providers.value[providerId].baseUrl = 'http://127.0.0.1:8080/v1/'
  }
  
  // Auto-load voices if server is already running
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean, modelId?: string) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize local Fish-Speech provider')
  }

  const providerConfig = providersStore.getProviderConfig(providerId)
  const modelToUse = modelId || model.value || defaultModel

  return await speechStore.speech(
    provider,
    modelToUse,
    input,
    voiceId || (voice.value as string),
    {
      ...providerConfig,
      speed: speed.value,
    },
  )
}

watch(speed, async () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId].speed = speed.value
})

const {
  isValidating,
  isValid,
  validationMessage,
  forceValid,
} = useProviderValidation(providerId)
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
    placeholder="http://127.0.0.1:8080/v1/"
  >
    <template #voice-settings>
      <FieldInput
        v-model="model"
        label="Model ID"
        description="Model ID for Fish-Speech (e.g., fish-speech-1.5)"
        placeholder="fish-speech-1.5"
      />
      <FieldRange
        v-model="speed"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.5"
        :max="2.0" 
        :step="0.01"
      />

      <!-- Quick Presets -->
      <div class="mt-4 flex flex-col gap-2">
        <div class="text-xs font-medium opacity-60">Quick Persona Presets</div>
        <div class="flex flex-wrap gap-2">
          <button 
            class="rounded-lg bg-pink-500/20 px-3 py-1.5 text-xs text-pink-600 border border-solid border-pink-500/30 hover:bg-pink-500/30 transition-all dark:text-pink-400"
            @click="() => { voice = 'egirl_energetic_01'; speed = 1.15; }"
          >
            🎀 Energetic E-girl
          </button>
          <button 
            class="rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs text-purple-600 border border-solid border-purple-500/30 hover:bg-purple-500/30 transition-all dark:text-purple-400"
            @click="() => { voice = 'anime_kawaii_01'; speed = 1.05; }"
          >
            ✨ Kawaii Anime
          </button>
          <button 
            class="rounded-lg bg-neutral-500/20 px-3 py-1.5 text-xs text-neutral-600 border border-solid border-neutral-500/30 hover:bg-neutral-500/30 transition-all dark:text-neutral-400"
            @click="() => { voice = 'default'; speed = 1.0; }"
          >
            Default
          </button>
        </div>
      </div>
    </template>

    <template #playground>
      <div class="mb-4">
        <Alert type="success" class="mb-4">
          <template #title>Local Server Setup</template>
          <template #content>
            <div class="text-xs opacity-80">
              To use Fish-Speech locally, start the API server with the following command:
              <pre class="mt-2 bg-black/20 p-2 rounded overflow-x-auto font-mono">python -m tools.api_server --listen 127.0.0.1:8080 --api</pre>
              <p class="mt-2 text-xs italic opacity-60">Note: Ensure you have the <code class="bg-black/20 px-1 rounded">fish-speech</code> environment active.</p>
            </div>
          </template>
        </Alert>

        <Alert type="info">
          <template #title>Hardware Optimization Tips</template>
          <template #content>
            <ul class="list-disc pl-4 text-xs opacity-80">
              <li>Low VRAM: Start with <code class="bg-black/20 px-1 rounded">--precision fp16</code> or <code class="bg-black/20 px-1 rounded">--precision int8</code></li>
              <li>Speed: Enable <code class="bg-black/20 px-1 rounded">--compile</code> (Linux) or ensure <code class="bg-black/20 px-1 rounded">Flash Attention</code> is installed.</li>
              <li>Latency: Use a local IP (127.0.0.1) instead of localhost for slightly better handshake speed on some systems.</li>
            </ul>
          </template>
        </Alert>
      </div>

      <SpeechPlaygroundOpenAICompatible
        v-model:model-value="model"
        v-model:voice="voice as any"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="true"
        default-text="Hello! This is an optimized local test of Fish-Speech."
      />
    </template>

    <template #advanced-settings>
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
              @click="forceValid"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
        </template>
        <template v-if="validationMessage" #content>
          <div class="whitespace-pre-wrap break-all opacity-80">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>

