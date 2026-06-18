import { Attribution } from 'ox/erc8021'

// Base Builder Code attribution suffix, appended to transaction calldata.
// Kept in its own module (free of wallet connectors) so it can be imported
// without dragging the wagmi config — and its browser-only connectors —
// into server-side rendering.
export const BUILDER_CODE_DATA_SUFFIX = Attribution.toDataSuffix({
  codes: ['bc_m8fvx957'],
})
