// CMU Shuttle route metadata and route-ID validation helpers
// Extracted from tripshot.service.ts to reduce unit size (Sigrid Item 10)

import { IAppError } from '../../common/server.responses';

export interface CMURouteMetadata {
  name: string;
  shortName: string;
  color: string;
  routeId: string; // Tripshot UUID
}

export const CMU_ROUTE_METADATA: Record<number, CMURouteMetadata> = {
  1: {
    name: 'A Route- N. Oakland / W. Shadyside',
    shortName: 'A',
    color: '#C41230',
    routeId: 'A9E22E1E-A366-4FE4-973C-871EB78E2349'
  },
  2: {
    name: 'AB Route- N. Oak & Shadyside Comb.',
    shortName: 'AB',
    color: '#8E44AD',
    routeId: '967E607E-34FD-4451-A33F-01D4B8157CD3'
  },
  3: {
    name: 'B Route- E. Shadyside',
    shortName: 'B',
    color: '#006AB3',
    routeId: '825C4CAF-C531-4DBC-B11B-F90580ABB70A'
  },
  4: {
    name: 'Bakery Square (Long)',
    shortName: 'BKL',
    color: '#FF6B35',
    routeId: 'AF900FBF-8D7B-4F7C-B8BD-D0FE1453BC19'
  },
  5: {
    name: 'Bakery Square (Short)',
    shortName: 'BKS',
    color: '#FFA630',
    routeId: '07C26A10-420F-4324-8F36-C91BC1630E9F'
  },
  6: {
    name: 'C Route- Squirrel Hill',
    shortName: 'C',
    color: '#2ECC71',
    routeId: 'A9E22E1E-A366-4FE4-973C-871EB78E2349'
  },
  7: {
    name: 'Contemporary Craft - Lawrenceville',
    shortName: 'CCL',
    color: '#9B59B6',
    routeId: 'BFF8598D-6782-4B41-8C62-D3A1E4F4B4DB'
  },
  8: {
    name: 'NightSafe Transit Blue Zone (Shadyside)',
    shortName: 'NSB',
    color: '#3498DB',
    routeId: '38C552F5-A569-446F-97E1-2F72C06EB0AD'
  },
  9: {
    name: 'NightSafe Transit Blue/Green Combined',
    shortName: 'NSBG',
    color: '#1ABC9C',
    routeId: '7F7F4951-FD17-49F4-A129-1551B04F063E'
  },
  10: {
    name: 'NightSafe Transit Green Zone (Oakland)',
    shortName: 'NSG',
    color: '#27AE60',
    routeId: 'B90432CE-5B11-4C6E-BC09-431F54ED5970'
  },
  11: {
    name: 'NightSafe Transit Red Zone (Sq. Hill 2)',
    shortName: 'NSR',
    color: '#E74C3C',
    routeId: '00A55A76-231F-4CF2-8B89-F6DBD518C117'
  },
  12: {
    name: 'NightSafe Transit Red/Yellow Combined',
    shortName: 'NSRY',
    color: '#F39C12',
    routeId: 'CB8AD8C3-6F50-4CD5-888E-84DD11A1E95B'
  },
  13: {
    name: 'NightSafe Transit Yellow Zone (Sq. Hill 1)',
    shortName: 'NSY',
    color: '#F1C40F',
    routeId: 'D156D457-473E-405F-AF31-22E9A44AD2F2'
  },
  14: {
    name: 'PTC',
    shortName: 'PTC',
    color: '#34495E',
    routeId: 'D2DBA04E-C0EA-4BDD-BFEE-4A89612087FD'
  },
  15: {
    name: 'PTC & Mill 19',
    shortName: 'PTC19',
    color: '#7F8C8D',
    routeId: 'D73A82B6-627D-405B-9431-421535F4E021'
  }
};

/**
 * Extract and validate the numeric route index from a "CMU-{n}" route ID.
 * Returns the index and its metadata, or throws an IAppError if invalid.
 */
export function extractRouteIndex(routeId: string): {
  index: number;
  metadata: CMURouteMetadata;
} {
  const match = routeId.match(/^CMU-(\d+)$/);
  if (!match) {
    const error: IAppError = {
      type: 'ClientError',
      name: 'RouteNotFound',
      message: `Invalid CMU route ID format: ${routeId}`
    };
    throw error;
  }

  const index = parseInt(match[1]);
  const metadata = CMU_ROUTE_METADATA[index];
  if (!metadata) {
    const error: IAppError = {
      type: 'ClientError',
      name: 'RouteNotFound',
      message: `CMU route ${routeId} not found`
    };
    throw error;
  }

  return { index, metadata };
}
