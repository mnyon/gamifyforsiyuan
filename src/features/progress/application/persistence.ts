import type { ProgressState } from '../domain/types.js';

export interface ProgressRepository {
  read(): Promise<ProgressState | null>;
  write(state: ProgressState): Promise<void>;
}

/** One ordered writer per plugin session. Failure permanently closes this queue. */
export class ProgressWriter {
  private chain: Promise<void> = Promise.resolve();
  private failure: unknown;
  private stopped = false;
  constructor(private readonly repository: Pick<ProgressRepository, 'write'>) {}
  get failed(): boolean {
    return this.stopped;
  }
  stop(reason: unknown = new Error('进度保存已暂停')): void {
    this.stopped = true;
    this.failure ??= reason;
  }
  async save(state: ProgressState): Promise<void> {
    try {
      // Capture now, before waiting for preceding writes. Do not retain the mutable domain object.
      const snapshot = JSON.parse(JSON.stringify(state)) as ProgressState;
      this.chain = this.chain.then(async () => {
        if (this.stopped) throw this.failure;
        await this.repository.write(snapshot);
      });
      await this.chain;
    } catch (error) {
      this.stop(error);
      const detail =
        error instanceof Error
          ? error.message
          : typeof error === 'object' &&
              error !== null &&
              'message' in error &&
              typeof error.message === 'string'
            ? error.message
            : typeof error === 'object' &&
                error !== null &&
                'msg' in error &&
                typeof error.msg === 'string'
              ? error.msg
              : '本地文件写入失败';
      throw new Error('进度保存失败，已暂停奖励（' + detail + '）；请重新启用插件后重试');
    }
  }
}
