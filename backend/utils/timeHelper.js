const SystemSettings = require("../models/SystemSettings");

/**
 * Returns the current virtual date.
 * If a Time Warp is active, it returns the mockDate.
 * Otherwise, it returns the real-world current date.
 */
exports.getVirtualNow = async () => {
    const settings = await SystemSettings.findOne();
    if (settings && settings.mockDate) {
        return new Date(settings.mockDate);
    }
    return new Date();
};