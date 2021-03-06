const Key = require('keyboard-shortcut');
// const PhosphorWidgets = require('@phosphor/widgets');
const request = require('browser-request');

const {MicropedeClient} = require('@micropede/client/src/client.js');

if (!window.microdropPlugins)
  window.microdropPlugins = new Map();

const APPNAME = 'microdrop';

String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

class UIPlugin extends MicropedeClient {
  constructor(element, focusTracker, port, options) {
    super(APPNAME, undefined, port, undefined, undefined, options);
    this.element = element;
    this.focusTracker = focusTracker;
    this.port = port;
    Key("delete", () => {
      if (this.hasFocus) this.trigger("delete");
    });
  }

  get isPlugin() { return true }
  get element() {return this._element}
  get hasFocus() {return this.element == this.focusTracker.currentWidget.node}
  set element(element) {
    element.tabIndex = 0; this._element = element;
  }

  changeElement(k,item) {
    if (this[k]) this.element.removeChild(this[k]);
    this.element.appendChild(item);
    this[`_${k}`] = item;
  }

  static Widget(dock, focusTracker, PhosphorWidgets) {
    /* Add plugin to specified dock panel */
    return new Promise((resolve, reject) => {
      request('/mqtt-ws-port', (er, response, body) => {
        const widget = new PhosphorWidgets.Widget();
        widget.addClass("content");
        const port = parseInt(body);
        let storageUrl = window.location.origin;
        const options = {storageUrl: storageUrl, resubscribe: false};
        const plugin = new this(widget.node,focusTracker, port, options);
        widget.title.label = plugin.name.replace("-ui-plugin", "").capitalize();
        widget.plugin = plugin;
        widget.title.closable = false;
        dock.addWidget(widget);
        plugin.on("activate-tab", ()=> {
          dock.activateWidget(widget);
        })
        // panel.activateWidget(widget);
        focusTracker.add(widget);
        resolve(widget);
      });
    });
  }

}

module.exports = UIPlugin;
