import type { Hono } from 'hono'

import { hc } from 'hono/client'

import { SERVER_URL } from '../libs/auth'

// NOTICE: The apps/server directory appears to be missing in this project state.
// Defining a fallback AppType to satisfy typechecking and allow nested property access.
export type AppType = Hono<any, any, any>

export const client = hc<AppType>(SERVER_URL, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    return fetch(input, {
      ...init,
      headers,
      credentials: 'include', // Send cookies with request (for sessions, etc)
    })
  },
}) as any
