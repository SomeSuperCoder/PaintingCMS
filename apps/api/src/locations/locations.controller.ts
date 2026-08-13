/**
 * LocationsController — HTTP surface for the location bank (contract
 * API_PATHS.locations / API_PATHS.location, locations spec).
 * ============================================================================
 * Every route composes @UseGuards(AuthGuard, OwnershipGuard): AuthGuard
 * validates initData and attaches request.user (the global APP_GUARD already
 * ran; composing it here makes the ownership dependency explicit, matching the
 * ownership controller), OwnershipGuard restricts to the current owner (403
 * ACCESS_DENIED for everyone else).
 *
 * Routes are declared relative to the global `/api/v1` prefix (main.ts) →
 * GET/POST `/api/v1/locations`, PATCH/DELETE `/api/v1/locations/:id`.
 * `:id` is parsed as an integer by ParseIntPipe — non-numeric ids fail as a
 * 400 VALIDATION_ERROR via the global filter. All bodies are validated by the
 * global ValidationPipe against the locations DTOs.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { type LocationDto } from '@painting/shared';
import { AuthGuard } from '../auth/auth.guard';
import { OwnershipGuard } from '../ownership/ownership.guard';
import {
  LocationCreateRequestDto,
  LocationUpdateRequestDto,
} from './locations.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  /** GET /api/v1/locations — all locations, stable createdAt order (LocationDto[]). */
  @Get()
  @UseGuards(AuthGuard, OwnershipGuard)
  async findAll(): Promise<LocationDto[]> {
    return this.service.findAll();
  }

  /** POST /api/v1/locations — create (offline address or online http/https URL). 201 LocationDto. */
  @Post()
  @UseGuards(AuthGuard, OwnershipGuard)
  async create(@Body() body: LocationCreateRequestDto): Promise<LocationDto> {
    return this.service.create(body);
  }

  /** PATCH /api/v1/locations/:id — partial update. 404 NOT_FOUND when missing. */
  @Patch(':id')
  @UseGuards(AuthGuard, OwnershipGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: LocationUpdateRequestDto,
  ): Promise<LocationDto> {
    return this.service.update(id, body);
  }

  /** DELETE /api/v1/locations/:id — 204 on success, 404 when missing, 409 LOCATION_IN_USE when paintings reference it. */
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard, OwnershipGuard)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.service.remove(id);
  }
}
