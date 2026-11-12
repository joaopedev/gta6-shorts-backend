import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CutProject } from './cut-project.entity';

@Entity('cut_candidates')
export class CutCandidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  projectId: string;

  @ManyToOne(() => CutProject, (project) => project.candidates, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project: CutProject;

  @Column({ type: 'real' })
  startSeconds: number;

  @Column({ type: 'real' })
  endSeconds: number;

  @Column('text')
  title: string;

  @Column('text')
  hook: string;

  @Column('text')
  reason: string;

  @Column({ type: 'integer', default: 0 })
  score: number;

  @Column('text')
  filePath: string;

  @Column({ type: 'text', nullable: true })
  mediaItemId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
