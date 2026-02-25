// Controller for PRT bus data endpoints
// Base path: /transit

import { Request, Response } from 'express';
import Controller from './controller';
import trueTimeService from '../services/truetime.service';
import * as responses from '../../common/server.responses';

export default class BusController extends Controller {
  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    this.router.get('/routes', this.getRoutes.bind(this));
    this.router.get('/vehicles/:routeId', this.getVehicles.bind(this));
    this.router.get('/stops/:stopId/predictions', this.getPredictions.bind(this));
    this.router.get('/stops/:routeId', this.getStops.bind(this));
    this.router.get('/detours/:routeId', this.getDetours.bind(this));
  }

  // GET /transit/routes
  private async getRoutes(req: Request, res: Response): Promise<void> {
    try {
      const routes = await trueTimeService.getRoutes();
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
      const stops = await trueTimeService.getStops(routeId, direction);
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
