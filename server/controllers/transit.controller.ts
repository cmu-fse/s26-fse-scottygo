// Controller for PRT bus data endpoints
// Base path: /transit

import { Request, Response } from 'express';
import Controller from './controller';
import tripshotService from '../services/tripshot.service';
import vehiclePositionsService from '../services/vehicle-positions.service';
import tripUpdatesService from '../services/trip-updates.service';
import { TransitModel } from '../models/transit.model';
import gtfsService from '../services/gtfs.service';
import * as responses from '../../common/server.responses';
import { IRoute, IVehicle } from '../../common/transit.interface';

export default class BusController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    this.router.get('/health', this.getHealth.bind(this));
    this.router.get('/bulk', this.getBulkData.bind(this));
    this.router.get('/routes', this.getRoutes.bind(this));
    this.router.post('/routes/available', this.filterRoutesByDateTime.bind(this));
    this.router.get('/routes/:id', this.getPatterns.bind(this));
    this.router.get('/vehicles/:routeId', this.getVehicles.bind(this));
    this.router.get('/stops/:routeId', this.getStops.bind(this));
    this.router.get('/stops/:stopId/predictions', this.getPredictions.bind(this));
    this.router.get('/detours/:routeId', this.getDetours.bind(this));
  }

  // GET /transit/health — service health status for the frontend
  private getHealth(_req: Request, res: Response): void {
    const vehiclesHealthy = vehiclePositionsService.isHealthy();
    const tripsHealthy = tripUpdatesService.isHealthy();
    const colorsAvailable = TransitModel.colorsAvailable;

    const status = {
      vehiclePositions: {
        healthy: vehiclesHealthy,
        lastFetched: vehiclePositionsService.getLastFetched()?.toISOString() ?? null,
        consecutiveFailures: vehiclePositionsService.getConsecutiveFailures(),
        error: vehiclePositionsService.getLastError()
      },
      tripUpdates: {
        healthy: tripsHealthy,
        lastFetched: tripUpdatesService.getLastFetched()?.toISOString() ?? null,
        consecutiveFailures: tripUpdatesService.getConsecutiveFailures(),
        error: tripUpdatesService.getLastError()
      },
      trueTimeColors: {
        available: colorsAvailable
      },
      overall: vehiclesHealthy && tripsHealthy
    };

    res.status(200).json(status);
  }

  // GET /transit/bulk — all routes, patterns, and stops in one response
  private async getBulkData(_req: Request, res: Response): Promise<void> {
    try {
      const bulk = await TransitModel.getAllTransitData();
      const successRes: responses.ISuccess = {
        name: 'BulkDataRetrieved',
        message: `All transit data: ${bulk.routes.length} routes`,
        payload: bulk
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/routes?system=PRT|CMU
  private async getRoutes(req: Request, res: Response): Promise<void> {
    const systemParam = req.query.system as string | undefined;

    try {
      const routes: IRoute[] = [];

      // Fetch PRT routes if no system filter or PRT is requested
      if (!systemParam || systemParam === 'PRT') {
        const prtRoutes = await TransitModel.getRoutes();
        routes.push(...prtRoutes);
      }

      // Fetch CMU routes if no system filter or CMU is requested
      if (!systemParam || systemParam === 'CMU') {
        if (tripshotService.isConfigured()) {
          const cmuRoutes = await tripshotService.getRoutes();
          routes.push(...cmuRoutes);
        } else {
          console.warn('[Tripshot] Service not configured, skipping CMU routes');
        }
      }

      const successRes: responses.ISuccess = {
        name: 'RoutesRetrieved',
        message: `Found ${routes.length} routes`,
        payload: routes
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // POST /transit/routes/available
  // Body: { date: string (YYYY-MM-DD), time?: string (HH:MM) }
  private async filterRoutesByDateTime(req: Request, res: Response): Promise<void> {
    const { date, time } = req.body as { date?: string; time?: string };

    if (!date) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingParameter',
        message: 'Request body must include "date" (YYYY-MM-DD)'
      };
      res.status(400).json(errorRes);
      return;
    }

    try {
      const routes = time
        ? gtfsService.filterRoutesByDateTime(new Date(date), time)
        : gtfsService.filterRoutesByDate(new Date(date));

      const successRes: responses.ISuccess = {
        name: 'RoutesRetrieved',
        message: `Found ${routes.length} routes`,
        payload: routes
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/routes/:id
  private async getPatterns(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      let patterns = null;

      // Check if this is a CMU route
      if (id.startsWith('CMU-')) {
        if (tripshotService.isConfigured()) {
          patterns = await tripshotService.getPatterns(id).catch(() => null);
        } else {
          const err: responses.IAppError = {
            type: 'ServerError',
            name: 'ServiceUnavailable',
            message: 'CMU Shuttle tracking service not configured'
          };
          res.status(451).json(err);
          return;
        }
      } else {
        // PRT route — served from GTFS cache in MongoDB
        patterns = await TransitModel.getPatterns(id);
      }

      if (!patterns || patterns.length === 0) {
        const err: responses.IAppError = {
          type: 'ClientError',
          name: 'RouteNotFound',
          message: `No geometry found for route ${id}`
        };
        res.status(404).json(err);
        return;
      }

      const successRes: responses.ISuccess = {
        name: 'PathGenerated',
        message: `Found ${patterns.length} patterns for route ${id}`,
        payload: patterns
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/stops/:routeId?dir=INBOUND|OUTBOUND
  private async getStops(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    const direction = (req.query.dir as string | undefined)?.toUpperCase();

    if (!direction) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingParameter',
        message: 'Query parameter "dir" is required (INBOUND or OUTBOUND)'
      };
      res.status(400).json(errorRes);
      return;
    }

    try {
      let stops = null;

      // Check if this is a CMU route
      if (routeId.startsWith('CMU-')) {
        if (tripshotService.isConfigured()) {
          stops = await tripshotService.getStops(routeId, direction).catch(() => null);
        }
      } else {
        // PRT route — served from GTFS cache in MongoDB
        stops = await TransitModel.getStops(routeId, direction);
      }

      if (!stops || stops.length === 0) {
        const err: responses.IAppError = {
          type: 'ClientError',
          name: 'StopNotFound',
          message: `No stops found for route ${routeId}`
        };
        res.status(404).json(err);
        return;
      }

      const successRes: responses.ISuccess = {
        name: 'StopsRetrieved',
        message: `Found ${stops.length} stops for route ${routeId} ${direction}`,
        payload: stops
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/vehicles/:routeId
  private async getVehicles(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    try {
      let vehicles: IVehicle[] = [];

      // Check if this is a CMU route
      if (routeId.startsWith('CMU-')) {
        if (tripshotService.isConfigured()) {
          vehicles = await tripshotService.getVehicles(routeId);
        }
      } else {
        // PRT route — read from the in-memory GTFS-RT store (updated every 30s)
        vehicles = vehiclePositionsService.getVehicles(routeId);
      }

      const successRes: responses.ISuccess = {
        name: 'VehiclesLocated',
        message: `Found ${vehicles.length} vehicles on route ${routeId}`,
        payload: vehicles
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/stops/:stopId/predictions
  private getPredictions(req: Request, res: Response): void {
    const { stopId } = req.params;
    try {
      const predictions = tripUpdatesService.getPredictions(stopId);
      const successRes: responses.ISuccess = {
        name: 'PredictionsRetrieved',
        message: `Found ${predictions.length} predictions for stop ${stopId}`,
        payload: predictions
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/detours/:routeId
  private async getDetours(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    try {
      const detours = await TransitModel.getDetours([routeId]);
      const successRes: responses.ISuccess = {
        name: 'DetoursRetrieved',
        message: `Found ${detours.length} detours for route ${routeId}`,
        payload: detours
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // -------------------------------------------------------------------------

  private handleError(error: unknown, res: Response): void {
    // Log the actual error for debugging
    console.error('[Transit Controller] Error:', error);
    
    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      'name' in error &&
      'message' in error
    ) {
      const appError = error as responses.IAppError;
      const status =
        appError.type === 'ClientError'
          ? appError.name === 'RouteNotFound' || appError.name === 'StopNotFound'
            ? 404
            : 400
          : 500;
      res.status(status).json(appError);
      return;
    }
    
    // Handle generic Error instances
    if (error instanceof Error) {
      console.error('[Transit Controller] Unexpected Error:', error.message, error.stack);
    }
    
    const serverError: responses.IAppError = {
      type: 'ServerError',
      name: 'GetRequestFailure',
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    };
    res.status(500).json(serverError);
  }
}
