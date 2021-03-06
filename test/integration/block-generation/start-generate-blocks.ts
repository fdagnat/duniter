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

import {PeerDTO} from "../../../app/lib/dto/PeerDTO"
import {BmaDependency} from "../../../app/modules/bma/index"
import {CrawlerDependency} from "../../../app/modules/crawler/index"
import {Underscore} from "../../../app/lib/common-libs/underscore"
import {NewTestingServer, serverWaitBlock, TestingServer} from "../tools/toolbox"
import {TestUser} from "../tools/TestUser"
import {RouterDependency} from "../../../app/modules/router"
import {ProverDependency} from "../../../app/modules/prover/index"
import {until} from "../tools/test-until"
import {sync} from "../tools/test-sync"
import {shutDownEngine} from "../tools/shutdown-engine"
import {expectJSON} from "../tools/http-expect"

const rp        = require('request-promise');

const MEMORY_MODE = true;
const commonConf = {
  bmaWithCrawler: true,
  ipv4: '127.0.0.1',
  remoteipv4: '127.0.0.1',
  currency: 'bb',
  httpLogs: true,
  forksize: 0,
  sigQty: 1
};

let s1:TestingServer, s2:TestingServer, cat:TestUser, toc:TestUser, tic:TestUser, tuc:TestUser

let nodeS1;
let nodeS2;

describe("Generation", function() {

  before(async () => {

    s1 = NewTestingServer(
      Underscore.extend({
        name: 'bb7',
        memory: MEMORY_MODE,
        port: '7790',
        pair: {
          pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
          sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
        },
        powDelay: 1
      }, commonConf));

    s2 = NewTestingServer(
      Underscore.extend({
        name: 'bb7_2',
        memory: MEMORY_MODE,
        port: '7791',
        pair: {
          pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo',
          sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'
        },
        powDelay: 1
      }, commonConf));

    cat = new TestUser('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
    toc = new TestUser('toc', { pub: 'DKpQPUL4ckzXYdnDRvCRKAm1gNvSdmAXnTrJZ7LvM5Qo', sec: '64EYRvdPpTfLGGmaX5nijLXRqWXaVz8r1Z1GtaahXwVSJGQRn7tqkxLb288zwSYzELMEG5ZhXSBYSxsTsz1m9y8F'}, { server: s1 });
    tic = new TestUser('tic', { pub: 'DNann1Lh55eZMEDXeYt59bzHbA3NJR46DeQYCS2qQdLV', sec: '468Q1XtTq7h84NorZdWBZFJrGkB18CbmbHr9tkp9snt5GiERP7ySs3wM8myLccbAAGejgMRC9rqnXuW3iAfZACm7'}, { server: s1 });
    tuc = new TestUser('tuc', { pub: '3conGDUXdrTGbQPMQQhEC4Ubu1MCAnFrAYvUaewbUhtk', sec: '5ks7qQ8Fpkin7ycXpxQSxxjVhs8VTzpM3vEBMqM7NfC1ZiFJ93uQryDcoM93Mj77T6hDAABdeHZJDFnkDb35bgiU'}, { server: s1 });

    let servers = [s1, s2];
    for (const server of servers) {
      server._server.addEndpointsDefinitions(() => BmaDependency.duniter.methods.getMainEndpoint(server.conf))
      await server.initWithDAL();
      server.bma = await BmaDependency.duniter.methods.bma(server._server);
      await server.bma.openConnections();
      RouterDependency.duniter.methods.routeToNetwork(server._server);
      await server.PeeringService.generateSelfPeer(server.conf);
      const prover = ProverDependency.duniter.methods.prover(server._server)
      server.startBlockComputation = () => prover.startService();
      server.stopBlockComputation = () => prover.stopService();
    }
    nodeS1 = CrawlerDependency.duniter.methods.contacter('127.0.0.1', s1.conf.port);
    nodeS2 = CrawlerDependency.duniter.methods.contacter('127.0.0.1', s2.conf.port);
    // Server 1
    await cat.createIdentity();
    await toc.createIdentity();
    await toc.cert(cat);
    await cat.cert(toc);
    await cat.join();
    await toc.join();
    await s1.commit();
    // Server 2 syncs block 0
    await sync(0, 0, s1._server, s2._server);
    // Let each node know each other
    let peer1 = await nodeS1.getPeer();
    await nodeS2.postPeer(PeerDTO.fromJSONObject(peer1).getRawSigned());
    let peer2 = await nodeS2.getPeer();
    await nodeS1.postPeer(PeerDTO.fromJSONObject(peer2).getRawSigned());
    s1.startBlockComputation();
    await until(s2, 'block', 1);
    s2.startBlockComputation();
    s1.conf.powDelay = 2000;
    s2.conf.powDelay = 2000;
    await Promise.all([
      serverWaitBlock(s1._server, 3),
      serverWaitBlock(s2._server, 3)
    ])
    s1.stopBlockComputation();
    s2.stopBlockComputation();
  });

  after(() => {
    return Promise.all([
      shutDownEngine(s1),
      shutDownEngine(s2)
    ])
  })

  describe("Server 1 /blockchain", function() {

    it('/current should exist', function() {
      return expectJSON(rp('http://127.0.0.1:7790/blockchain/current', { json: true }), {
        number: 3
      });
    });

    it('/current should exist on other node too', function() {
      return expectJSON(rp('http://127.0.0.1:7791/blockchain/current', { json: true }), {
        number: 3
      });
    });
  });
});
