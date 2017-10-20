const path = require('path');

const _ = require('lodash');
const MicrodropAsync = require('@microdrop/async');

const PluginModel = require('./PluginModel');


class ProtocolModel extends PluginModel {
  constructor() {
    super();
    this.protocols = new Array();
    this.microdrop = new MicrodropAsync();
  }

  // ** Event Listeners **
  listen() {
    // Persistent Messages:
    this.onStateMsg("protocol-model", "protocols", this.onProtocolsSet.bind(this));
    this.onStateMsg("step-model", "steps", this.onStepsSet.bind(this));
    this.onStateMsg("device-model", "device", this.onDeviceSet.bind(this));
    this.onStateMsg("schema-model", "schema", this.onSchemaSet.bind(this));

    // Protocol
    this.onTriggerMsg("request-protocol-export", this.onExportProtocolRequested.bind(this));

    // Change trigger to automatically bind "notify messages" (with dynamic receiver topics)
    // to be used with Javascript Promises / MicrodropSync
    this.onTriggerMsg("new-protocol", this.onNewProtocol.bind(this));
    this.onTriggerMsg("save-protocol", this.onSaveProtocol.bind(this));
    this.onTriggerMsg("change-protocol", this.onChangeProtocol.bind(this));
    this.onTriggerMsg("delete-protocol", this.onDeleteProtocol.bind(this));
    this.onTriggerMsg("upload-protocol", this.onUploadProtocol.bind(this));
    this.onTriggerMsg("load-protocol", this.onLoadProtocol.bind(this));

    this.bindTriggerMsg("experiment-ui", "send-protocol", "send-protocol");
    this.bindStateMsg("protocol-skeleton", "protocol-skeleton-set");
    this.bindStateMsg("protocol-skeletons", "protocol-skeletons-set");
    this.bindStateMsg("protocols", "protocols-set");

    // Steps:
    this.bindPutMsg("step-model", "steps", "put-steps");
    this.bindPutMsg("step-model", "step-number", "put-step-number");

    // Device:
    this.bindPutMsg("device-model", "device", "put-device");
  }

  // ** Getters and Setters **
  get channel() {
    // TODO: Change to "microdrop/protocol-data-controller";
    return "microdrop/data-controller";
  }
  get name() {return encodeURI(this.constructor.name.split(/(?=[A-Z])/).join('-').toLowerCase());}
  get filepath() {return __dirname;}
  get protocol() {return this._protocol;}
  set protocol(protocol) {this._protocol = protocol;}
  get time() {return new Date(new Date().getTime()).toLocaleString();}

  // ** Methods **
  createProtocolSkeletons() {
    const skeletons = new Array();
    _.each(this.protocols, (protocol) => {
      skeletons.push(this.ProtocolSkeleton(protocol));
    });
    return skeletons;
  }
  deleteProtocolAtIndex(index) {
    this.protocols.splice(index, 1);
    this.trigger("protocols-set", this.wrapData(null, this.protocols));
    this.trigger("protocol-skeletons-set", this.createProtocolSkeletons());
  }
  getProtocolIndexByName(name){
    const protocols = this.protocols;
    return _.findIndex(protocols, (p) => {return p.name == name});
  }
  // ** Event Handlers **
  onDeleteProtocol(payload) {
    const protocol = payload.protocol;
    const index = this.getProtocolIndexByName(protocol.name);
    this.deleteProtocolAtIndex(index);

    const receiver = this.getReceiver(payload);
    if (!receiver) return;
    this.sendMessage(
      `microdrop/${this.name}/notify/${receiver}/delete-protocol`,
      this.wrapData(null, protocol));
  }
  onDeviceSet(payload){
    const LABEL = "<ProtocolModel#onDeviceSet>"
    console.log(LABEL);
    if (!this.protocol) {
      console.error(LABEL, `this.protocol is ${this.protocol}`);
      return;
    }
    if (!this.protocols) {
      console.error(LABEL, `this.protocols is ${this.protocols}`);
      return;
    }
    if (!this.protocol.device) this.protocol.device = payload;

    const prevDeviceName = this.protocol.device.svg_filepath;
    const nextDeviceName = payload.svg_filepath;
    if (prevDeviceName != nextDeviceName) {
      // If device swapped, clear electrodes:
    }
    this.protocol.device = payload;
    this.save();
  }
  onStepsSet(payload) {
    console.log("<ProtocolModel>:: onStepsSet");
    if (!this.protocol) {
      console.warn("CANNOT SET STEPS: protocol not defined");
      return;
    }
    if (!this.protocols) {
      console.warn("CANNOT SET STEPS: protocols not defined");
      return;
    }
    this.protocol.steps = payload;
    this.save();
  }
  onSchemaSet(payload) {
    console.log("<ProtocolModel>:: Schema Set", payload.__head__);
    this.schema = payload;
  }
  onExportProtocolRequested(payload) {
    const protocol = this.protocol;
    const str = protocol;
    this.trigger("send-protocol", str);
  }
  onProtocolsSet(payload) {
    console.log("<ProtocolModel>:: ProtocolsSet", payload.__head__);
    if (!_.isArray(payload)) return;
    this.protocols = payload;
  }
  async onNewProtocol(payload) {
    const LABEL = "<ProtocolModel::onNewProtocol>";
    try {
      const microdrop = new MicrodropAsync();
      this.protocol = this.Protocol();
      this.protocol.steps = await microdrop.steps.createSteps();
      this.protocols.push(this.protocol);
      console.log(LABEL, "PROTOCOLS::", this.protocols);
      this.trigger("protocols-set", this.wrapData(null, this.protocols));
      this.trigger("protocol-skeletons-set", this.createProtocolSkeletons());
      this.trigger("protocol-skeleton-set", this.ProtocolSkeleton(this.protocol));
      const defaultDevicePath = path.join(__dirname, "../resources/default.svg");
      await microdrop.steps.putSteps(this.protocol.steps);
      console.log(LABEL, "RECEIVED STEPS::", this.protocol.steps);
      await microdrop.device.loadFromFilePath(defaultDevicePath);
      return this.notifySender(payload, this.protocol, "new-protocol");
    } catch (e) {
      console.log(LABEL, e);
      return this.notifySender(payload, [LABEL, e], "new-protocol", "failed");
    }
  }
  save(name=null) {
    if (!this.protocol) {
      console.error(`<ProtocolModel#save> this.protocol is ${this.protocol}`);
      return;
    }
    if (!name) {name = this.protocol.name}

    const index = this.getProtocolIndexByName(name);
    if (index < 0) {
      this.protocol = this.protocol;
      this.protocol.name = name;
      this.protocols.push(this.protocol);
    } else {
      this.protocols[index] = this.protocol;
    }

    this.trigger("protocols-set", this.wrapData(null, this.protocols));
    this.trigger("protocol-skeletons-set", this.createProtocolSkeletons());
  }

