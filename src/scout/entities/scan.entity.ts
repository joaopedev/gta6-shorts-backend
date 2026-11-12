import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaItem } from './media-item.entity';

export type ScanStatus = 'running' | 'paused' | 'completed' | 'failed';

@Entity('scans')
export class Scan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('simple-json')
  keywords: string[];

  @Column('simple-json')
  countryCodes: string[];

  @Column({ type: 'integer', default: 1 })
  pagesPerQuery: number;

  @Column({ type: 'text', default: 'running' })
  status: ScanStatus;

  @Column({ type: 'integer', default: 0 })
  requestsUsed: number;

  @Column({ type: 'integer', default: 0 })
  resultsFound: number;

  @Column({ type: 'integer', default: 0 })
  newItems: number;

  @Column({ type: 'integer', default: 0 })
  processedQueries: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => MediaItem, (item) => item.scan)
  items: MediaItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
