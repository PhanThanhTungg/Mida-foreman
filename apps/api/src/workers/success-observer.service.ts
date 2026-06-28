import { Injectable, Logger } from '@nestjs/common';
import type { SuccessCondition, AgentRunResult } from '@foreman/types';

@Injectable()
export class SuccessObserverService {
  private readonly logger = new Logger(SuccessObserverService.name);

  async check(conditions: SuccessCondition[], result: AgentRunResult): Promise<boolean> {
    for (const condition of conditions) {
      const passed = this.evaluate(condition, result);
      this.logger.log(`Condition ${condition}: ${passed ? 'PASS' : 'FAIL'}`);
      if (!passed) return false;
    }
    return true;
  }

  private evaluate(condition: SuccessCondition, result: AgentRunResult): boolean {
    switch (condition) {
      case 'mr_created': return result.mrUrl !== null;
      case 'no_build_errors': return result.success && !result.error;
      case 'ci_passed': return result.success && result.mrUrl !== null;
    }
  }
}
