import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Scan } from './scan.entity';

export type WorkflowStatus =
  | 'discovered'
  | 'approved'
  | 'downloaded'
  | 'publishing'
  | 'published'
  | 'rejected'
  | 'failed';

@Entity('media_items')
export class MediaItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column('text')
  sourceMediaId: string;

  @Column({ type: 'text', nullable: true })
  shortcode: string | null;

  @Column({ type: 'text', default: 'instagram' })
  sourceNetwork: string;

  @Column('text')
  sourceQuery: string;

  @Column('text')
  targetCountryCode: string;

  @Column('text')
  targetCountryName: string;

  @Column('text')
  targetRegion: 'asia' | 'europe' | 'youtube';

  @Column({ type: 'text', default: 'search_query' })
  countryMatchBasis: string;

  @Column({ type: 'text', nullable: true })
  caption: string | null;

  @Column({ type: 'text', nullable: true })
  creatorUsername: string | null;

  @Column({ type: 'text', nullable: true })
  creatorName: string | null;

  @Column({ type: 'text', nullable: true })
  creatorAvatarUrl: string | null;

  @Column({ type: 'text', nullable: true })
  thumbnailUrl: string | null;

  @Column({ type: 'text', nullable: true })
  sourceVideoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  sourcePermalink: string | null;

  @Column({ type: 'integer', default: 0 })
  likeCount: number;

  @Column({ type: 'integer', default: 0 })
  commentCount: number;

  @Column({ type: 'integer', default: 0 })
  playCount: number;

  @Column({ type: 'real', nullable: true })
  durationSeconds: number | null;

  @Column({ type: 'text', nullable: true })
  audioTitle: string | null;

  @Column({ type: 'datetime', nullable: true })
  sourcePublishedAt: Date | null;

  @Column({ type: 'text', default: 'discovered' })
  workflowStatus: WorkflowStatus;

  @Column({ type: 'text', nullable: true })
  localFilePath: string | null;

  @Column({ type: 'text', nullable: true })
  processedFilePath: string | null;

  @Column({ type: 'text', nullable: true })
  narrationScript: string | null;

  @Column({ type: 'text', nullable: true })
  narrationVoice: string | null;

  @Column({ type: 'boolean', default: false })
  captionsBurned: boolean;

  @Column({ type: 'text', nullable: true })
  processedKind: 'edited' | 'narrated' | 'youtube_cut' | null;

  @Column({ type: 'real', nullable: true })
  editStartSeconds: number | null;

  @Column({ type: 'real', nullable: true })
  editEndSeconds: number | null;

  @Column({ type: 'text', nullable: true })
  audioMode: 'original' | 'mute' | 'narration' | null;

  @Column({ type: 'text', nullable: true })
  outputFormat: 'original' | 'vertical' | null;

  @Column({ type: 'datetime', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  youtubeVideoId: string | null;

  @Column({ type: 'text', nullable: true })
  youtubeUrl: string | null;

  @Column({ type: 'text', nullable: true })
  processingError: string | null;

  @Column({ type: 'boolean', default: false })
  rightsConfirmed: boolean;

  @Column({ type: 'text', nullable: true })
  scanId: string | null;

  @ManyToOne(() => Scan, (scan) => scan.items, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'scanId' })
  scan: Scan | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
