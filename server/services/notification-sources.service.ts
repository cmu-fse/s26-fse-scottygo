import { TransitModel } from '../models/transit.model';
import type { IRoute, IVehicle } from '../../common/transit.interface';
import tripshotService from './tripshot.service';
import vehiclePositionsService from './vehicle-positions.service';

class NotificationSourcesService {
  async getAllSubscribableRoutes(): Promise<IRoute[]> {
    const prtRoutes = await TransitModel.getRoutes();
    if (!tripshotService.isConfigured()) return prtRoutes;

    const cmuRoutes = await tripshotService.getRoutes().catch(() => []);
    return prtRoutes.concat(cmuRoutes);
  }

  async getSubscribableRouteIds(): Promise<Set<string>> {
    const routeIds = new Set<string>();
    const routes = await this.getAllSubscribableRoutes();
    for (const route of routes) routeIds.add(route.id);
    return routeIds;
  }

  async getVehiclesForRoute(routeId: string): Promise<IVehicle[]> {
    if (routeId.startsWith('CMU-')) {
      return tripshotService.getVehicles(routeId).catch(() => []);
    }
    return vehiclePositionsService.getVehicles(routeId);
  }

  async getAllLiveVehiclesForNotifications(): Promise<IVehicle[]> {
    const prtVehicles = vehiclePositionsService.getAllVehicles();
    if (!tripshotService.isConfigured()) return prtVehicles;

    const cmuRoutes = await tripshotService.getRoutes().catch(() => []);
    const cmuVehicles = (
      await Promise.all(
        cmuRoutes.map((route) => tripshotService.getVehicles(route.id))
      )
    ).flat();

    return prtVehicles.concat(cmuVehicles);
  }
}

export default new NotificationSourcesService();
