import { Controller, Param, Post } from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { AiFieldService } from './ai-field.service';

@Controller('api/table/:tableId/record/:recordId/field/:fieldId')
export class AiFieldController {
  constructor(private readonly aiFieldService: AiFieldService) {}

  /**
   * Explicitly triggered, not automatic: there is no background job queue in
   * this codebase, and an AI call is slow/costly/fallible in a way a
   * synchronous formula recalculation is not, so wiring this into the
   * automatic dependency-graph recalculation used by formula/rollup fields
   * would block record saves on an external API call. See
   * dockers/examples/dokploy/README.md for the reasoning.
   */
  @Permissions('record|update')
  @Post('ai-generate')
  async generate(
    @Param('tableId') tableId: string,
    @Param('recordId') recordId: string,
    @Param('fieldId') fieldId: string
  ): Promise<{ value: string }> {
    const value = await this.aiFieldService.generate(tableId, recordId, fieldId);
    return { value };
  }
}
