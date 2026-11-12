import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('youtube_credentials')
export class YoutubeCredential {
  @PrimaryColumn({ type: 'text', default: 'default' })
  id: string;

  @Column({ type: 'text', nullable: true })
  accessToken: string | null;

  @Column({ type: 'text', nullable: true })
  refreshToken: string | null;

  @Column({ type: 'integer', nullable: true })
  expiryDate: number | null;

  @Column({ type: 'text', nullable: true })
  scope: string | null;

  @Column({ type: 'text', nullable: true })
  tokenType: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
