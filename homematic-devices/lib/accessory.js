class Service {
    constructor(acc, subtype) {
        this.acc = acc;
        this.subtype = subtype;
        return this;
    }
    get(characteristic, datapointNameOrCallback, transform) {
        if (typeof datapointNameOrCallback === 'function') {
            this.acc.addListener('get', this.subtype, characteristic, datapointNameOrCallback);
        } else {
            this.acc.datapointGet(this.subtype, characteristic, datapointNameOrCallback, transform);
        }
        return this;
    }
    set(characteristic, datapointNameOrCallback, transform) {
        if (typeof datapointNameOrCallback === 'function') {
            this.acc.addListener('set', this.subtype, characteristic, datapointNameOrCallback);
        } else {
            this.acc.datapointSet(this.subtype, characteristic, datapointNameOrCallback, transform);
        }
        return this;
    }
    setProps(characteristic, props) {
        this.acc.setProps(this.subtype, characteristic, props);
        return this;
    }
    fault(datapointNameArr, transformArr) {
        this.acc.datapointsFault(this.subtype, datapointNameArr, transformArr);
        return this;
    }
}

module.exports = class Accessory {
    constructor(config, node) {
        const {bridgeConfig, ccu} = node;
        const {hap} = bridgeConfig;
        this.ccu = ccu;
        this.hap = hap;
        this.node = node;
        this.config = config;

        this.acc = bridgeConfig.accessory({id: config.description.ADDRESS, name: config.name});

        if (!this.acc) {
            return;
        }

        this.acc.getService(hap.Service.AccessoryInformation)
            .setCharacteristic(hap.Characteristic.Manufacturer, 'eQ-3')
            .setCharacteristic(hap.Characteristic.Model, config.description.TYPE)
            .setCharacteristic(hap.Characteristic.SerialNumber, config.description.ADDRESS)
            .setCharacteristic(hap.Characteristic.FirmwareRevision, config.description.FIRMWARE);

        this.acc.on('identify', this.identify);

        this.listeners = [];
        this.subscriptions = [];
        this.subtypeCounter = 0;

        node.on('close', () => {
            node.debug('removing listeners ' + config.description.TYPE + ' ' + config.name);
            this.acc.removeListener('identify', () => this.identify());
            this.removeListeners();
            this.removeSubscriptions();
        });

        if (typeof this.init === 'function') {
            node.debug('init accessory ' + config.description.TYPE + ' ' + config.name);
            this.init(config, node);
        }
    }

    addService(type, name, subtypeIdentifier = '') {
        const subtype = subtypeIdentifier + String(this.subtypeCounter++);
        if (this.acc.getService(subtype)) {
            this.node.debug('service (' + subtype + ') already existing ' + this.config.description.TYPE + ' ' + this.config.name);
        } else {
            this.node.debug('add service ' + type + ' (' + subtype + ') to ' + this.config.description.TYPE + ' ' + this.config.name);
            this.acc.addService(this.hap.Service[type], name, subtype);
        }
        this.datapointUnreach(this.config.deviceAddress + ':0.UNREACH');
        return new Service(this, subtype);
    }

    addListener(event, subtype, characteristic, callback) {
        if (this.acc.getService(subtype)) {
            this.acc.getService(subtype).getCharacteristic(this.hap.Characteristic[characteristic]).on(event, callback);
            this.node.debug('add ' + event + ' listener ' + characteristic + ' (' + subtype + ') to ' + this.config.description.TYPE + ' ' + this.config.name);
            this.listeners.push({event, subtype, characteristic, callback});
        } else {
            this.node.error('service (' + subtype + ') does not exist on ' + this.config.description.TYPE + ' ' + this.config.name);
        }
    }

    removeListeners() {
        if (this.listeners.length > 0) {
            const {event, subtype, characteristic, callback} = this.listeners.shift();
            this.node.debug('remove ' + event + ' listener ' + characteristic + ' (' + subtype + ') from ' + this.config.description.TYPE + ' ' + this.config.name);
            this.acc.getService(subtype).getCharacteristic(this.hap.Characteristic[characteristic]).removeListener(event, callback);
            this.removeListeners();
        }
    }

    removeSubscriptions() {
        if (this.subscriptions.length > 0) {
            this.ccu.unsubscribe(this.subscriptions.shift());
            this.removeSubscriptions();
        }
    }
    
    getError() {
        return this.unreach ? new Error(this.hap.HAPServer.Status.SERVICE_COMMUNICATION_FAILURE) : null;
    }

    datapointUnreach(datapointName) {
        this.subscriptions.push(this.ccu.subscribe({
            cache: true,
            change: true,
            datapointName
        }, msg => {
            this.unreach = msg.value;
        }));
    }

    datapointsFault(subtype, datapointNameArr, transformArr) {
        if (!transformArr) {
            transformArr = [];
        }
        const values = {};
        datapointNameArr.forEach((dp, i) => {
            this.subscriptions.push(this.ccu.subscribe({
                cache: true,
                change: true,
                datapointName: dp
            }, msg => {
                values[msg.datapointName] = msg.value;
                let value = this.hap.Characteristic.StatusFault.NO_FAULT;
                if (typeof transformArr[i] === 'function') {
                    value = transformArr[i](value);
                }
                Object.keys(values).forEach(key => {
                    if (values[key]) {
                        value = this.hap.Characteristic.StatusFault.GENERAL_FAULT;
                    }
                });
                this.node.debug('update ' + this.config.name + ' (' + subtype + ') StatusFault ' + value);
                this.acc.getService(subtype).updateCharacteristic(this.hap.Characteristic.StatusFault, value);
            }));
        });
    }

    datapointGet(subtype, characteristic, datapointName, transform) {
        this.addListener('get', subtype, characteristic, callback => {
            let valueOrig = this.ccu.values && this.ccu.values[datapointName] && this.ccu.values[datapointName].value;
            let value = valueOrig;
            if (typeof transform === 'function') {
                value = transform(value, this.hap.Characteristic[characteristic]);
            }
            this.node.debug('get ' + this.config.name + ' (' + subtype + ') ' + characteristic + ' ' + valueOrig + ' -> ' + this.getError() + ' ' + value);
            callback(this.getError(), value);
        });

        this.node.debug('subscribe ' + datapointName);
        this.subscriptions.push(this.ccu.subscribe({
            cache: true,
            change: true,
            stable: true,
            datapointName
        }, msg => {
            let valueOrig = msg.value;
            let value = valueOrig;
            if (typeof transform === 'function') {
                value = transform(value, this.hap.Characteristic[characteristic]);
            }
            this.node.debug('update ' + this.config.name + ' (' + subtype + ') ' + characteristic + ' ' + valueOrig + ' -> ' + this.getError() + ' ' + value);
            this.acc.getService(subtype).updateCharacteristic(this.hap.Characteristic[characteristic], value);
        }));
    }

    datapointSet(subtype, characteristic, datapointName, transform) {
        this.addListener('set', subtype, characteristic, (value, callback) => {
            let valueOrig = value;
            if (typeof transform === 'function') {
                value = transform(value, this.hap.Characteristic[characteristic]);
            }
            const [iface, channel, dp] = datapointName.split('.');
            this.node.debug('set ' + this.config.name + ' (' + subtype + ') ' + characteristic + ' ' +  valueOrig + ' -> ' + datapointName + ' ' + value);
            this.ccu.setValue(iface, channel, dp, value)
                .then(() => {
                    callback();
                })
                .catch(() => {
                    callback(new Error(this.hap.HAPServer.Status.SERVICE_COMMUNICATION_FAILURE));
                });
        });
    }

    setProps(subtype, characteristic, props) {
        this.acc.getService(subtype)
            .getCharacteristic(this.hap.Characteristic[characteristic])
            .setProps(props);
    }

    identify(paired, callback)  {
        this.node.info('identify ' + this.config.name + ' ' + this.config.description.TYPE + ' ' + this.config.description.ADDRESS);
        callback();
    }

    option(id) {
        const option = this.config.description.ADDRESS + ':' + id;
        return !(this.config.options[option] && this.config.options[option].disabled);
    }

    percent(value, _, lower = 2, upper = 3) {
        let p = Math.round((value - lower) * (100 / (upper - lower)));
        if (!p || p < 0) {
            p = 0;
        } else if (p > 100) {
            p = 100;
        }
        return p;
    }

    lux(value) {
        return Math.round(10 ** (value / 50)) || 1;
    }
};
