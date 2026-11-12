import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import path from 'path';
import { mkdirSync } from 'fs';
import { AppController } from './app.controller';
import { ScoutModule } from './scout/scout.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const database = path.resolve(
          config.get<string>('DATABASE_PATH') || '.data/gta6-shorts.sqlite',
        );
        mkdirSync(path.dirname(database), { recursive: true });
        return {
          type: 'better-sqlite3' as const,
          database,
          autoLoadEntities: true,
          synchronize: true,
        };
      },
    }),
    ScoutModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
