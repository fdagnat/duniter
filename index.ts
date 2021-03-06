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

import {ExecuteCommand} from "./app/cli"
import * as stream from "stream"
import {Server} from "./server"
import {ConfDTO} from "./app/lib/dto/ConfDTO"
import {ProverDependency} from "./app/modules/prover/index"
import {KeypairDependency} from "./app/modules/keypair/index"
import {CrawlerDependency} from "./app/modules/crawler/index"
import {BmaDependency} from "./app/modules/bma/index"
import {WS2PDependency} from "./app/modules/ws2p/index"
import {ProverConstants} from "./app/modules/prover/lib/constants"
import {ProxiesConf} from './app/lib/proxy';
import {RouterDependency} from "./app/modules/router"
import {OtherConstants} from "./app/lib/other_constants"
import {Directory} from "./app/lib/system/directory"
import {Underscore} from "./app/lib/common-libs/underscore"
import {CliCommand, DuniterDependency, DuniterModule} from "./app/modules/DuniterModule"
import {ProgramOptions} from "./app/lib/common-libs/programOptions"
import {ExitCodes} from "./app/lib/common-libs/exit-codes"

const path = require('path');
const constants = require('./app/lib/constants');
const logger = require('./app/lib/logger').NewLogger('duniter');

const configDependency    = require('./app/modules/config');
const wizardDependency    = require('./app/modules/wizard');
const resetDependency     = require('./app/modules/reset');
const checkConfDependency = require('./app/modules/check-config');
const exportBcDependency  = require('./app/modules/export-bc');
const reapplyDependency   = require('./app/modules/reapply');
const revertDependency    = require('./app/modules/revert');
const daemonDependency    = require('./app/modules/daemon');
const pSignalDependency   = require('./app/modules/peersignal');
const pluginDependency    = require('./app/modules/plugin');
const dumpDependency      = require('./app/modules/dump');

let sigintListening = false

// Trace errors
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection: ' + reason);
  logger.error(reason);
});

export class Stacks {

  static todoOnRunDone:() => any = () => process.exit()

  static async quickRun(...args:any[]) {
    const deps = Array.from(args).map((f, index) => {
      const canonicalPath = path.resolve(f)
      return {
        name: 'duniter-quick-module-' + index,
        required: require(canonicalPath)
      }
    })
    const stack = Stacks.autoStack(deps)
    let res
    try {
      res = await stack.executeStack(Stacks.quickRunGetArgs())
    } catch(e) {
      console.error(e)
    }
    Stacks.onRunDone()
    return res
  }

  static quickRunGetArgs() {
    return process.argv.slice()
  }

  static onRunDone() {
    return Stacks.todoOnRunDone()
  }

  static autoStack(priorityModules?:DuniterModule[]) {

    const duniterModules = [];
    let duniterDeps:any = []

    try {
      const pjson = require(path.resolve('./package.json'))
      // Look for compliant packages
      const prodDeps = Object.keys(pjson.dependencies || {});
      const devDeps = Object.keys(pjson.devDependencies || {});
      duniterDeps = prodDeps.concat(devDeps)
    } catch (e) { /* duniter as a dependency might not be run from an NPM project */ }

    for(const dep of duniterDeps) {
      try {
        const required = require(dep);
        if (required.duniter) {
          duniterModules.push({
            name: dep,
            required
          });
        }
      } catch (e) { /* Silent errors for packages this fail to load */ }
    }

    // The final stack
    return new Stack((priorityModules || []).concat(PRODUCTION_DEPENDENCIES).concat(duniterModules));
  }
}

const MINIMAL_DEPENDENCIES = [
  { name: 'duniter-config',    required: configDependency }
];

