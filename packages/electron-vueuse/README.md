# @proj-sakura/electron-vueuse

VueUse-like composables and helpers shared across SAKURA Electron apps.

## What it provides

- Renderer composables for common Electron behaviors (`mouse`, `window bounds`, `auto updater`, etc.)
- A reusable Eventa context/invoke pattern (`useElectronEventaContext`, `useElectronEventaInvoke`)
- Eventa context/invoke ergonomics for renderer code
- Main-process loop utilities (`useLoop`, `createRendererLoop`)

For IPC contract definitions, use `@proj-sakura/electron-eventa`.

## Usage

```ts
import { useElectronEventaInvoke } from '@proj-sakura/electron-vueuse'
import { electron } from '@proj-sakura/electron-eventa'

const openSettings = useElectronEventaInvoke(electron.window.getBounds)
```

```ts
import { createRendererLoop } from '@proj-sakura/electron-vueuse/main'
```

