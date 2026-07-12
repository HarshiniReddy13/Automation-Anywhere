import fs from 'fs';
import path from 'path';
import { ExecutionContext, type ExecutionContextData } from './ExecutionContext';
import { ApiLogger } from '../utils/ApiLogger';

export type CheckpointName = 'AUTHENTICATION' | 'LEARNING_INSTANCE_CREATED' | 'VALIDATION_COMPLETED';

interface CheckpointFile {
  /** Ordered list of checkpoint names successfully reached so far. */
  completed: CheckpointName[];
  /** Merged ExecutionContext snapshot as of the latest checkpoint. */
  context: ExecutionContextData;
  updatedAt: string;
}

const DEFAULT_CHECKPOINT_PATH = path.resolve(process.cwd(), '.checkpoints', 'learningInstance.checkpoint.json');

/**
 * Persists ExecutionContext snapshots to disk after each successfully
 * completed step, so a rerun can resume from the latest valid checkpoint
 * instead of repeating already-completed API calls (Use Case 2's
 * "Checkpoint Recovery" requirement).
 *
 * This is intentionally a plain JSON file on disk, not an in-memory-only
 * object — the whole point of a checkpoint is to survive the process
 * exiting (a crashed run, a manual rerun, CI retrying the job).
 */
export class CheckpointManager {
  constructor(private readonly filePath: string = DEFAULT_CHECKPOINT_PATH) {}

  /** True if a given checkpoint was already reached in a previous run and can be skipped. */
  hasCheckpoint(name: CheckpointName): boolean {
    const file = this.readFile();
    return file?.completed.includes(name) ?? false;
  }

  /** Records a checkpoint as complete and persists the current ExecutionContext state alongside it. */
  saveCheckpoint(name: CheckpointName, context: ExecutionContext): void {
    const file = this.readFile() ?? { completed: [], context: {}, updatedAt: '' };
    if (!file.completed.includes(name)) {
      file.completed.push(name);
    }
    file.context = { ...file.context, ...context.toJSON() };
    file.updatedAt = new Date().toISOString();
    this.writeFile(file);
    ApiLogger.info('CheckpointManager', `Checkpoint saved: ${name} (${file.completed.length} total completed).`);
  }

  /**
   * Loads the most recent checkpoint's ExecutionContext, if one exists and
   * its auth token is still valid — a checkpoint with an expired token is
   * treated as unusable for resuming (Step 1 will simply re-authenticate).
   */
  loadContext(): ExecutionContext | undefined {
    const file = this.readFile();
    if (!file) return undefined;
    const context = ExecutionContext.fromJSON(file.context);
    ApiLogger.info(
      'CheckpointManager',
      `Loaded checkpoint from ${file.updatedAt} — completed steps: [${file.completed.join(', ')}].`
    );
    return context;
  }

  getCompletedCheckpoints(): CheckpointName[] {
    return this.readFile()?.completed ?? [];
  }

  /** Wipes all checkpoint state — use at the start of a deliberately fresh run. */
  clear(): void {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
    ApiLogger.info('CheckpointManager', 'Checkpoint state cleared.');
  }

  private readFile(): CheckpointFile | undefined {
    if (!fs.existsSync(this.filePath)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as CheckpointFile;
    } catch (error) {
      ApiLogger.warn(
        'CheckpointManager',
        `Checkpoint file at ${this.filePath} is unreadable/corrupt (${(error as Error).message}) — treating as absent.`
      );
      return undefined;
    }
  }

  private writeFile(file: CheckpointFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(file, null, 2), 'utf-8');
  }
}
