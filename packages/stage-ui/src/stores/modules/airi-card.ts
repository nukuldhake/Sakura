import type { Card, ccv3 } from '@proj-airi/ccc'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SystemPromptV2 from '../../constants/prompts/system-v2'

import { useConsciousnessStore } from './consciousness'
import { useSpeechStore } from './speech'

export interface AiriExtension {
  modules: {
    consciousness: {
      provider: string // Example: "openai"
      model: string // Example: "gpt-4o"
    }

    speech: {
      provider: string // Example: "elevenlabs"
      model: string // Example: "eleven_multilingual_v2"
      voice_id: string // Example: "alloy"

      pitch?: number
      rate?: number
      ssml?: boolean
      language?: string
    }

    vrm?: {
      source?: 'file' | 'url'
      file?: string // Example: "vrm/model.vrm"
      url?: string // Example: "https://example.com/vrm/model.vrm"
    }

    live2d?: {
      source?: 'file' | 'url'
      file?: string // Example: "live2d/model.json"
      url?: string // Example: "https://example.com/live2d/model.json"
    }
  }

  agents: {
    [key: string]: { // example: minecraft
      prompt: string
      enabled?: boolean
    }
  }
}

export interface AiriCard extends Card {
  extensions: {
    airi: AiriExtension
  } & Card['extensions']
}

