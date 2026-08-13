/**
 * PaintingsController — /api/v1/paintings surface (contract ENDPOINTS).
 * ============================================================================
 * Every route composes (AuthGuard, OwnershipGuard) — the ownership module's
 * established pattern: AuthGuard validates initData and attaches the
 * identity, OwnershipGuard enforces the single-owner gate. Controller-level
 * @UseGuards covers all five routes (there is no public route here), which is
 * DRYer than the ownership controller's per-route repetition — same semantics.
 *
 * The global ValidationPipe (main.ts, whitelist + forbidNonWhitelisted +
 * transform) runs the DTO validation BEFORE this layer, so handlers receive
 * validated, typed bodies; its exceptionFactory already emits the contract
 * 400 envelope with per-field Russian messages.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  API_PATHS,
  type PaintingDto,
  type PaintingListItemDto,
} from '@painting/shared';

import { AuthGuard } from '../auth/auth.guard';
import { OwnershipGuard } from '../ownership/ownership.guard';
// VALUE imports, not `import type`: Nest's design:paramtypes metadata needs the
// real class reference so the global ValidationPipe sees the class-validator
// decorators. With `import type` the metadata was undefined and POST/PATCH
// bodies shipped unvalidated (integration regression: missing name → 404,
// non-numeric locationId → NaN → 500) — the pipe now 400s invalid bodies first.
import { PaintingCreateDto } from './dto/painting-create.dto';
import { PaintingUpdateDto } from './dto/painting-update.dto';
import { PaintingsService } from './paintings.service';

@Controller('paintings')
@UseGuards(AuthGuard, OwnershipGuard)
export class PaintingsController {
  constructor(private readonly service: PaintingsService) {}

  /** GET /api/v1/paintings — newest first, first photo + location summary per row. */
  @Get()
  list(): Promise<PaintingListItemDto[]> {
    return this.service.list();
  }

  /** POST /api/v1/paintings — 201 + Location header (contract), full detail body. */
  @Post()
  async create(
    @Body() dto: PaintingCreateDto,
    // passthrough keeps Nest's serialization while letting us set the
    // contract's Location header dynamically (RFC 7231 allows relative URIs).
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaintingDto> {
    const painting = await this.service.create(dto);
    res.setHeader('Location', API_PATHS.painting(painting.id));
    return painting;
  }

  /** GET /api/v1/paintings/:id — full detail: all photos (gallery order) + location. */
  @Get(':id')
  get(@Param('id') id: string): Promise<PaintingDto> {
    return this.service.getDetail(id);
  }

  /** PATCH /api/v1/paintings/:id — partial update, returns the updated detail. */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: PaintingUpdateDto,
  ): Promise<PaintingDto> {
    return this.service.update(id, dto);
  }

  /** DELETE /api/v1/paintings/:id — 204 No Content (photo rows cascade in DB). */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }
}
