import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { DISPATCH_OUTBOX_JOB, MAIL_DISPATCH_QUEUE } from './mail.queues.ts';
import { MailService } from './mail.service.ts';

const DISPATCH_INTERVAL_MS = 2_000;

@Processor(MAIL_DISPATCH_QUEUE)
export class MailDispatchProcessor
  extends WorkerHost
  implements OnApplicationBootstrap, OnModuleDestroy
{
  constructor(
    @InjectQueue(MAIL_DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async onApplicationBootstrap() {
    await this.dispatchQueue.upsertJobScheduler(
      DISPATCH_OUTBOX_JOB,
      { every: DISPATCH_INTERVAL_MS },
      { name: DISPATCH_OUTBOX_JOB },
    );
  }

  async onModuleDestroy() {
    await this.worker.close();
  }

  async process(): Promise<void> {
    await this.mailService.dispatchDue();
  }
}
