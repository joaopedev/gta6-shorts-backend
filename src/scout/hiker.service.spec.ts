import { extractHikerMedia } from './hiker.service';

describe('Hiker media parser', () => {
  it('extracts and normalizes a reel from the search response', () => {
    const result = extractHikerMedia({
      reels_serp_modules: [
        {
          module_type: 'clips',
          clips: [
            {
              media: {
                pk: '1234567890123456789',
                code: 'DExample',
                product_type: 'clips',
                caption: { text: 'GTA VI gameplay' },
                user: { username: 'creator', full_name: 'Creator' },
                video_versions: [
                  {
                    url: 'https://cdn.example/low.mp4',
                    width: 360,
                    height: 640,
                  },
                  {
                    url: 'https://cdn.example/high.mp4',
                    width: 1080,
                    height: 1920,
                  },
                ],
                image_versions2: {
                  candidates: [
                    {
                      url: 'https://cdn.example/cover.jpg',
                      width: 1080,
                      height: 1920,
                    },
                  ],
                },
                play_count: 12345,
                like_count: 543,
                comment_count: 21,
                video_duration: 34.5,
              },
            },
          ],
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sourceMediaId: '1234567890123456789',
      shortcode: 'DExample',
      creatorUsername: 'creator',
      sourceVideoUrl: 'https://cdn.example/high.mp4',
      sourcePermalink: 'https://www.instagram.com/reel/DExample/',
      playCount: 12345,
    });
  });

  it('ignores regular feed objects without video metadata', () => {
    expect(extractHikerMedia({ id: '1', product_type: 'feed' })).toEqual([]);
  });
});
