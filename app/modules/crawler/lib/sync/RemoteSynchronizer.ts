// Source file from duniter: Crypto-currency software to manage libre currency such as Ğ1
// Copyright (C) 2018  Cedric Moreau <cem.moreau@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

import {ISyncDownloader} from "./ISyncDownloader"
import {BlockDTO} from "../../../../lib/dto/BlockDTO"
import {PeerDTO} from "../../../../lib/dto/PeerDTO"
import {connect} from "../connect"
import {NewLogger} from "../../../../lib/logger"
import {CrawlerConstants} from "../constants"
import {cliprogram} from "../../../../lib/common-libs/programOptions"
import {Watcher} from "./Watcher"
import {PeeringService} from "../../../../service/PeeringService"
import {Server} from "../../../../../server"
import {DBPeer, JSONDBPeer} from "../../../../lib/db/DBPeer"
import {Underscore} from "../../../../lib/common-libs/underscore"
import {FileDAL} from "../../../../lib/dal/fileDAL"
import {P2PSyncDownloader} from "./P2PSyncDownloader"
import {FsSyncDownloader} from "./FsSyncDownloader"
import {AbstractSynchronizer} from "./AbstractSynchronizer"
import {pullSandboxToLocalServer} from "../sandbox"
import * as path from 'path'
import {IRemoteContacter} from "./IRemoteContacter";
import {BMARemoteContacter} from "./BMARemoteContacter";
import {WS2PConnection, WS2PPubkeyRemoteAuth, WS2PPubkeySyncLocalAuth} from "../../../ws2p/lib/WS2PConnection";
import {WS2PRequester} from "../../../ws2p/lib/WS2PRequester";
import {WS2PMessageHandler} from "../../../ws2p/lib/impl/WS2PMessageHandler";
import {WS2PResponse} from "../../../ws2p/lib/impl/WS2PResponse";
import {DataErrors} from "../../../../lib/common-libs/errors";
import {KeyGen} from "../../../../lib/common-libs/crypto/keyring";
import {WS2PRemoteContacter} from "./WS2PRemoteContacter";
import {Keypair} from "../../../../lib/dto/ConfDTO";
import {cat} from "shelljs";

const logger = NewLogger()

export class RemoteSynchronizer extends AbstractSynchronizer {

  private node:IRemoteContacter
  private peer:PeerDTO
  private shuffledPeers: JSONDBPeer[]
  private theP2pDownloader: ISyncDownloader
  private theFsDownloader: ISyncDownloader
  private to: number
  private localNumber: number
  private watcher: Watcher
  private static contacterOptions = {
    timeout: CrawlerConstants.SYNC_LONG_TIMEOUT
  }

  constructor(
    private readonly currency: string,
    private host: string,
    private port: number,
    private server:Server,
    chunkSize: number,
    private noShufflePeers = false,
    private otherDAL?:FileDAL,
  ) {
    super(chunkSize)
  }

  get dal(): FileDAL {
    return this.server.dal
  }

  get readDAL(): FileDAL {
    return this.otherDAL || this.dal
  }

  get PeeringService(): PeeringService {
    return this.server.PeeringService
  }

  getCurrency(): string {
    return this.currency
  }

  getPeer(): PeerDTO {
    return this.node as any
  }

  setWatcher(watcher: Watcher): void {
    this.watcher = watcher
  }

  getChunksPath(): string {
    return this.getCurrency()
  }

  async init(): Promise<void> {
    const syncApi = await RemoteSynchronizer.getSyncAPI(this.currency, [{ host: this.host, port: this.port }], this.server.conf.pair)
    if (!syncApi.api) {
      throw Error(DataErrors[DataErrors.CANNOT_CONNECT_TO_REMOTE_FOR_SYNC])
    }
    this.node = syncApi.api
    this.peer = PeerDTO.fromJSONObject(syncApi.peering)
    logger.info("Try with %s %s", this.peer.getURL(), this.peer.pubkey.substr(0, 6))
    // We save this peer as a trusted peer for future contact
    try {
      await this.server.PeeringService.submitP(DBPeer.fromPeerDTO(this.peer), false, false, true)
    } catch (e) {
      logger.debug(e)
    }
    ;(this.node as any).pubkey = this.peer.pubkey
  }