const DEFAULT_DEPENDENCIES = MINIMAL_DEPENDENCIES.concat([
  { name: 'duniter-wizard',    required: wizardDependency },
  { name: 'duniter-reset',     required: resetDependency },
  { name: 'duniter-chkconf',   required: checkConfDependency },
  { name: 'duniter-exportbc',  required: exportBcDependency },
  { name: 'duniter-reapply',   required: reapplyDependency },
  { name: 'duniter-revert',    required: revertDependency },
  { name: 'duniter-daemon',    required: daemonDependency },
  { name: 'duniter-psignal',   required: pSignalDependency },
  { name: 'duniter-router',    required: RouterDependency },
  { name: 'duniter-plugin',    required: pluginDependency },
  { name: 'duniter-prover',    required: ProverDependency },
  { name: 'duniter-keypair',   required: KeypairDependency },
  { name: 'duniter-crawler',   required: CrawlerDependency },
  { name: 'duniter-bma',       required: BmaDependency },
  { name: 'duniter-ws2p',      required: WS2PDependency },
  { name: 'duniter-dump',      required: dumpDependency },
]);

const PRODUCTION_DEPENDENCIES = DEFAULT_DEPENDENCIES.concat([
]);

export function NewDuniterServer(home:string, memory:boolean, overConf:any) {
  return new Server(home, memory, overConf);
}

export const Statics = {

  logger: logger,

  /**
   * Creates a new stack with minimal registrations only.
   */
  minimalStack: () => new Stack(MINIMAL_DEPENDENCIES),

  /**
   * Creates a new stack with core registrations only.
   */
  simpleStack: () => new Stack(DEFAULT_DEPENDENCIES),

  /**
   * Creates a new stack pre-registered with compliant modules found in package.json
   */
  autoStack: (...args:any[]) => {
    return Stacks.autoStack.apply(null, args)
  },

  quickRun: (path:string) => {
    return Stacks.quickRun(path)
  },

  setOnRunDone: (f:()=>any) => {
    return Stacks.todoOnRunDone = f
  }
};

export interface DuniterService {
  startService: () => Promise<any>
  stopService: () => Promise<any>
}
export interface ReadableDuniterService extends DuniterService, stream.Readable {}
export interface TransformableDuniterService extends DuniterService, stream.Transform {}

export class Stack {

  private injectedServices = false

  private cli:any
  private configLoadingCallbacks:any[]
  private configBeforeSaveCallbacks:any[]
  private resetDataHooks:any[]
  private resetConfigHooks:any[]
  private INPUT:any
  private PROCESS:any
  private loaded:any
  private wizardTasks:any
  private definitions:DuniterDependency[] = []
  private streams: {
    input: ReadableDuniterService[]
    process: TransformableDuniterService[]
    output: TransformableDuniterService[]
    neutral: DuniterService[]
  } = {
    input: [],
    process: [],
    output: [],
    neutral: []
  }

  constructor(private dependencies:DuniterModule[]) {
    this.cli = ExecuteCommand()
    this.configLoadingCallbacks = []
    this.configBeforeSaveCallbacks = []
    this.resetDataHooks = []
    this.resetConfigHooks = []
    this.INPUT = new InputStream()
    this.PROCESS = new ProcessStream()
    this.loaded = {}
    this.wizardTasks = {}

    // We register the initial dependencies right now. Others can be added thereafter.
    for (const dep of dependencies) {
      this.registerDependency(dep.required, dep.name);
    }
  }

  // Part of modules API
  getModule(name:string) {
    return this.loaded[name]
  }

