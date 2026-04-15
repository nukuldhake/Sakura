<script setup lang="ts">
import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-sakura/stage-ui/components'
import { useSpeechStore } from '@proj-sakura/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-sakura/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'

const providerId = 'puter-elevenlabs'
const defaultModel = 'eleven_multilingual_v2'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  return await speechStore.speech(
    provider as any,
    defaultModel,
    input,
    voiceId,
    {},
  )
}

watch(providers, async () => {
  await speechStore.loadVoicesForProvider(providerId)
}, { immediate: true })
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="true"
        default-text="Hello! This is a test of ElevenLabs via Puter.js."
      />
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>

