// specify your config items
// environment variables starting with `OSEM_` will override the values here.
// Example: `OSEM_targetfolder` will override the setting for `targetFolder`
'use strict';

// var config = {
//   dbhost: 'db',
//   dbuser: '',
//   dbuserpass: '',
//   port: 5000
// };

var config = {
  dbhost: 'localhost:27017',
  dbuser: 'admin',
  dbuserpass: 'admin',
  port: 5000
};

var env_has_dbconnectionstring = false;
for (var envKey in process.env) {
  if (envKey.indexOf('origami_') === 0) {
    var configKey = envKey.substring(8);
    if (env_has_dbconnectionstring === false && configKey === 'dbconnectionstring') {
      env_has_dbconnectionstring = true;
    }
    config[configKey] = process.env[envKey];
  }
}

if (env_has_dbconnectionstring === false) {
  config.dbconnectionstring = config.dbuser + ':' + config.dbuserpass + '@' + config.dbhost + '/origami-api?authSource=origami-api';
}

module.exports = config;
