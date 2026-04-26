"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
const cache_constants_1 = require("./cache.constants");
const cache_service_1 = require("./cache.service");
let CacheModule = class CacheModule {
};
exports.CacheModule = CacheModule;
exports.CacheModule = CacheModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: cache_constants_1.REDIS_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: (configService) => {
                    return new ioredis_1.default({
                        host: configService.getOrThrow('redis.host'),
                        port: configService.getOrThrow('redis.port'),
                        lazyConnect: false,
                        maxRetriesPerRequest: 3,
                    });
                },
            },
            cache_service_1.CacheService,
        ],
        exports: [cache_constants_1.REDIS_CLIENT, cache_service_1.CacheService],
    })
], CacheModule);
//# sourceMappingURL=cache.module.js.map