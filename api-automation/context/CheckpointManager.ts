import fs from 'fs';
import path from 'path';
import { ExecutionContext, type ExecutionContextData } from './ExecutionContext';
import { ApiLogger } from '../utils/ApiLogger';

export type CheckpointName = 'AUTHENTICATION' | 'LEARNING_INSTANCE_CREATED' | 'VALIDATION_COMPLETED';

interface CheckpointFile {

  completed: CheckpointName[];

  context: ExecutionContextData;
  updatedAt: string;
}

const DEFAULT_CHECKPOINT_PATH = path.resolve(process.cwd(), '.checkpoints', 'learningInstance.checkpoint.json');


export class CheckpointManager {
  constructor(private readonly filePath: string = DEFAULT_CHECKPOINT_PATH) {}

  hasCheckpoint(name: CheckpointName): boolean {
    const file = this.readFile();
    return file?.completed.includes(name) ?? false;
  }

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
