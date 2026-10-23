import { Injectable } from '@nestjs/common';
import { createRequire } from 'node:module';

type City = { name: string; lat: string; lng: string; country: string; admin1: string };
type Region = { code: string; name: string };
const require = createRequire(import.meta.url);

@Injectable()
export class LocationService {
  private cities?: (City & { latitude: number; longitude: number })[];
  private regions?: Map<string, string>;

  nearest(latitude: number, longitude: number) {
    // GeoNames via cities.json (CC BY 4.0). Approximate nearest city, not an address.
    this.cities ??= (require('cities.json') as City[]).map((city) => ({ ...city, latitude: Number(city.lat) * Math.PI / 180, longitude: Number(city.lng) * Math.PI / 180 }));
    this.regions ??= new Map((require('cities.json/admin1') as Region[]).map((region) => [region.code, region.name]));
    const lat = latitude * Math.PI / 180;
    const lng = longitude * Math.PI / 180;
    let nearest: City | undefined;
    let distance = Infinity;
    for (const city of this.cities) {
      const d = Math.sin((city.latitude - lat) / 2) ** 2 + Math.cos(lat) * Math.cos(city.latitude) * Math.sin((city.longitude - lng) / 2) ** 2;
      if (d < distance) { distance = d; nearest = city; }
    }
    // Do not label remote locations at sea as if they belonged to a city.
    if (!nearest || 6371 * 2 * Math.asin(Math.sqrt(Math.min(distance, 1))) > 100) return {};
    return { city: nearest.name, region: this.regions.get(`${nearest.country}.${nearest.admin1}`), country: nearest.country };
  }
}
