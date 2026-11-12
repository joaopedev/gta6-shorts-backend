import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CutCandidate } from './cut-candidate.entity';

export type CutProjectStatus = 'analyzing' | 'completed' | 'failed';

@Entity('cut_projects')
export class CutProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  title: string;

  @Column({ type: 'text', nullable: true })
  sourceUrl: string | null;

  @Column('text')
  originalFilePath: string;

  @Column({ type: 'real', default: 0 })
  durationSeconds: number;

  @Column({ type: 'text', default: 'analyzing' })
  status: CutProjectStatus;

  @Column({ type: 'text', default: 'auto' })
  language: string;

  @Column({ type: 'integer', default: 3 })
  requestedClips: number;

  @Column({ type: 'integer', default: 20 })
  minSeconds: number;

  @Column({ type: 'integer', default: 45 })
  maxSeconds: number;

  @Column({ type: 'text', nullable: true })
  transcript: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @OneToMany(() => CutCandidate, (candidate) => candidate.project)
  candidates: CutCandidate[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
