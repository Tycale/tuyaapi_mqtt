'use strict';

const TuyAPI = require('tuyapi');
const TuyColor = require('./tuya-color');
const debug = require('debug')('TuyAPI-device');
const debugTuya = require('debug')('TuyAPI-ext');
const debugTimer = require('debug')('TuyAPI-device-timer');

/**
 * Sets a property on a device.
 * @param {Object} options
 * @param {Number} [options.dps=1] DPS index to set
 * @param {*} options.set value to set
 * @example
 * // set default property
 * tuya.set({set: true}).then(() => console.log('device was changed'))
 * @example
 * // set custom property
 * tuya.set({dps: 2, set: true}).then(() => console.log('device was changed'))
 * @returns {Promise<Boolean>} - returns `true` if the command succeeded
 */
const Parser = require('tuyapi/lib/message-parser');

/**
 *
    var steckdose = new TuyaDevice({
        id: '03200240600194781244',
        key: 'b8bdebab418f5b55',
        ip: '192.168.178.45',
        type: "socket"
    });
 */

var TuyaDevice = (function() {
  var devices = [];
  var events = {};

  var autoTimeout = undefined;

  function checkExisiting(id) {
    var existing = false;
    // Check for existing instance
    devices.forEach(device => {
      if (device.hasOwnProperty('options')) {
        if (id === device.options.id) {
          existing = device;
        }
      }
    });
    return existing;
  }

  function TuyaDevice(options) {
    var device = this;
    var existing = null;
    // Check for existing instance
    if (existing = checkExisiting(options.id)) {
      return existing;
    }

    if (!(this instanceof TuyaDevice)) {
      return new TuyaDevice(options);
    }

    options.type = options.type || 'socket';
    options.persistentConnection = true;

    Object.defineProperty(this, 'type', {
      value: options.type,
    });

    Object.defineProperty(this, 'options', {
      value: options,
    });

    Object.defineProperty(this, 'device', {
      value: new TuyAPI(this.options),
    });

    this.device.on('connected', () => {
      debug('Connected to device.');
      device.triggerAll('connected');
    });

    this.device.on('disconnected', () => {
      debug('Disconnected from device.');
      device.triggerAll('disconnected');
    });

    this.device.on('data', data => {
      debug('Data from device:', data);
      device.triggerAll('data', data);
    });

    this.device.on('error', (err) => {
      debug('Error: ' + err);
      device.triggerAll('error', err);
    });

    this.device.connect();
    devices.push(this);
  }

  TuyaDevice.prototype.triggerAll = function(name, argument) {
    var device = this;
    var e = events[name] || [];
    e.forEach(event => {
      event.call(device, argument);
    });
  };

  TuyaDevice.prototype.on = function(name, callback) {
    var device = this;
    this.device.on(name, function() {
      callback.apply(device, arguments);
    });
  };

  TuyaDevice.prototype.get = function(options) {
    return this.device.get(options);
  };

  TuyaDevice.prototype.set = function(options, callback) {
    var device = this;
    debug('Setting status:', options);
    return this.device.set(options).then(result => {
      device.get().then(status => {
        debug('Result of setting status to', status);
        if (callback != undefined) {
          callback.call(device, status);
        }
        return;
      });
    });
  };

  TuyaDevice.prototype.onoff = function(newStatus, dps_to_change, callback) {
    newStatus = newStatus.toLowerCase();
    var device = this; var res; var cmd;
    if (res = newStatus.match(/(on|off|toggle)/)) {
      cmd = res[1];
      device.get({dps: dps_to_change}).then(status => {
        const map = {on: true, off: false, toggle: !status};
        const changed_status = map[cmd];
        debug('onoff : ', status, ' to become ', changed_status);
        if (status != changed_status){
          device.set({
            dps: parseInt(dps_to_change),
            set: changed_status,
          }, callback);
        }
      });
    }
  };

  TuyaDevice.prototype.setColor = function(hexColor, callback) {
    debug('Set color to', hexColor);
    var device = this;
    var tuya = this.device;
    var color = new TuyColor(tuya);
    var dps = color.setColor(hexColor);

    device.get().then(status => {
      device.set(dps, callback);
    });
  };

  TuyaDevice.prototype.connect = function(callback) {
    this.device.connect(callback);
  };

  TuyaDevice.prototype.disconnect = function(callback) {
    this.device.disconnect(callback);
  };

  Object.defineProperty(TuyaDevice, 'devices', {
    value: devices,
  });

  TuyaDevice.connectAll = function() {
    devices.forEach(device => {
      device.connect();
    });
  };

  TuyaDevice.disconnectAll = function() {
    devices.forEach(device => {
      device.disconnect();
    });
  };

  TuyaDevice.onAll = function(name, callback) {
    if (events[name] == undefined) {
      events[name] = [];
    }
    events[name].push(callback);
    devices.forEach(device => {
      device.triggerAll(name);
    });
  };

  return TuyaDevice;
}());

module.exports = TuyaDevice;
