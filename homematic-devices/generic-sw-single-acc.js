const Accessory = require('./lib/accessory');

module.exports = class HmSw extends Accessory {
    init(config, node) {
        const {bridgeConfig, ccu} = node;

        const channels = config.description.CHILDREN;

        for (let i = 1; i < channels.length; i++) {
            const ch = config.description.ADDRESS + ':' + i;
            if (config.options[ch] && config.options[ch].disabled) {
                continue;
            }

            const name = ccu.channelNames[channels[i]];
            const dp = config.iface + '.' + channels[i] + '.STATE';

            this.addService('Switch', name)
                .get('On', dp)
                .set('On', dp);
        }
    }
};
