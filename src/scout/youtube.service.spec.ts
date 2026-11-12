import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { CryptoService } from './crypto.service';
import { MediaItem } from './entities/media-item.entity';
import { YoutubeCredential } from './entities/youtube-credential.entity';
import { YoutubeService } from './youtube.service';

describe('YoutubeService', () => {
  const input = {
    title: 'Teste',
    description: 'Descrição',
    privacyStatus: 'private' as const,
    tags: [],
    rightsConfirmed: true,
  };

  function service() {
    const credentials = {
      findOneBy: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<YoutubeCredential>;
    return new YoutubeService(
      new ConfigService(),
      {} as CryptoService,
      credentials,
    );
  }

  it('aceita o arquivo baixado sem exigir narração', async () => {
    const item = {
      rightsConfirmed: true,
      localFilePath: 'video-original.mp4',
      processedFilePath: null,
    } as MediaItem;

    await expect(service().publish(item, input)).rejects.toThrow(
      'Conecte o canal do YouTube primeiro',
    );
  });

  it('rejeita publicação quando não há nenhum arquivo local', async () => {
    const item = {
      rightsConfirmed: true,
      localFilePath: null,
      processedFilePath: null,
    } as MediaItem;

    await expect(service().publish(item, input)).rejects.toThrow(
      'Baixe e revise o vídeo antes de publicar',
    );
  });
});
