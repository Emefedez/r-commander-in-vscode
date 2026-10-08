// Every implemented command, keyed by its Rcmdr command id.
module.exports = Object.assign({},
  require('./system'), require('./data'), require('./stats'),
  require('./graphs'), require('./models'), require('./distributions'), require('./teachstat'));
