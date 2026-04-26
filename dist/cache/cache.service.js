"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const cache_constants_1 = require("./cache.constants");
let CacheService = class CacheService {
    redisClient;
    constructor(redisClient) {
        this.redisClient = redisClient;
    }
    async get(key) {
        const value = await this.redisClient.get(key);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }
    async set(key, value, ttlSeconds) {
        const serializedValue = JSON.stringify(value);
        if (ttlSeconds) {
            await this.redisClient.set(key, serializedValue, 'EX', ttlSeconds);
            return;
        }
        await this.redisClient.set(key, serializedValue);
    }
    async del(key) {
        await this.redisClient.del(key);
    }
    async reset() {
        await this.redisClient.flushdb();
    }
    async ping() {
        return this.redisClient.ping();
    }
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(cache_constants_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [ioredis_1.default])
], CacheService);
//# sourceMappingURL=cache.service.js.map