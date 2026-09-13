import { genericAdapter } from "./generic"
import type { SiteAdapter } from "./types"

// Site-specific adapters go here as they're built (each keyed by hostname
// via `matches`), e.g.:
//   import { greenhouseAdapter } from "./greenhouse"
//   import { leverAdapter } from "./lever"
//   import { workdayAdapter } from "./workday"
//   import { linkedinAdapter } from "./linkedin"
const adapters: SiteAdapter[] = [
  // greenhouseAdapter, leverAdapter, workdayAdapter, linkedinAdapter,
  genericAdapter
]

export function getAdapterForHostname(hostname: string): SiteAdapter {
  return adapters.find((adapter) => adapter.matches(hostname)) ?? genericAdapter
}
