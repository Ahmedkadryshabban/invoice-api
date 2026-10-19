import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { MailService } from './mail.service.ts';

const POLL_INTERVAL_MS = 5_000;

@Injectable()
export class MailWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MailWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly mailService: MailService) {}

  onApplicationBootstrap() {
    this.schedule();
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick();
    }, POLL_INTERVAL_MS);
  }

  private async tick() {
    try {
      await this.mailService.sendDue();
    } catch (error) {
      this.logger.error(
        'Mail worker tick failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
    this.schedule();
  }
}