  public static async getSyncAPI(currency: string, hosts: { isBMA?: boolean, isWS2P?: boolean, host: string, port: number, path?: string }[], keypair: Keypair) {
    let api: IRemoteContacter|undefined
    let peering: any
    for (const access of hosts) {
      const host = access.host
      const port = access.port
      const path = access.path
      logger.info(`Connecting to address ${host} :${port}...`)

      // If we know this is a WS2P connection, don't try BMA
      if (access.isWS2P !== true) {
        try {
          const contacter = await connect(PeerDTO.fromJSONObject({ endpoints: [`BASIC_MERKLED_API ${host} ${port}${path && ' ' + path || ''}`]}), 3000)
          peering = await contacter.getPeer()
          api = new BMARemoteContacter(contacter)
        } catch (e) {
          logger.warn(`Node does not support BMA at address ${host} :${port}, trying WS2P...`)
        }
      }

      // If BMA is unreachable and the connection is not marked as strict BMA, let's try WS2P
      if (!api && access.isBMA !== true) {
        const pair = KeyGen(keypair.pub, keypair.sec)
        const connection = WS2PConnection.newConnectionToAddress(1,
          `ws://${host}:${port}${path && ' ' + path || ''}`,
          new (class SyncMessageHandler implements WS2PMessageHandler {
            async answerToRequest(json: any, c: WS2PConnection): Promise<WS2PResponse> {
              throw Error(DataErrors[DataErrors.CANNOT_ARCHIVE_CHUNK_WRONG_SIZE])
            }
            async handlePushMessage(json: any, c: WS2PConnection): Promise<void> {
              logger.warn('Receiving push messages, which are not allowed during a SYNC.', json)
            }
          }),
          new WS2PPubkeySyncLocalAuth(currency, pair, '00000000'),
          new WS2PPubkeyRemoteAuth(currency, pair),
          undefined
        )
        try {
          const requester = WS2PRequester.fromConnection(connection)
          peering = await requester.getPeer()
          api = new WS2PRemoteContacter(requester)
        } catch (e) {
          logger.warn(`Node does not support WS2P at address ${host} :${port} either.`)
        }
      }
      // If we have a working API: stop!
      if (api && peering) {
        break;
      }
    }
    if (!api) {
      throw Error(DataErrors[DataErrors.CANNOT_CONNECT_TO_REMOTE_FOR_SYNC])
    }
    if (!peering) {
      throw Error(DataErrors[DataErrors.NO_PEERING_AVAILABLE_FOR_SYNC])
    }
    if (peering.currency !== currency) {
      throw Error(DataErrors[DataErrors.WRONG_CURRENCY_DETECTED])
    }
    return {
      api,
      peering
    }
  }

  async initWithKnownLocalAndToAndCurrency(to: number, localNumber: number): Promise<void> {
    this.to = to
    this.localNumber = localNumber
    //=======
    // Peers (just for P2P download)
    //=======
    let peers:(JSONDBPeer|null)[] = [];
    if (!cliprogram.nopeers) {
      this.watcher.writeStatus('Peers...');
      peers = await this.node.getPeers()
    }

    if (!peers.length) {
      peers.push(DBPeer.fromPeerDTO(this.peer))
    }
    peers = peers.filter((p) => p);
    this.shuffledPeers = (this.noShufflePeers ? peers : Underscore.shuffle(peers)).filter(p => !!(p)) as JSONDBPeer[]
  }

  p2pDownloader(): ISyncDownloader {
    if (!this.theP2pDownloader) {
      this.theP2pDownloader = new P2PSyncDownloader(this.currency, this.server.conf.pair, this.localNumber, this.to, this.shuffledPeers, this.watcher, logger, this.chunkSize)
    }
    return this.theP2pDownloader
  }

  fsDownloader(): ISyncDownloader {
    if (!this.theFsDownloader) {
      this.theFsDownloader = new FsSyncDownloader(this.readDAL.fs, path.join(this.readDAL.rootPath, this.getChunksPath()), this.getChunkName.bind(this))
    }
    return this.theFsDownloader
  }

  getCurrent(): Promise<BlockDTO|null> {
    return this.node.getCurrent()
  }

  getBlock(number: number): Promise<BlockDTO|null> {
    return this.node.getBlock(number)
  }

  static async test(currency: string, host: string, port: number, keypair: Keypair): Promise<BlockDTO> {
    const syncApi = await RemoteSynchronizer.getSyncAPI(currency, [{ host, port }], keypair)
    const current = await syncApi.api.getCurrent()
    if (!current) {
      throw Error(DataErrors[DataErrors.REMOTE_HAS_NO_CURRENT_BLOCK])
    }
    return current
  }

  async syncPeers(fullSync: boolean, to?: number): Promise<void> {
    const peers = await this.node.getPeers()
    for (const p of peers) {
      try {
        await this.PeeringService.submitP(DBPeer.fromPeerDTO(PeerDTO.fromJSONObject(p)))
      } catch (e) {
      }
    }
  }

  async syncSandbox(): Promise<void> {
    this.watcher.writeStatus('Synchronizing the sandboxes...');
    await pullSandboxToLocalServer(this.currency, this.node, this.server, this.server.logger, this.watcher, 1, false)
  }
}