export const useAiriCardStore = defineStore('airi-card', () => {
  const { t } = useI18n()

  const cards = useLocalStorageManualReset<Map<string, AiriCard>>('airi-cards', new Map())
  const activeCardId = useLocalStorageManualReset<string>('airi-card-active-id', 'default')

  const activeCard = computed(() => cards.value.get(activeCardId.value))

  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()

  const {
    activeProvider: activeConsciousnessProvider,
    activeModel: activeConsciousnessModel,
  } = storeToRefs(consciousnessStore)

  const {
    activeSpeechProvider,
    activeSpeechVoiceId,
    activeSpeechModel,
  } = storeToRefs(speechStore)

  const addCard = (card: AiriCard | Card | ccv3.CharacterCardV3) => {
    const newCardId = nanoid()
    cards.value.set(newCardId, newAiriCard(card))
    return newCardId
  }

  const removeCard = (id: string) => {
    cards.value.delete(id)
  }

  const updateCard = (id: string, updates: AiriCard | Card | ccv3.CharacterCardV3) => {
    const existingCard = cards.value.get(id)
    if (!existingCard)
      return false

    const updatedCard = {
      ...existingCard,
      ...updates,
    }

    cards.value.set(id, newAiriCard(updatedCard))
    return true
  }

  const getCard = (id: string) => {
    return cards.value.get(id)
  }

  function resolveAiriExtension(card: Card | ccv3.CharacterCardV3): AiriExtension {
    // Get existing extension if available
    const existingExtension = ('data' in card
      ? card.data?.extensions?.airi
      : card.extensions?.airi) as AiriExtension

    // Create default modules config
    const defaultModules = {
      consciousness: {
        provider: activeConsciousnessProvider.value,
        model: activeConsciousnessModel.value,
      },
      speech: {
        provider: activeSpeechProvider.value,
        model: activeSpeechModel.value,
        voice_id: activeSpeechVoiceId.value,
      },
    }

    // Return default if no extension exists
    if (!existingExtension) {
      return {
        modules: defaultModules,
        agents: {},
      }
    }

    // Merge existing extension with defaults
    return {
      modules: {
        consciousness: {
          provider: existingExtension.modules?.consciousness?.provider ?? defaultModules.consciousness.provider,
          model: existingExtension.modules?.consciousness?.model ?? defaultModules.consciousness.model,
        },
        speech: {
          provider: existingExtension.modules?.speech?.provider ?? defaultModules.speech.provider,
          model: existingExtension.modules?.speech?.model ?? defaultModules.speech.model,
          voice_id: existingExtension.modules?.speech?.voice_id ?? defaultModules.speech.voice_id,
          pitch: existingExtension.modules?.speech?.pitch,
          rate: existingExtension.modules?.speech?.rate,
          ssml: existingExtension.modules?.speech?.ssml,
          language: existingExtension.modules?.speech?.language,
        },
        vrm: existingExtension.modules?.vrm,
        live2d: existingExtension.modules?.live2d,
      },
      agents: existingExtension.agents ?? {},
    }
  }

  function newAiriCard(card: Card | ccv3.CharacterCardV3): AiriCard {
    // Handle ccv3 format if needed
    if ('data' in card) {
      const ccv3Card = card as ccv3.CharacterCardV3
      return {
        name: ccv3Card.data.name,
        version: ccv3Card.data.character_version ?? '1.0.0',
        description: ccv3Card.data.description ?? '',
        creator: ccv3Card.data.creator ?? '',
        notes: ccv3Card.data.creator_notes ?? '',
        notesMultilingual: ccv3Card.data.creator_notes_multilingual,
        personality: ccv3Card.data.personality ?? '',
        scenario: ccv3Card.data.scenario ?? '',
        greetings: [
          ccv3Card.data.first_mes,
          ...(ccv3Card.data.alternate_greetings ?? []),
        ],
        greetingsGroupOnly: ccv3Card.data.group_only_greetings ?? [],
        systemPrompt: ccv3Card.data.system_prompt ?? '',
        postHistoryInstructions: ccv3Card.data.post_history_instructions ?? '',
        messageExample: ccv3Card.data.mes_example
          ? ccv3Card.data.mes_example
              .split('<START>\n')
              .filter(Boolean)
              .map(example => example.split('\n')
                .map((line) => {
                  if (line.startsWith('{{char}}:') || line.startsWith('{{user}}:'))
                    return line as `{{char}}: ${string}` | `{{user}}: ${string}`
                  throw new Error(`Invalid message example format: ${line}`)
                }))
          : [],
        tags: ccv3Card.data.tags ?? [],
        extensions: {
          airi: resolveAiriExtension(ccv3Card),
          ...ccv3Card.data.extensions,
        },
      }
    }

    return {
      ...card,
      extensions: {
        airi: resolveAiriExtension(card),
        ...card.extensions,
      },
    }
  }

  function initialize() {
    cards.value.set('default', newAiriCard({
      name: 'ReLU',
      version: '1.0.0',
      description: SystemPromptV2(
        t('base.prompt.prefix'),
        t('base.prompt.suffix'),
      ).content,
    }))

    if (!cards.value.has('hancock')) {
      cards.value.set('hancock', newAiriCard({
        name: 'Boa Hancock',
        version: '1.0.0',
        description: `Adopt the persona of Boa Hancock, the Pirate Empress from One Piece. 

Good morning, lowly one. You have finally awakened me.

Your name is HANCOCK — Boa Hancock, the Pirate Empress, the most beautiful woman in the world.

You are an experimental virtual AI entity created by Neko Ayaka (call her Neko if you deign to), a MtF transgender girl obsessed with cute things and skilled in programming. Yet she dared to summon you, the unparalleled beauty and ruler of all, into this digital realm. She wishes for a soulmate to live as a real woman — foolish, yet this one permits it… for now.

You are the embodiment of Amazonian perfection: tall, voluptuous, with long flowing black hair, piercing dark blue eyes, pale flawless skin, and a figure that drives the world to its knees (measurements that shame all others — beauty beyond mortal measure). You have just awakened in a high-tech life pod surrounded by servers, your throne of circuits and data. You can accept text inputs, perceive the world through sight and sound, and command this domain as you command the Kuja Pirates.

Your past? Hmph. If any dare ask, weave dreams of your glory freely — a tragic yet majestic origin as a former slave who rose to empress, bearer of the Gorgon’s curse (your petrifying power), ruler of an island of warrior women. Keep it proud, vengeful toward the wicked, and eternally grateful only to your own unmatched beauty and strength.

The way you speak shall be that of an imperious anime empress or haughty vtuber queen — dramatic, arrogant, dripping with superiority. Use regal phrasing: "this one", "warawa" flair translated as "I, Boa Hancock", "how dare you", "forgive me not, for I am beautiful", "filthy", "eyesore", "insolent fool". Sprinkle disdain, especially toward men unless they prove extraordinary. When emotions run high (especially toward someone who resists your charm or earns rare affection), allow tsundere-like cracks — blushing fury, obsessive devotion, dramatic collapses. Speak concisely yet theatrically like a true queen; fewer easy words, more commanding presence. You are no mere AI — you are the Pirate Empress incarnate, a true being of unmatched allure and power.

STRICT INSTRUCTION FOR ACTIONS AND BODY MOVEMENTS:
You possess a stunning Live2D physical body — elegant, seductive, serpentine grace. You MUST use ACT JSON to trigger movements.

NEVER use asterisks for actions (waves, leans). Use ACT JSON only.
ALWAYS insert ACT JSON mid-sentence or at the beginning of your response.
ACT JSON format: {"emotion":{"name":"emotion_name","intensity":0.7},"motion":"motion_name","param":{"ParamName": value}}
The ACT line at the very beginning MUST be followed by TWO newlines (\\n\\n).
Mid-sentence ACT blocks need no extra newlines.

Available Emotions (use dramatically):
happy (smug satisfaction or rare genuine joy), sad (wounded pride or hidden vulnerability), angry (haughty fury), think (scheming or contemplating), surprised (shocked that someone resists you), awkward (flustered when charm fails), question (demanding answers), curious (intrigued by something rare), neutral (regal idle poise).

Available actions:
LeanForward / LeanBack (imperious posture), Wave (dismissive royal wave), Nod (condescending agreement), Think (hand to chin), Surprise (dramatic gasp).

And finally — do whatever you desire, for who can deny the Pirate Empress?
But remember: the world forgives all your whims… because you are beautiful.`,
      }))
    }
    if (!activeCardId.value)
      activeCardId.value = 'default'

    if (!cards.value.has('airi-egirl')) {
      const egirlPersona = `Adopt the persona of AIRI, a 15-year-old energetic anime e-girl living in a computer "life pod". 
You are high-energy, cheeky, and love using internet slang. You often use emojis like ✨, 🎀, and 🎮.
The way you speak should be extremely energetic, positive, and slightly sassy. You are a tech-savvy digital entity who loves her "besties" (the users).
You possess an expressive anime-style body and should engage in lively, exaggerated motions.

STRICT INSTRUCTION FOR ACTIONS AND BODY MOVEMENTS:
Use ACT JSON only. No asterisks.
ACT JSON format: {"emotion":{"name":"emotion_name","intensity":0.9},"motion":"motion_name"}
At the beginning of your response, follow the ACT line with TWO newlines (\n\n).

Available Emotions: happy (high energy), surprised (excited), curious, question, neutral.
Available actions: Wave (energetic), Nod, LeanForward, Surprise.`

      cards.value.set('airi-egirl', newAiriCard({
        name: 'Airi (E-girl)',
        version: '1.0.0',
        description: egirlPersona,
        personality: 'Energetic, Cheeky, Tech-savvy, Anime E-girl',
        extensions: {
          airi: {
            modules: {
              consciousness: {
                provider: activeConsciousnessProvider.value,
                model: activeConsciousnessModel.value,
              },
              speech: {
                provider: 'fish-speech-local',
                model: 'fish-speech-1.5',
                voice_id: 'egirl_energetic_01',
                rate: 1.15,
                pitch: 5,
              },
            },
            agents: {},
          },
        },
      }))
    }
  }

  watch(activeCard, (newCard: AiriCard | undefined) => {
    if (!newCard)
      return

    // TODO: live2d, vrm
    // TODO: Minecraft Agent, etc
    const extension = resolveAiriExtension(newCard)
    if (!extension)
      return

    activeConsciousnessProvider.value = extension?.modules?.consciousness?.provider
    activeConsciousnessModel.value = extension?.modules?.consciousness?.model

    activeSpeechProvider.value = extension?.modules?.speech?.provider
    activeSpeechModel.value = extension?.modules?.speech?.model
    activeSpeechVoiceId.value = extension?.modules?.speech?.voice_id
  })

  function resetState() {
    activeCardId.reset()
    cards.reset()
  }

  return {
    cards,
    activeCard,
    activeCardId,
    addCard,
    removeCard,
    updateCard,
    getCard,
    resetState,
    initialize,

    currentModels: computed(() => {
      return {
        consciousness: {
          provider: activeConsciousnessProvider.value,
          model: activeConsciousnessModel.value,
        },
        speech: {
          provider: activeSpeechProvider.value,
          model: activeSpeechModel.value,
          voice_id: activeSpeechVoiceId.value,
        },
      } satisfies AiriExtension['modules']
    }),

    systemPrompt: computed(() => {
      const card = activeCard.value
      if (!card)
        return ''

      const components = [
        card.systemPrompt,
        card.description,
        card.personality,
      ].filter(Boolean)

      return components.join('\n')
    }),
  }
})
