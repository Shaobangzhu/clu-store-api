"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appConfig = void 0;
const config_1 = require("@nestjs/config");
exports.appConfig = (0, config_1.registerAs)('app', () => ({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
}));
//# sourceMappingURL=app.config.js.map