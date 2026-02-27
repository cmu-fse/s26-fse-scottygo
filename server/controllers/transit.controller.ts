// Controller for PRT bus data endpoints
// Base path: /transit

import { Request, Response } from 'express';
import Controller from './controller';
import trueTimeService from '../services/truetime.service';
<<<<<<< HEAD
import gtfsService from '../services/gtfs.service';
=======
>>>>>>> 2aed65f897d3ce959316e0ee58d641946437c976
import * as responses from '../../common/server.responses';

export default class BusController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    this.router.get('/routes', this.getRoutes.bind(this));
<<<<<<< HEAD
    this.router.post('/routes/available', this.filterRoutesByDateTime.bind(this));
    this.router.get('/routes/:id', this.getPatterns.bind(this));
    this.router.get('/vehicles/:routeId', this.getVehicles.bind(this));
    this.router.get('/stops/:routeId', this.getStops.bind(this));
    this.router.get('/stops/:stopId/predictions', this.getPredictions.bind(this));
    this.router.get('/detours/:routeId', this.getDetours.bind(this));
  }

  // GET /transit/routes?system=PRT|CMU
  private async getRoutes(req: Request, res: Response): Promise<void> {
    const systemParam = req.query.system as string | undefined;

    try {
      let routes = await trueTimeService.getRoutes();

      if (systemParam) {
        routes = routes.filter((r) => r.system === systemParam);
      }

=======
    this.router.get('/vehicles/:routeId', this.getVehicles.bind(this));
    this.router.get('/stops/:stopId/predictions', this.getPredictions.bind(this));
    this.router.get('/stops/:routeId', this.getStops.bind(this));
    this.router.get('/detours/:routeId', this.getDetours.bind(this));
  }

  // GET /transit/routes
  private async getRoutes(req: Request, res: Response): Promise<void> {
    try {
      const routes = await trueTimeService.getRoutes();
>>>>>>> 2aed65f897d3ce959316e0ee58d641946437c976
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

<<<<<<< HEAD
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
      let patterns = await trueTimeService.getPatterns(id).catch(() => null);

      // A2 fallback: if TrueTime failed or returned nothing, use GTFS static geometry
      if ((!patterns || patterns.length === 0) && gtfsService.isLoaded()) {
        patterns = gtfsService.getPatterns(id);
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

=======
>>>>>>> 2aed65f897d3ce959316e0ee58d641946437c976
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
<<<<<<< HEAD
      let stops = await trueTimeService.getStops(routeId, direction).catch(() => null);

      // A2 fallback: if TrueTime failed or returned nothing, use GTFS static stops
      // Note: GTFS stops are not filtered by direction
      if ((!stops || stops.length === 0) && gtfsService.isLoaded()) {
        stops = gtfsService.getStops(routeId);
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

=======
      const stops = await trueTimeService.getStops(routeId, direction);
>>>>>>> 2aed65f897d3ce959316e0ee58d641946437c976
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
      const vehicles = await trueTimeService.getVehicles(routeId);
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
  private async getPredictions(req: Request, res: Response): Promise<void> {
    const { stopId } = req.params;
    try {
      const predictions = await trueTimeService.getPredictions(stopId);
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
      const detours = await trueTimeService.getDetours([routeId]);
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
    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      'name' in error
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
    const serverError: responses.IAppError = {
      type: 'ServerError',
      name: 'GetRequestFailure',
      message: 'An unexpected error occurred'
    };
    res.status(500).json(serverError);
  }
}
