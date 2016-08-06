"use strict";
const should = require('should');
const co = require('co');
const toolbox = require('../integration/tools/toolbox');
const user    = require('../integration/tools/user');
const bma     = require('../../app/lib/streams/bma');

const serverConfig = {
  memory: false,
  pair: {
    pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd',
    sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'
  }
};

const s0 = toolbox.server(serverConfig);
const s1 = toolbox.server(serverConfig);

const cat = user('cat', { pub: 'HgTTJLAQ5sqfknMq7yLPZbehtuLSsKj9CxWN7k8QvYJd', sec: '51w4fEShBk1jCMauWu4mLpmDVfHksKmWcygpxriqCEZizbtERA6de4STKRkQBpxmMUwsKXRjSzuQ8ECwmqN1u2DP'}, { server: s1 });
const tac = user('tac', { pub: '2LvDg21dVXvetTD9GdkPLURavLYEqP3whauvPWX4c2qc', sec: '2HuRLWgKgED1bVio1tdpeXrf7zuUszv1yPHDsDj7kcMC4rVSN9RC58ogjtKNfTbH1eFz7rn38U1PywNs3m6Q7UxE'}, { server: s1 });


describe('Import/Export', () => {

  before(() => co(function *() {
    yield s0.resetAll();
    yield s1.initWithDAL().then(bma).then((bmapi) => bmapi.openConnections());
    yield cat.createIdentity();
    yield tac.createIdentity();
    yield cat.cert(tac);
    yield tac.cert(cat);
    yield cat.join();
    yield tac.join();
    yield s1.commit();
  }));

  it('should be able to export data', () => co(function *() {
    const archive = yield s1.exportAllDataAsZIP();
    const output = require('fs').createWriteStream(s1.home + '/export.zip');
    archive.pipe(output);
    return new Promise((resolve, reject) => {
      archive.on('error', reject);
      output.on('close', function() {
        console.log(archive.pointer() + ' total bytes');
        console.log('archiver has been finalized and the output file descriptor has closed.');
        resolve();
      });
    });
  }));
});