  registerDependency(requiredObject:{ duniter: DuniterDependency }, name:string) {
    if (name && this.loaded[name]) {
      // Do not try to load it twice
      return;
    }
    this.loaded[name] = requiredObject;
    const def = requiredObject.duniter;
    this.definitions.push(def);
    for (const opt of (def.cliOptions || [])) {
      this.cli.addOption(opt.value, opt.desc, opt.parser);
    }
    for (const command of (def.cli || [])) {
      this.cli.addCommand({
        name: command.name,
        desc: command.desc
      }, (...args:any[]) => this.processCommand.apply(this, [command].concat(args)));
    }

    /**
     * Configuration injection
     * -----------------------
     */
    if (def.config) {
      if (def.config.onLoading) {
        this.configLoadingCallbacks.push(def.config.onLoading);
      }
      // Before the configuration is saved, the module can make some injection/cleaning
      if (def.config.beforeSave) {
        this.configBeforeSaveCallbacks.push(def.config.beforeSave);
      }
    }

    /**
     * Reset data/config injection
     * -----------------------
     */
    if (def.onReset) {
      if (def.onReset.data) {
        this.resetDataHooks.push(def.onReset.data);
      }
      // Before the configuration is saved, the module can make some injection/cleaning
      if (def.onReset.config) {
        this.resetConfigHooks.push(def.onReset.config);
      }
    }

    /**
     * Wizard injection
     * -----------------------
     */
    if (def.wizard) {
      const tasks = Object.keys(def.wizard);
      for (const name of tasks) {
        this.wizardTasks[name] = def.wizard[name];
      }
    }
  };

  async processCommand (...args:any[]) {
    const command: CliCommand = args[0];
    const program: ProgramOptions = args[1];
    const params  = args.slice(2);
    params.pop(); // Don't need the command argument

    OtherConstants.SQL_TRACES = program.sqlTraces === true
    const dbName = program.mdb;
    const dbHome = program.home;
    const home = Directory.getHome(dbName, dbHome);

    if (command.logs === false) {
      logger.mute();
    }

    // Add log files for this instance (non-memory instances only)
    if (!program.memory) {
      logger.addHomeLogs(home, program.loglevel);
    }

    const server = new Server(home, program.memory === true, commandLineConf(program));
    let piped = false

    // If ever the process gets interrupted
    let isSaving = false;
    if (!sigintListening) {
      process.on('SIGINT', async () => {
        if (!isSaving) {
          isSaving = true;
          // Save DB
          try {
            await server.disconnect();
            process.exit(ExitCodes.OK);
          } catch (e) {
            logger.error(e);
            process.exit(ExitCodes.SIGINT);
          }
        }
      })
      sigintListening = true
    }

    // Config or Data reset hooks
    server.resetDataHook = async () => {
      for (const callback of this.resetDataHooks) {
        await callback(server.conf, program, logger, server.dal.confDAL);
      }
    }
    server.resetConfigHook = async () => {
      for (const callback of this.resetConfigHooks) {
        await callback(server.conf, program, logger, server.dal.confDAL);
      }
    }

    // Initialize server (db connection, ...)
    try {
      server.onPluggedFSHook = async () => {

        // Register the configuration hook for loading phase (overrides the loaded data)
        server.dal.loadConfHook = async (conf:ConfDTO) => {
          // Loading injection
          for (const callback of this.configLoadingCallbacks) {
            await callback(conf, program, logger, server.dal.confDAL);
          }
        }

        // Register the configuration hook for saving phase (overrides the saved data)
        server.dal.saveConfHook = async (conf:ConfDTO) => {
          const clonedConf = Underscore.clone(conf)
          for (const callback of this.configBeforeSaveCallbacks) {
            await callback(clonedConf, program, logger, server.dal.confDAL);
          }
          return clonedConf;
        }
      }
      await server.plugFileSystem();

      const conf = await server.loadConf();

      // Eventually change the log level
      // Add log files for this instance (non-memory instances only)
      if (!program.memory) {
        logger.addHomeLogs(home, conf.loglevel);
      }

      // Auto-configuration default
      await configure(program, server, server.conf || {});
      // Autosave conf
      try {
        await server.dal.saveConf(conf);
        logger.debug("Configuration saved.");
      } catch (e) {
        logger.error("Configuration could not be saved: " + e);
        throw Error(e);
      }

      const daemon = server.getDaemon()
      if (command.preventIfRunning && daemon.status()) {
        throw 'Your node is currently running. Please stop it and relaunch your command.'
      }

      // First possible class of commands: post-config
      if (command.onConfiguredExecute) {
        const res = await command.onConfiguredExecute(server, conf, program, params, this.wizardTasks, this);
        // If we don't have an execution callback, let's stop the command
        if (!command.onDatabaseExecute) {
          return res
        }
      } else if (!command.onDatabaseExecute) {
        throw `Command ${command.name} does not implement onConfiguredExecute nor onDatabaseExecute.`
      }
      // Second possible class of commands: post-service
      await server.initDAL(conf);

      /**
       * Service injection
       * -----------------
       */
      if (!this.injectedServices) {
        this.injectedServices = true
        for (const def of this.definitions) {
          if (def.service) {
            // To feed data coming from some I/O (network, disk, other module, ...)
            if (def.service.input) {
              this.streams.input.push(def.service.input(server, conf, logger));
            }
            // To handle data this has been submitted by INPUT stream
            if (def.service.process) {
              this.streams.process.push(def.service.process(server, conf, logger));
            }
            // To handle data this has been validated by PROCESS stream
            if (def.service.output) {
              this.streams.output.push(def.service.output(server, conf, logger));
            }
            // Special service which does not stream anything particular (ex.: piloting the `server` object)
            if (def.service.neutral) {
              this.streams.neutral.push(def.service.neutral(server, conf, logger));
            }
          }
        }
      }
      piped = true
      // All inputs write to global INPUT stream
      for (const module of this.streams.input) module.pipe(this.INPUT);
      // All processes read from global INPUT stream
      for (const module of this.streams.process) this.INPUT.pipe(module);
      // All processes write to global PROCESS stream
      for (const module of this.streams.process) module.pipe(this.PROCESS);
      // All ouputs read from global PROCESS stream
      for (const module of this.streams.output) this.PROCESS.pipe(module);

      const finalResult = await command.onDatabaseExecute(server, conf, program, params,

        // Start services and streaming between them
        async () => {
          const modules: DuniterService[] = this.streams.neutral.concat(this.streams.input).concat(this.streams.process).concat(this.streams.output);
          await Promise.all(modules.map((module:DuniterService) => module.startService()))
        },

        // Stop services and streaming between them
        async () => {
          const modules: DuniterService[] = this.streams.neutral.concat(this.streams.input).concat(this.streams.process).concat(this.streams.output);
          // Any streaming module must implement a `stopService` method
          await Promise.all(modules.map((module:DuniterService) => module.stopService()))
        },

        this);

      // Close resources
      await server.disconnect()

      return finalResult

    } catch (e) {
      server.disconnect();
      throw e;
    } finally {
      if (piped) {
        // Unpipe everything, as the command is done
        for (const module of this.streams.input) module.unpipe()
        for (const module of this.streams.process) module.unpipe()
        for (const module of this.streams.output) module.unpipe()
        this.INPUT.unpipe()
        this.PROCESS.unpipe()
      }
    }
  }

