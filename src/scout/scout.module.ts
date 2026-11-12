import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoService } from './crypto.service';
import { CutCandidate } from './entities/cut-candidate.entity';
import { CutProject } from './entities/cut-project.entity';
import { MediaItem } from './entities/media-item.entity';
import { Scan } from './entities/scan.entity';
import { YoutubeCredential } from './entities/youtube-credential.entity';
import { HikerService } from './hiker.service';
import { MediaStudioService } from './media-studio.service';
import { ScoutController } from './scout.controller';
import { ScoutService } from './scout.service';
import { YoutubeService } from './youtube.service';
import { YoutubeCutsService } from './youtube-cuts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Scan,
      MediaItem,
      YoutubeCredential,
      CutProject,
      CutCandidate,
    ]),
  ],
  controllers: [ScoutController],
  providers: [
    ScoutService,
    HikerService,
    YoutubeService,
    CryptoService,
    MediaStudioService,
    YoutubeCutsService,
  ],
})
export class ScoutModule {}
