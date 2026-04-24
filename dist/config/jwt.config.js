"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jwtConfig = void 0;
const config_1 = require("@nestjs/config");
exports.jwtConfig = (0, config_1.registerAs)('jwt', () => ({
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
}));
//# sourceMappingURL=jwt.config.js.map