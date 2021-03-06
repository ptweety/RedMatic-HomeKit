const Accessory = require('./lib/accessory');

module.exports = class HmipSmi extends Accessory {
    init(config, node) {
        this.addService('OccupancySensor', config.name)
            .get('OccupancyDetected', config.deviceAddress + ':1.PRESENCE_DETECTION_STATE')
            .get('StatusTampered', config.deviceAddress + ':0.SABOTAGE');

        this.addService('BatteryService', config.name)
            .get('StatusLowBattery', config.deviceAddress + ':0.LOW_BAT', (value, c) => {
                return value ? c.BATTERY_LEVEL_LOW : c.BATTERY_LEVEL_NORMAL;
            })
            .get('BatteryLevel', config.deviceAddress + ':0.OPERATING_VOLTAGE', this.percent);

        const lightSensorOption = config.description.ADDRESS + ':LightSensor';
        if (!(config.options[lightSensorOption] && config.options[lightSensorOption].disabled)) {
            this.addService('LightSensor', config.name)
                .get('CurrentAmbientLightLevel', config.deviceAddress + ':1.ILLUMINATION');
        }
    }
};
