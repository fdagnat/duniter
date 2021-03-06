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

"use strict";
import { ConfDTO } from "../lib/dto/ConfDTO";
import { Server } from "../../server";

const async = require("async");
const constants = require("../lib/constants");

module.exports = {
  duniter: {
    service: {
      neutral: (server: Server, conf: ConfDTO) => {
        for (const ep of conf.endpoints || []) {
          server.addEndpointsDefinitions(async () => ep);
        }
        return new PeerSignalEmitter(server, conf);
      },
    },
  },
};

/**
 * Service which triggers the server's peering generation (actualization of the Peer document).
 * @constructor
 */
class PeerSignalEmitter {
  INTERVAL: NodeJS.Timer | null = null;
  peerFifo = async.queue(function (task: any, callback: any) {
    task(callback);
  }, 1);

  constructor(private server: Server, private conf: ConfDTO) {}

  async startService() {
    // The interval duration
    const SIGNAL_INTERVAL =
      1000 * this.conf.avgGenTime * constants.NETWORK.STATUS_INTERVAL.UPDATE;
    const SIGNAL_INITIAL_DELAY = 1000 * 60;

    // We eventually clean an existing interval
    if (this.INTERVAL) clearInterval(this.INTERVAL);

    // Create the new regular algorithm
    this.INTERVAL = setInterval(() => {
      this.peerFifo.push(async (done: any) => {
        try {
          await this.server.PeeringService.generateSelfPeer(
            this.conf,
            SIGNAL_INTERVAL
          );
          done();
        } catch (e) {
          done(e);
        }
      });
    }, SIGNAL_INTERVAL);

    // Launches it a first time few seconds after startup
    setTimeout(
      () =>
        this.server.PeeringService.generateSelfPeer(
          this.conf,
          SIGNAL_INTERVAL - SIGNAL_INITIAL_DELAY
        ),
      0
    );
  }

  stopService() {
    // Stop the interval
    if (this.INTERVAL) {
      clearInterval(this.INTERVAL);
    }
    // Empty the fifo
    this.peerFifo.kill();
  }
}
