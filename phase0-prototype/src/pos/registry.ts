import type { PosAdapter, PosAdapterFactory, TenantPosConfig } from './adapter.ts';

export class PosRegistry {
  private readonly factories = new Map<string, PosAdapterFactory>();

  register(posType: string, factory: PosAdapterFactory): this {
    this.factories.set(posType, factory);
    return this;
  }

  resolve(config: TenantPosConfig): PosAdapter | undefined {
    return this.factories.get(config.posType)?.(config);
  }
}
