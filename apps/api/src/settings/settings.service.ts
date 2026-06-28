import { Injectable } from '@nestjs/common';
import type { Setting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_PATTERN = /(_token|_api_token)$/;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Setting[]> {
    const settings = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return settings.map((s) => ({
      ...s,
      value: SENSITIVE_PATTERN.test(s.key) ? '***' : s.value,
    }));
  }

  async upsert(settings: { key: string; value: string }[]): Promise<Setting[]> {
    return Promise.all(
      settings.map((s) =>
        this.prisma.setting.upsert({
          where: { key: s.key },
          create: { key: s.key, value: s.value },
          update: { value: s.value },
        }),
      ),
    );
  }

  async getRaw(key: string): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    return setting?.value ?? null;
  }
}
