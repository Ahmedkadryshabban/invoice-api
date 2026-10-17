import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../../config/env.ts';

export const STRIPE = Symbol('STRIPE');

export const stripeProvider: Provider = {
  provide: STRIPE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) =>
    new Stripe(config.get('STRIPE_SECRET_KEY', { infer: true })),
};
