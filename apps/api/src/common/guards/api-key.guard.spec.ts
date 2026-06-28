import { ApiKeyGuard } from './api-key.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

function mockCtx(apiKey: string | undefined, isPublic = false): ExecutionContext {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
  const guard = new ApiKeyGuard(reflector);
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: apiKey ? { 'x-api-key': apiKey } : {} }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
  return ctx;
}

describe('ApiKeyGuard', () => {
  const OLD_ENV = process.env;
  beforeEach(() => { process.env = { ...OLD_ENV, API_KEY: 'test-secret' }; });
  afterEach(() => { process.env = OLD_ENV; });

  it('allows public routes without a key', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const guard = new ApiKeyGuard(reflector);
    const ctx = mockCtx(undefined, true);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows correct API key', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const guard = new ApiKeyGuard(reflector);
    const ctx = mockCtx('test-secret');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects wrong API key', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const guard = new ApiKeyGuard(reflector);
    const ctx = mockCtx('wrong-key');
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects missing API key', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const guard = new ApiKeyGuard(reflector);
    const ctx = mockCtx(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
