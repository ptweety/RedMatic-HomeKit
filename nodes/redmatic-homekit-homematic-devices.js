module.exports = function (RED) {
    class RedMaticHomeKitHomematicDevices {
        constructor(config) {
            RED.nodes.createNode(this, config);

            this.bridgeConfig = RED.nodes.getNode(config.bridgeConfig);

            if (!this.bridgeConfig) {
                return;
            }

            this.ccu = RED.nodes.getNode(config.ccuConfig);
            this.devices = config.devices;

            if (!this.ccu) {
                return;
            }

            this.bridgeConfig.waitForHomematic = true;
            this.ccu.register(this);

            this.homematicDevices = {};
            this.homematicInvalidDevices = [
                'hm-cc-vd',
                'hm-dis-ep-wm55',
                'hm-ou-cfm-pl',
                'hm-pb-2-wm55-2',
                'hm-pb-4dis-wm-2',
                'hm-pb-6-wm55',
                'hm-pbi-4-fm',
                'hm-rc-2-pbu-fm',
                'hm-rc-4-2',
                'hm-rc-4-3',
                'hm-rc-4-b',
                'hm-rc-8',
                'hm-rc-12',
                'hm-rc-12-b',
                'hm-rc-19',
                'hm-rc-19-sw',
                'hm-rc-dis-h-x-eu',
                'hm-rc-key3-b',
                'hm-rc-key4-2',
                'hm-rcv-50',
                'hm-sec-sd-2-team',
                'hm-sec-sd-team',
                'hm-sec-sfa-sm',
                'hm-sen-rd-o',
                'hm-wdc7000',
                'hmw-rcv-50',
                'hmip-asir',
                'hmip-brc2',
                'hmip-krca',
                'hmip-wrc2',
                'hmip-wrc6'
            ];
        }

        publishDevices() {
            if (!this.ccu.channelNames) {
                this.error('ccu.channelNames missing');
                return;
            }
            if (!this.ccu.metadata.devices) {
                this.error('ccu.metadata.devices missing');
                return;
            }
            if (!this.devices) {
                this.devices = {};
            }
            Object.keys(this.ccu.channelNames).forEach(address => {
                if (this.devices[address] && this.devices[address].disabled) {
                    return;
                }
                if (!address.match(/:\d+$/)) {
                    const iface = this.ccu.findIface(address);
                    if (iface && this.ccu.enabledIfaces.includes(iface) && this.ccu.metadata.devices[iface]) {
                        const options = {};
                        Object.keys(this.devices).forEach(addr => {
                            if (addr === address || addr.startsWith(address + ':')) {
                                options[addr] = this.devices[addr];
                            }
                        });
                        this.createHomematicDevice({
                            name: this.ccu.channelNames[address],
                            iface,
                            deviceAddress: iface + '.' + address,
                            description: this.ccu.metadata.devices[iface][address],
                            options
                        });
                    }
                }
            });
        }

        createHomematicDevice(dev) {
            let type = dev && dev.description && dev.description.TYPE;
            if (!type) {
                this.error('invalid homematic device type ' + type);
                return;
            }
            type = type.toLowerCase();
            if (this.homematicInvalidDevices.includes(type)) {
                return;
            }
            if (!this.homematicDevices[type]) {
                try {
                    this.homematicDevices[type] = require('../homematic-devices/' + type);
                    this.debug('loaded homematic-devices/' + type);
                } catch (error) {
                    this.warn('missing homematic-devices/' + type);
                    this.homematicInvalidDevices.push(type);
                    return;
                }
            }
            if (this.homematicDevices[type] && typeof this.homematicDevices[type] === 'function') {
                try {
                    return new this.homematicDevices[type](dev, this);
                } catch (error) {
                    this.error('createHomematicDevice Exception ' + dev.name + ' ' + type);
                    this.error(error.stack);
                    return;
                }

            }
            this.error('invalid homematic-devices/' + type);
            this.homematicInvalidDevices.push(type);
        }

        setStatus(data) {
            this.ccuStatus = data;
            let status = 0;
            Object.keys(data.ifaceStatus).forEach(s => {
                if (data.ifaceStatus[s] || s === 'ReGaHSS') {
                    status += 1;
                }
            });
            this.debug(JSON.stringify(data))
            if (status <= 1) {
                this.status({fill: 'red', shape: 'dot', text: 'disconnected'});
            } else if (status === this.ccu.enabledIfaces.length) {
                this.status({fill: 'green', shape: 'dot', text: 'connected'});
                if (!this.ccuConnected) {
                    this.debug('connection status green')
                    this.publishDevices();
                    this.bridgeConfig.waitForHomematic = false;
                    this.bridgeConfig.emit('homematic-ready');
                }
                this.ccuConnected = true;
            } else {
                this.status({fill: 'yellow', shape: 'dot', text: 'partly connected'});
            }
        }

        _destructor(done) {
            this.ccu.deregister(this);
            this.ccu.unsubscribe(this.idSubscription);
            done();
        }
    }

    RED.nodes.registerType('redmatic-homekit-homematic-devices', RedMaticHomeKitHomematicDevices);
};
