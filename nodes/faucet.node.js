const { utils, Wallet } = require('ethers');
const axios = require('axios');
const _utils = require('../utils/utils');
const interfaces = require('../interfaces/interfaces');
const types = require('../types/types');
const structs = require('../structs/structs');
const MysqlDB = require('../dbs/MysqlDB');
const LevelUpDB = require('../dbs/LevelUpDB');
const errors = require('../errors/errors');
const { parseTransactions } = require('../blocks/parseTransactions');
const { FuelDBKeys } = require('../interfaces/interfaces');
const config = require('../config/config');
const faucet = require('./faucet');
const env = require('../config/process');
let Sentry = null;

// Sentry Error Reporting
if (env.sentry) {
  Sentry = require('@sentry/node');
  Sentry.init({ dsn: env.sentry });
}

// memwatch.on('stats', console.log);
if (env.memwatch) {
  const memwatch = require('node-memwatch');
  memwatch.on('leak', console.log);
}

// Setup DB's
const inputs = new MysqlDB({ // for storing remotly for lambda processing
  host: env.mysql_host,
  port: parseInt(env.mysql_port, 10),
  database: env.mysql_database,
  user: env.mysql_user,
  password: env.mysql_password,
  table: 'faucet_inputs',
  indexValue: false,
});
const requests = new MysqlDB({ // for storing remotly for lambda processing
  host: env.mysql_host,
  port: parseInt(env.mysql_port, 10),
  database: env.mysql_database,
  user: env.mysql_user,
  password: env.mysql_password,
  table: 'faucet_requests',
});
const db = new MysqlDB({ // for storing remotly for lambda processing
  host: env.mysql_host,
  port: parseInt(env.mysql_port, 10),
  database: env.mysql_database,
  user: env.mysql_user,
  password: env.mysql_password,
  table: 'keyvalues',
});
const mempool = new MysqlDB({ // for storing tx list
  host: env.mysql_host,
  port: parseInt(env.mysql_port, 10),
  database: env.mysql_database,
  user: env.mysql_user,
  password: env.mysql_password,
  table: 'mempool',
});
const accounts = new MysqlDB({ // for storing remote for lambda processing
  host: env.mysql_host,
  port: env.mysql_port,
  database: env.mysql_database,
  user: env.mysql_user,
  password: env.mysql_password,
  table: 'accounts',
  indexValue: true, // secondary index
});

types.TypeHex(env.faucet_key, 32);

// Dispersal Preferences...
const faucetKey = new utils.SigningKey(env.faucet_key);
const keyAddress = faucetKey.address;
const tokenID = env.faucet_token_id
  ? _utils.big(env.faucet_token_id) : _utils.big(1);

// Logger with Sentry support
const logger = {
  log: console.log,
  error: Sentry ? Sentry.captureException : console.error,
};

// Pubnub inclusion
let pubnub = null;
if (env.pubnub_publisher_key) {
  // require module
  const PubNub = require('pubnub');

  // Pubnub
  pubnub = new PubNub({
    publishKey: env.pubnub_publisher_key,
    subscribeKey: env.pubnub_subscriber_key,
    uuid: env.pubnub_uuid,
  });
}

// Faucet Node
async function node() {
  try {
    await requests.create();
    await db.create();
    await mempool.create();
    await inputs.create();

    // Dispersal
    await faucet({
      db,
      mempool,
      spendableInputs: inputs,
      accounts,
      requests,
      tokenID,
      pubnub,
      amount: env.faucet_dispersal_amount
        ? _utils.big(env.faucet_dispersal_amount)
        : utils.parseEther('100'), // to disperse per account..
      signerKey: faucetKey,
      logger,
    });
  } catch (error) {
    throw new errors.ByPassError(error);
  }
}

node()
.then(console.log)
.catch(console.log);
