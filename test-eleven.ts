import { createUnElevenLabs } from 'unspeech'

console.log(createUnElevenLabs('', 'https://unspeech.hyp3r.link/v1/').speech('eleven_multilingual_v2', { similarityBoost: 0.75, stability: 0.5, style: 0, useSpeakerBoost: true }))
