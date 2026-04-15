<script setup lang="ts">
import { defineInvokeHandler } from '@moeru/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-sakura/electron-vueuse'
import { themeColorFromValue, useThemeColor } from '@proj-sakura/stage-layouts/composables/theme-color'
import { ToasterRoot } from '@proj-sakura/stage-ui/components'
import { useSharedAnalyticsStore } from '@proj-sakura/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@proj-sakura/stage-ui/stores/character'
import { useChatSessionStore } from '@proj-sakura/stage-ui/stores/chat/session-store'
import { usePluginHostInspectorStore } from '@proj-sakura/stage-ui/stores/devtools/plugin-host-debug'
import { useDisplayModelsStore } from '@proj-sakura/stage-ui/stores/display-models'
import { useContextBridgeStore } from '@proj-sakura/stage-ui/stores/mods/api/context-bridge'
import { useSAKURACardStore } from '@proj-sakura/stage-ui/stores/modules/SAKURA-card'
import { useSpeechStore } from '@proj-sakura/stage-ui/stores/modules/speech'
import { useOnboardingStore } from '@proj-sakura/stage-ui/stores/onboarding'
import { usePerfTracerBridgeStore } from '@proj-sakura/stage-ui/stores/perf-tracer-bridge'
import { listProvidersForPluginHost, shouldPublishPluginHostCapabilities } from '@proj-sakura/stage-ui/stores/plugin-host-capabilities'
import { useSettings } from '@proj-sakura/stage-ui/stores/settings'
import { useTheme } from '@proj-sakura/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import ResizeHandler from './components/ResizeHandler.vue'

import {
  electronGetServerChannelConfig,
  electronOpenSettings,
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginSetEnabled,
  electronPluginUnload,
  electronPluginUpdateCapability,
  electronStartTrackMousePosition,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../shared/eventa'
import { useServerChannelSettingsStore } from './stores/settings/server-channel'

const { isDark: dark } = useTheme()
const i18n = useI18n()
const contextBridgeStore = useContextBridgeStore()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)
const serverChannelSettingsStore = useServerChannelSettingsStore()
const onboardingStore = useOnboardingStore()
const router = useRouter()
const route = useRoute()
const cardStore = useSAKURACardStore()
const chatSessionStore = useChatSessionStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const speechStore = useSpeechStore()
const analyticsStore = useSharedAnalyticsStore()
const pluginHostInspectorStore = usePluginHostInspectorStore()
usePerfTracerBridgeStore()

watch(language, () => {
  i18n.locale.value = language.value
})

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

onMounted(async () => {
  const context = useElectronEventaContext()
  const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
  const listPlugins = useElectronEventaInvoke(electronPluginList)
  const setPluginEnabled = useElectronEventaInvoke(electronPluginSetEnabled)
  const loadEnabledPlugins = useElectronEventaInvoke(electronPluginLoadEnabled)
  const loadPlugin = useElectronEventaInvoke(electronPluginLoad)
  const unloadPlugin = useElectronEventaInvoke(electronPluginUnload)
  const inspectPluginHost = useElectronEventaInvoke(electronPluginInspect)

  // NOTICE: register plugin host bridge before long async startup work so devtools pages can use it immediately.
  pluginHostInspectorStore.setBridge({
    list: () => listPlugins(),
    setEnabled: payload => setPluginEnabled(payload),
    loadEnabled: () => loadEnabledPlugins(),
    load: payload => loadPlugin(payload),
    unload: payload => unloadPlugin(payload),
    inspect: () => inspectPluginHost(),
  })

  analyticsStore.initialize()
  cardStore.initialize()
  speechStore.initialize()
  onboardingStore.initializeSetupCheck()

  await chatSessionStore.initialize()
  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()

  const serverChannelConfig = await getServerChannelConfig()
  serverChannelSettingsStore.websocketTlsConfig = serverChannelConfig.websocketTlsConfig

  await contextBridgeStore.initialize()
  characterOrchestratorStore.initialize()

  const startTrackingCursorPoint = useElectronEventaInvoke(electronStartTrackMousePosition)
  const reportPluginCapability = useElectronEventaInvoke(electronPluginUpdateCapability)
  await startTrackingCursorPoint()

  // Expose stage provider definitions to plugin host APIs.
  defineInvokeHandler(context.value, pluginProtocolListProviders, async () => listProvidersForPluginHost())

  if (shouldPublishPluginHostCapabilities()) {
    await reportPluginCapability({
      key: pluginProtocolListProvidersEventName,
      state: 'ready',
      metadata: {
        source: 'stage-ui',
      },
    })
  }

  // Listen for open-settings IPC message from main process
  defineInvokeHandler(context.value, electronOpenSettings, () => router.push('/settings'))
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

onUnmounted(() => contextBridgeStore.dispose())
</script>

<template>
  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>
  <ResizeHandler />
  <RouterView />
</template>

<style>
/* We need this to properly animate the CSS variable */
@property --chromatic-hue {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

@keyframes hue-anim {
  from {
    --chromatic-hue: 0;
  }
  to {
    --chromatic-hue: 360;
  }
}

.dynamic-hue {
  animation: hue-anim 10s linear infinite;
}
</style>

