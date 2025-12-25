import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  private redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const redisConfig = this.configService.get('redis');
    this.redis = new Redis({
      host: redisConfig?.host || 'localhost',
      port: redisConfig?.port || 6381,
      password: redisConfig?.password,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
    });
  }

  @Get()
  async check() {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: 'unknown',
        redis: 'unknown',
      },
    };

    // Check PostgreSQL connection
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.services.database = 'healthy';
    } catch (error) {
      checks.services.database = 'unhealthy';
      checks.status = 'degraded';
    }

    // Check Redis connection
    try {
      await this.redis.ping();
      checks.services.redis = 'healthy';
    } catch (error) {
      checks.services.redis = 'unhealthy';
      checks.status = 'degraded';
    }

    return checks;
  }

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.redis.ping();
      return { status: 'ready' };
    } catch (error) {
      return { status: 'not_ready', error: error.message };
    }
  }
}