  executeStack(argv:string[]) {

    // Executes the command
    return this.cli.execute(argv);
  }
}

function commandLineConf(program:any, conf:any = {}) {

  conf = conf || {};
  const cli = {
    currency: program.currency,
    cpu: program.cpu,
    nbCores: program.nbCores,
    prefix: program.prefix,
    server: {
      port: program.port,
    },
    proxies: {
      proxySocks: program.socksProxy,
      proxyTor: program.torProxy,
      reachingClearEp: program.reachingClearEp,
      forceTor: program.forceTor,
      rmProxies: program.rmProxies
    },
    logs: {
      http: program.httplogs,
      nohttp: program.nohttplogs
    },
    endpoints: [],
    rmEndpoints: [],
    isolate: program.isolate,
    forksize: program.forksize,
    nofork: program.nofork,
    timeout: program.timeout
  };

  // Declare and update proxiesConf
  if (cli.proxies.proxySocks || cli.proxies.proxyTor || cli.proxies.reachingClearEp || cli.proxies.forceTor || cli.proxies.rmProxies) {
    conf.proxiesConf = new ProxiesConf()
    if (cli.proxies.proxySocks) conf.proxiesConf.proxySocksAddress = cli.proxies.proxySocks;
    if (cli.proxies.proxyTor)   conf.proxiesConf.proxyTorAddress = cli.proxies.proxyTor;
    if (cli.proxies.reachingClearEp)  {
      switch (cli.proxies.reachingClearEp) {
        case 'tor': conf.proxiesConf.reachingClearEp = 'tor'; break;
        case 'none': conf.proxiesConf.reachingClearEp = 'none'; break;
      }
    }
    if (cli.proxies.forceTor) conf.proxiesConf.forceTor = true
  }

  // Update the rest of the conf
  if (cli.currency)                             conf.currency = cli.currency;
  if (cli.server.port)                          conf.port = cli.server.port;
  if (cli.cpu)                                  conf.cpu = Math.max(0.01, Math.min(1.0, cli.cpu));
  if (cli.nbCores)                              conf.nbCores = Math.max(1, Math.min(ProverConstants.CORES_MAXIMUM_USE_IN_PARALLEL, cli.nbCores));
  if (cli.prefix)                               conf.prefix = Math.max(ProverConstants.MIN_PEER_ID, Math.min(ProverConstants.MAX_PEER_ID, cli.prefix));
  if (cli.logs.http)                            conf.httplogs = true;
  if (cli.logs.nohttp)                          conf.httplogs = false;
  if (cli.isolate)                              conf.isolate = cli.isolate;
  if (cli.timeout)                              conf.timeout = cli.timeout;
  if (cli.forksize != null)                     conf.forksize = cli.forksize;

  return conf;
}

