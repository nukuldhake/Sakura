# @proj-sakura/server-sdk

The SDK for cliet-side code to connect to the server-side components.

## Usage

```shell
ni @proj-sakura/server-sdk -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @proj-sakura/server-sdk -D
yarn i @proj-sakura/server-sdk -D
npm i @proj-sakura/server-sdk -D
```

```typescript
import { Client } from '@proj-sakura/server-sdk'

const c = new Client({ name: 'your SAKURA plugin' })
```

## License

[MIT](../../LICENSE)

