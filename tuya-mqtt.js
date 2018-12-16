'use strict';

const mqtt = require('mqtt');
const TuyaDevice = require('./tuya-device');
const debug = require('debug')('tuya-mqtt');
const debugMqtt = require('debug')('mqtt');
var cleanup = require('./cleanup').Cleanup(onExit);

function bmap(istate) {
  return istate.toString() == 'true' ? 'ON' : 'OFF';
}

var connected = undefined;

const CONFIG = {
  host: 'localhost',
  port: 1883,
  topic: 'tuya/',
};

const MQTT_OPTS = {
  retain: true,
  qos: 2,
};

var config_mqtt = {
  host: CONFIG.host,
  port: CONFIG.port,
};

if (process.env.MQTT_USER) {
  config_mqtt.username = process.env.MQTT_USER;
}

if (process.env.MQTT_PASS) {
  config_mqtt.password = process.env.MQTT_PASS;
}

const mqtt_client = mqtt.connect(config_mqtt);

mqtt_client.on('connect', function(err) {
  debugMqtt('Connection established with MQTT server');
  connected = true;
  var topic = CONFIG.topic + '#';
  mqtt_client.subscribe(topic);
});

mqtt_client.on('reconnect', function(error) {
  if (connected) {
    debugMqtt('Connection with MQTT server was interrupted. Renewed connection.');
  } else {
    debugMqtt('Unable to connect to MQTT server.');
  }
  connected = false;
});

mqtt_client.on('error', function(error) {
  debugMqtt('Unable to connect to MQTT server', error);
  connected = false;
});

/**
 * execute function on topic message
 */
mqtt_client.on('message', function(topic, message, packet) {
  
  if (packet.retain && topic.includes('command')) return;

  try {
    message = message.toString();
    message = message.toLowerCase();
    var topic = topic.split('/');
    var options = {
      type: topic[1],
      id: topic[2],
      key: topic[3],
      ip: topic[4],
    };
    var exec = topic[6];

    if (options.type == 'socket' || options.type == 'lightbulb') {
      var device = new TuyaDevice(options);

      if (exec == 'command') {
        var status = topic[7];
        var dps_to_change = topic[5];
        debug('mqtt command', status, dps_to_change);
        device.onoff(status, dps_to_change);
      }
      if (exec == 'color') {
        var color = message;
        device.setColor(color);
      }
    }
  } catch (e) {
    debug(e);
  }
});

/**
 * Publish current TuyaDevice socket device state to MQTT-Topic
 * @param {topic} topic
 * @param {dps} pds ID to parse
 * @param {value} value of pds ID
 */
function sendParseSocketStatus(topic, dps, value) {
  if(dps <= 2) { // status of switches
    value = bmap(value);
  } else { // consumption etc.
    value = value.toString();
  }
  mqtt_client.publish(topic, value, MQTT_OPTS);
  debug('mqtt switch status updated to:' + topic + ' -> ' + value);
}

/**
 * Publish current TuyaDevice state to MQTT-Topic
 * @param {TuyaDevice} device
 * @param {boolean} status
 */
function publishStatus(device, status) {
  if (mqtt_client.connected == true) {
    for (var dps in status){
      try {
        var type = device.type;
        var tuyaID = device.options.id;
        var tuyaKey = device.options.key;
        var tuyaIP = device.options.ip;
        var tuyaDps = dps;

        if (tuyaID != undefined && tuyaKey != undefined && tuyaIP != undefined) {
          var topic = CONFIG.topic + type + '/' + tuyaID + '/' + tuyaKey + '/' + tuyaIP + '/' + tuyaDps + '/state';
          var value = status[dps];
          if (type == 'socket') {
            sendParseSocketStatus(topic, dps, value);
          } else {
            value = bmap(value);
            mqtt_client.publish(topic, value, MQTT_OPTS);
            debug('mqtt status updated to:' + topic + ' -> ' + value);
          }
        } else {
          debug('mqtt status not updated');
        }
      } catch (e) {
        debug(e);
      }
    }
  }
}

/**
 * event fires if TuyaDevice sends data
 * @see TuyAPI (https://github.com/codetheweb/tuyapi)
 */
TuyaDevice.onAll('data', function(data) {
  var status = null;
  status = data.dps;
  if (this.type == 'lightbulb' && status == undefined) {
    status = true;
  }
  publishStatus(this, status);
});

/**
 * MQTT connection tester
 */
function MQTT_Tester() {
  this.interval = null;

  function mqttConnectionTest() {
    if (mqtt_client.connected != connected) {
      connected = mqtt_client.connected;
      if (connected) {
        debugMqtt('Connected to the MQTT server.');
      } else {
        debugMqtt('Not connected to the MQTT server.');
      }
    }
  }

  this.destroy = function() {
    clearInterval(this.interval);
    this.interval = undefined;
  };

  this.connect = function() {
    this.interval = setInterval(mqttConnectionTest, 1500);
    mqttConnectionTest();
  };

  var constructor = (function(that) {
    that.connect.call(that);
  })(this);
}
var tester = new MQTT_Tester();

/**
 * Function call on script exit
 */
function onExit() {
  TuyaDevice.disconnectAll();
  tester.destroy();
};