async function configure(program:any, server:Server, conf:ConfDTO) {
  if (typeof server == "string" || typeof conf == "string") {
    throw constants.ERRORS.CLI_CALLERR_CONFIG;
  }
  // Try to add an endpoint if provided
  if (program.addep) {
    if (conf.endpoints.indexOf(program.addep) === -1) {
      conf.endpoints.push(program.addep);
    }
    // Remove it from "to be removed" list
    const indexInRemove = conf.rmEndpoints.indexOf(program.addep);
    if (indexInRemove !== -1) {
      conf.rmEndpoints.splice(indexInRemove, 1);
    }
  }
  // Try to remove an endpoint if provided
  if (program.remep) {
    if (conf.rmEndpoints.indexOf(program.remep) === -1) {
      conf.rmEndpoints.push(program.remep);
    }
    // Remove it from "to be added" list
    const indexInToAdd = conf.endpoints.indexOf(program.remep);
    if (indexInToAdd !== -1) {
      conf.endpoints.splice(indexInToAdd, 1);
    }
  }
}

/**
 * InputStream is a special stream this filters what passes in.
 * Only DUP-like documents should be treated by the processing tools, to avoid JSON injection and save CPU cycles.
 * @constructor
 */
class InputStream extends stream.Transform {

  constructor() {
    super({ objectMode: true })
  }

  _write(str:string, enc:any, done:any) {
    if (typeof str === 'string') {
      // Keep only strings
      const matches = str.match(/Type: (.*)\n/);
      if (matches && matches[1].match(/(Block|Membership|Identity|Certification|Transaction|Peer)/)) {
        const type = matches[1].toLowerCase();
        this.push({ type, doc: str });
      }
    }
    done && done();
  };
}
class ProcessStream extends stream.Transform {

  constructor() {
    super({ objectMode: true })
  }

  _write(obj:any, enc:any, done:any) {
    // Never close the stream
    if (obj !== undefined && obj !== null) {
      this.push(obj);
    }
    done && done();
  };
}

export const Duniter = {

  run(modules: DuniterModule[] = [], args?: string[]) {
    return Stacks.autoStack(modules).executeStack(args || process.argv)
  }
}
