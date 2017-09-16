import {CommonConstants} from "../../../lib/common-libs/constants"
export const WS2PConstants = {

  WS2P_UPNP_TTL: 600,
  WS2P_PORTS_START: 20900,
  WS2P_PORTS_END: 20999,
  WS2P_UPNP_INTERVAL: 300,

  BLOCK_PULLING_INTERVAL: 300 * 2,    // 10 minutes
  DOCPOOL_PULLING_INTERVAL: 3600 * 4, // 4 hours
  SANDBOX_FIRST_PULL_DELAY: 300 * 2,  // 10 minutes after the start

  MAX_LEVEL_1_PEERS: 10,
  MAX_LEVEL_2_PEERS: 10,

  HEAD_REGEXP: new RegExp('^WS2P:HEAD:' + CommonConstants.FORMATS.PUBKEY + ':' + CommonConstants.FORMATS.BLOCKSTAMP + '$'),

  HEADS_SPREAD_TIMEOUT: 100 // Wait 100ms before sending a bunch of signed heads
}