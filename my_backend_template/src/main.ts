import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const appName = config.getOrThrow<string>('app.name');
  const appPrefix = config.getOrThrow<string>('app.prefix');
  const appPort = config.getOrThrow<number>('app.port');
  const appHost = config.getOrThrow<string>('app.host');
  const corsOrigins = config.getOrThrow<string[]>('app.corsOrigins');
  const trustedProxies = config.getOrThrow<string[]>('app.trustedProxies');

  app.setGlobalPrefix(appPrefix, { exclude: ['health'] });
  app.use(helmet());

  if (trustedProxies.length > 0) {
    app.set('trust proxy', trustedProxies);
  }

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle(appName)
    .setDescription(`${appName} API documentation`)
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(appPort, appHost);
  Logger.log(`API running at http://localhost:${appPort}/${appPrefix}`, 'Bootstrap');
  Logger.log(`Swagger docs at http://localhost:${appPort}/api/docs`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error('Failed to start application', error instanceof Error ? error.stack : error);
  process.exit(1);
});