  onSaveProtocol(payload) {
    this.save(payload.name);
  }

  async onChangeProtocol(payload) {
    const LABEL = "<ProtocolModel::onChangeProtocol>"
    try {
      // Set the active / loaded protocol in the data controller
      const name = payload.name;
      const index = this.getProtocolIndexByName(name);
      if (index == -1) return;
      this.protocol = this.protocols[index];
      await this.microdrop.steps.putSteps(this.protocol.steps);
      await this.microdrop.steps.putStepNumber(0);
      this.trigger("protocol-skeleton-set", this.ProtocolSkeleton(this.protocol));
      await this.microdrop.device.putDevice(this.protocol.device);
    } catch (e) {
      var response = [LABEL, e];
      console.error(LABEL, "FAILED", response);
      return this.notifySender(payload, response, "change-protocol", "failed");
    }
    return this.notifySender(payload, this.protocol, "change-protocol");
  }

  async onLoadProtocol(payload) {
    console.log("<ProtocolModel#onLoadProtocol>");
    let requireConfirmation;
    const protocol = payload.protocol;
    const overwrite = payload.overwrite;

    // Ensure the protocol is valid before loading it
    if (!_.isPlainObject(protocol)) {
      console.error([`<ProtocolModel>:onLoadProtocol Invalid Type`, protocol]);
    }

    // TODO: Change this to a "unique id"
    const index = this.getProtocolIndexByName(protocol.name);

    // If protocol, doesn't exist then create it
    if (index == -1){
      this.protocols.push(protocol);
      this.trigger("protocols-set", this.wrapData(null, this.protocols));
      this.protocol = protocol;
      requireConfirmation = false;
    } else if (!overwrite){
      // Protocol is already loaded, don't overwrite working copy
      // unless asked to do so
      this.protocol = this.protocols[index];
      requireConfirmation = true;
    } else {
      this.protocols[index] = payload.protocol;
      this.protocol = protocol;
      requireConfirmation = false;
    }

    await this.microdrop.steps.putSteps(this.protocol.steps);
    await this.microdrop.steps.putStepNumber(0);
    this.trigger("protocol-skeleton-set", this.ProtocolSkeleton(this.protocol));
    await this.microdrop.device.putDevice(this.protocol.device);

    return this.notifySender(payload, {requireConfirmation}, "load-protocol");
  }

  onUploadProtocol(payload) {
    const protocol = payload.protocol;
    this.protocols.push(protocol);
    this.trigger("protocols-set", this.wrapData(null, this.protocols));
    this.trigger("protocol-skeletons-set", this.createProtocolSkeletons());
  }

  // ** Initializers **
  Protocol() {
    if (!this.schema) {
      console.error(`
        FAILED TO CREATE PROTOCOL
        this.schema === ${this.schema}`);
      return;
    }
    const protocol = new Object();
    protocol.name = "Protocol: " + this.time;
    const indx = this.getProtocolIndexByName(protocol.name)
    console.log("INDEX::::", indx);
    while (this.getProtocolIndexByName(protocol.name) != -1) {
      var id = Math.ceil(100*Math.random());
      protocol.name = "Protocol: " + this.time + ":" + id;
    }
    console.log("RETURNING::::", protocol);
    return protocol;
  }

  ProtocolSkeleton(protocol) {
    // Create a copy of the current protocol, with larger attributes undefined

    // Store references:
    const device = protocol.device;
    const steps = protocol.steps;
    // Temporarily remove references from protocol:
    protocol.device = undefined;
    protocol.steps  = undefined;
    // Clone:
    const skeleton = _.cloneDeep(protocol);
    // Re-add pointers:
    protocol.device = device;
    protocol.steps  = steps;

    return skeleton;
  }

  SchemaDefaults(schema) {
    // [<value>: { default: <default>,..},..] => [{<value>:<default>},..]
    const getDefaults = (obj) => {
      return _.zipObject(_.keys(obj), _.map(obj, (v) => {return v.default}))
    }
    return getDefaults(schema);
  }

}

module.exports = ProtocolModel;
